require('dotenv').config();

const express = require('express');
const crypto = require('crypto');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 10000;
const TZ = process.env.TIMEZONE || 'Asia/Taipei';
const RETRIES = Number(process.env.GOOGLE_API_MAX_RETRIES || 4);
const SNAPSHOT_TTL = Number(process.env.SHEETS_SNAPSHOT_TTL_MS || 15000);

for (const key of ['LINE_CHANNEL_SECRET','LINE_CHANNEL_ACCESS_TOKEN','GOOGLE_SHEET_ID','GOOGLE_SERVICE_ACCOUNT_JSON']) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}
const LINE_SECRET=process.env.LINE_CHANNEL_SECRET;
const LINE_TOKEN=process.env.LINE_CHANNEL_ACCESS_TOKEN;
const SHEET_ID=process.env.GOOGLE_SHEET_ID;

let creds;
try { creds=JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON); }
catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.'); }

const auth=new google.auth.GoogleAuth({
  credentials:creds,
  scopes:['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets=google.sheets({version:'v4',auth});

app.use(express.json({verify:(req,_res,buf)=>{req.rawBody=buf;}}));

const cache={snapshot:null,expiresAt:0,inFlight:null,locks:new Map()};
const logBuffer=[]; let logTimer=null;

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function norm(v){return String(v??'').trim().replace(/\s+/g,'');}
function splitStudents(v){return String(v||'').split('、').map(s=>s.trim()).filter(Boolean);}
function uniq(a){return [...new Set(a)];}
function esc(n){return `'${String(n).replace(/'/g,"''")}'`;}
function col(n){let s='';while(n>0){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26);}return s;}
function nowTaipei(){return new Intl.DateTimeFormat('sv-SE',{timeZone:TZ,dateStyle:'short',timeStyle:'medium',hour12:false}).format(new Date());}
function futureTaipei(min){return new Intl.DateTimeFormat('sv-SE',{timeZone:TZ,dateStyle:'short',timeStyle:'medium',hour12:false}).format(new Date(Date.now()+min*60000));}
function parseLocal(v){return v?Date.parse(`${String(v).replace(' ','T')}+08:00`):NaN;}
function hmap(h){return Object.fromEntries((h||[]).map((x,i)=>[String(x),i]));}

function retryable(e){
  const s=Number(e?.code||e?.response?.status||0),m=String(e?.message||'');
  return [429,500,502,503,504].includes(s)||/quota exceeded|rate limit|temporarily unavailable|backend error/i.test(m);
}
async function retry(label,fn){
  let last;
  for(let i=0;i<=RETRIES;i++){
    try{return await fn();}catch(e){last=e;if(!retryable(e)||i>=RETRIES)throw e;
      const wait=Math.min(10000,600*(2**i))+Math.floor(Math.random()*300);
      console.warn(`${label}: retry ${i+1}/${RETRIES} after ${wait}ms`);await sleep(wait);}
  } throw last;
}

function detectHeaderRow(rows, required){
  const need=(required||[]).map(String);
  for(let i=0;i<(rows||[]).length;i++){
    const set=new Set((rows[i]||[]).map(x=>String(x).trim()));
    if(need.every(x=>set.has(x))) return i;
  }
  return -1;
}

function detectHeaderRow(rows, required){
  const need=(required||[]).map(String);
  for(let i=0;i<(rows||[]).length;i++){
    const set=new Set((rows[i]||[]).map(x=>String(x).trim()));
    if(need.every(x=>set.has(x))) return i;
  }
  return -1;
}

async function readSnapshot(force=false){
  if(!force && cache.snapshot && cache.expiresAt>Date.now()) return cache.snapshot;
  if(cache.inFlight) return cache.inFlight;
  cache.inFlight=retry('snapshot batchGet',async()=>{
    const ranges=[
      `${esc('聯絡人')}!A:Z`,
      `${esc('綁定暫存')}!A:D`,
      `${esc('LINE互動狀態')}!A:E`,
      `${esc('系統設定')}!A:D`,
    ];
    const r=await sheets.spreadsheets.values.batchGet({spreadsheetId:SHEET_ID,ranges,majorDimension:'ROWS'});
    const contacts=r.data.valueRanges?.[0]?.values||[];
    const settings=r.data.valueRanges?.[3]?.values||[];
    return {
      contacts,
      contactsHeaderRow:detectHeaderRow(contacts,['姓名','身分','LINE User ID']),
      bindings:r.data.valueRanges?.[1]?.values||[],
      interactions:r.data.valueRanges?.[2]?.values||[],
      settings,
      settingsHeaderRow:detectHeaderRow(settings,['設定項目','目前值'])
    };
  }).then(s=>{cache.snapshot=s;cache.expiresAt=Date.now()+SNAPSHOT_TTL;cache.inFlight=null;return s;})
    .catch(e=>{cache.inFlight=null;throw e;});
  return cache.inFlight;
}

async function appendRows(sheet,rows){
  if(!rows.length)return;
  return retry(`append ${sheet}`,()=>sheets.spreadsheets.values.append({
    spreadsheetId:SHEET_ID,range:`${esc(sheet)}!A:Z`,
    valueInputOption:'USER_ENTERED',insertDataOption:'INSERT_ROWS',
    requestBody:{values:rows}
  }));
}
async function update(sheet,range,values){
  return retry(`update ${sheet}`,()=>sheets.spreadsheets.values.update({
    spreadsheetId:SHEET_ID,range:`${esc(sheet)}!${range}`,
    valueInputOption:'USER_ENTERED',requestBody:{values}
  }));
}
async function ensureSheets(){
  const required=[
    ['綁定暫存',['LINE User ID','狀態','資料 JSON','更新時間']],
    ['LINE互動狀態',['LINE User ID','模式','喚醒時間','到期時間','最後訊息時間']],
    ['Webhook紀錄',['時間','LINE User ID','LINE 顯示名稱','事件類型','訊息類型','訊息內容','Reply Token','配對狀態']],
  ];
  const meta=await retry('metadata',()=>sheets.spreadsheets.get({spreadsheetId:SHEET_ID,fields:'sheets.properties.title'}));
  const titles=new Set((meta.data.sheets||[]).map(x=>x.properties?.title));
  const missing=required.filter(([n])=>!titles.has(n));
  if(!missing.length)return;
  try{
    await retry('create core sheets',()=>sheets.spreadsheets.batchUpdate({
      spreadsheetId:SHEET_ID,
      requestBody:{requests:missing.map(([title])=>({addSheet:{properties:{title}}}))}
    }));
  }catch(e){if(!/already exists/i.test(String(e?.message||'')))throw e;}
  for(const [title,headers] of missing)try{await update(title,`A1:${col(headers.length)}1`,[headers]);}catch(e){console.warn(`init ${title}:`,e.message);}
}

function queueLog(row){
  logBuffer.push(row);
  if(logBuffer.length>=10) void flushLogs();
  else if(!logTimer) logTimer=setTimeout(()=>{logTimer=null;void flushLogs();},1500);
}
async function flushLogs(){
  if(!logBuffer.length)return;
  const rows=logBuffer.splice(0,logBuffer.length);
  try{await appendRows('Webhook紀錄',rows);}catch(e){console.error('Webhook log flush:',e.message);}
}

async function lineReply(replyToken,text){
  const r=await fetch('https://api.line.me/v2/bot/message/reply',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${LINE_TOKEN}`},
    body:JSON.stringify({replyToken,messages:[{type:'text',text}]})
  });
  const body=await r.text(); if(!r.ok)throw new Error(`LINE reply ${r.status}: ${body}`);
}
async function profile(userId){
  const r=await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`,{headers:{Authorization:`Bearer ${LINE_TOKEN}`}});
  return r.ok?r.json():null;
}
function sigOK(req){
  const sig=req.headers['x-line-signature'];if(!sig||!req.rawBody)return false;
  const digest=crypto.createHmac('sha256',LINE_SECRET).update(req.rawBody).digest('base64');
  try{return crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(digest));}catch{return false;}
}

function settingsMap(s){const rows=s.settings||[];const hi=Number.isInteger(s.settingsHeaderRow)&&s.settingsHeaderRow>=0?s.settingsHeaderRow:detectHeaderRow(rows,['設定項目','目前值']);const o={};for(let i=hi+1;i<rows.length;i++){const r=rows[i]||[];if(r[0])o[String(r[0])]=String(r[1]||'');}return o;}
function findBinding(s,uid){
  for(let i=1;i<(s.bindings||[]).length;i++){const r=s.bindings[i]||[];if(norm(r[0])===norm(uid)){let d={};try{d=JSON.parse(r[2]||'{}')}catch{}return {row:i+1,status:r[1]||'',data:d};}}
  return null;
}
function findInteraction(s,uid){
  for(let i=1;i<(s.interactions||[]).length;i++){const r=s.interactions[i]||[];if(norm(r[0])===norm(uid))return {row:i+1,mode:r[1]||'安靜模式',expireAt:r[3]||''};}
  return null;
}
function awake(s,uid){const x=findInteraction(s,uid);return !!x&&x.mode==='互動模式'&&Number.isFinite(parseLocal(x.expireAt))&&Date.now()<parseLocal(x.expireAt);}

async function saveBinding(s,uid,status,data){
  const old=findBinding(s,uid), row=[uid,status,JSON.stringify(data||{}),nowTaipei()];
  if(old){await update('綁定暫存',`A${old.row}:D${old.row}`,[row]);s.bindings[old.row-1]=row;}
  else{await appendRows('綁定暫存',[row]);s.bindings.push(row);}
  cache.snapshot=s;cache.expiresAt=Date.now()+SNAPSHOT_TTL;
}
async function saveInteraction(s,uid,mode,wake,expire){
  const old=findInteraction(s,uid), row=[uid,mode,wake||'',expire||'',nowTaipei()];
  if(old){await update('LINE互動狀態',`A${old.row}:E${old.row}`,[row]);s.interactions[old.row-1]=row;}
  else{await appendRows('LINE互動狀態',[row]);s.interactions.push(row);}
  cache.snapshot=s;cache.expiresAt=Date.now()+SNAPSHOT_TTL;
}
async function upsertContact(s,{uid,role,lineName,enteredName,students}){
  const rows=s.contacts||[];
  const headerRow=Number.isInteger(s.contactsHeaderRow)?s.contactsHeaderRow:detectHeaderRow(rows,['姓名','身分','LINE User ID']);
  if(headerRow<0)throw new Error('聯絡人工作表找不到欄位標題列。請確認至少包含：姓名、身分、LINE User ID。');
  const headers=(rows[headerRow]||[]).map(String);
  const idx={name:headers.indexOf('姓名'),role:headers.indexOf('身分'),student:headers.indexOf('學生姓名/關聯（可多位）')>=0?headers.indexOf('學生姓名/關聯（可多位）'):headers.indexOf('學生姓名/關聯'),line:headers.indexOf('LINE User ID'),status:headers.indexOf('綁定狀態'),time:headers.indexOf('最後綁定時間'),active:headers.indexOf('通知啟用')>=0?headers.indexOf('通知啟用'):headers.indexOf('啟用')};
  const missing=[];for(const [k,title] of [['name','姓名'],['role','身分'],['student','學生姓名/關聯'],['line','LINE User ID'],['status','綁定狀態'],['time','最後綁定時間']])if(idx[k]<0)missing.push(title);
  if(missing.length)throw new Error(`聯絡人標題列缺少欄位：${missing.join('、')}`);
  let rowNo=null;for(let i=headerRow+1;i<rows.length;i++)if(norm(rows[i]?.[idx.line])===norm(uid)){rowNo=i+1;break;}
  const width=Math.max(headers.length,9), row=Array(width).fill('');
  const source=rowNo?(rows[rowNo-1]||[]):[];for(let i=0;i<Math.min(source.length,width);i++)row[i]=source[i]||'';
  row[idx.name]=lineName||row[idx.name]||'';row[idx.role]=role;row[idx.student]=role==='老師'?(enteredName||row[idx.student]||''):uniq(students||[]).join('、');row[idx.line]=uid;row[idx.status]='已綁定';row[idx.time]=nowTaipei();if(idx.active>=0)row[idx.active]='是';
  if(rowNo){await update('聯絡人',`A${rowNo}:${col(row.length)}${rowNo}`,[row]);rows[rowNo-1]=row;}else{await appendRows('聯絡人',[row]);rows.push(row);}
  s.contacts=rows;s.contactsHeaderRow=headerRow;cache.snapshot=s;cache.expiresAt=Date.now()+SNAPSHOT_TTL;
}

function welcome(keyword){return `您好，歡迎加入！\n\n本官方 LINE 可提供課程提醒、LINE 帳號綁定及相關服務。\n\n如需使用自動服務，請輸入：「${keyword}」\n\n平常留言會先記錄，不會自動回覆。`;}
function menu(min){return `您好，請選擇您要使用的功能：\n\n① LINE 綁定\n② 課程查詢\n③ 繳費／收據\n④ 人工客服\n\n互動模式將維持 ${min} 分鐘。\n輸入「取消」可離開互動模式。`;}
function parentPrompt(){return '家長您好，請輸入學生姓名。\n\n如果只有一位學生，請輸入一個姓名。\n如果有兩位以上學生，請使用「、」隔開。\n\n例如：蔡時明\n\n或：蔡時明、蔡小華';}
function teacherPrompt(){return '老師您好，請輸入您在系統登記的姓名。\n\n例如：王小明';}
function parentConfirm(names){return `請確認您剛才輸入的學生姓名：\n\n${names.map((x,i)=>`${i+1}. ${x}`).join('\n')}\n\n以上資料是正確的嗎？\n\n請回覆：「確認」或「重新輸入」`;}
function teacherConfirm(name){return `請確認您剛才輸入的姓名：\n\n姓名：${name}\n\n以上資料是正確的嗎？\n\n請回覆：「確認」或「重新輸入」`;}

app.get('/health',(_req,res)=>res.json({
  ok:true,service:'line-bulk-notification-v4',timezone:TZ,googleApiRetry:RETRIES,snapshotTtlMs:SNAPSHOT_TTL
}));

app.post('/webhook',async(req,res)=>{
  if(!sigOK(req))return res.status(401).send('Invalid signature');
  res.status(200).send('OK');
  for(const event of req.body?.events||[]){
    const uid=event.source?.userId;if(!uid)continue;
    const prev=cache.locks.get(uid)||Promise.resolve();let release;
    const current=new Promise(r=>release=r);cache.locks.set(uid,current);
    prev.then(async()=>{
      const s=await readSnapshot();
      let lineName='';try{lineName=(await profile(uid))?.displayName||'';}catch{}
      if(event.type==='follow'){
        const sm=settingsMap(s), kw=sm['歡迎訊息後提示詞']||sm['喚醒關鍵詞']||'選單';
        await saveBinding(s,uid,'WAIT_ROLE',{});await saveInteraction(s,uid,'安靜模式','','');
        queueLog([nowTaipei(),uid,lineName,'follow','','',event.replyToken||'','安靜模式']);
        if(event.replyToken&&sm['加入好友歡迎訊息']!=='否')await lineReply(event.replyToken,welcome(kw));
        return;
      }
      if(event.type!=='message'||event.message?.type!=='text')return;
      const text=String(event.message.text||'').trim();queueLog([nowTaipei(),uid,lineName,'message','text',text,event.replyToken||'','收到']);
      const sm=settingsMap(s), mode=sm['自動回覆模式']||'關鍵詞喚醒', kw=sm['喚醒關鍵詞']||'選單', minutes=Number(sm['互動模式分鐘數']||10)||10;

      if(text===kw||text==='功能選單'){await saveInteraction(s,uid,'互動模式',nowTaipei(),futureTaipei(minutes));if(event.replyToken)await lineReply(event.replyToken,menu(minutes));return;}
      if(text==='取消'||text==='取消互動'){await saveInteraction(s,uid,'安靜模式','','');await saveBinding(s,uid,'WAIT_ROLE',{});if(event.replyToken)await lineReply(event.replyToken,'已離開互動模式。一般訊息不會自動回覆；如需服務，請輸入「選單」。');return;}

      // Menu options must be handled BEFORE binding-state processing.
      // Otherwise a fresh user in WAIT_ROLE would send "1" and get no reply.
      if(mode==='關閉')return;
      if(mode==='關鍵詞喚醒'&&!awake(s,uid))return;

      if(text==='1'||text==='LINE綁定'||text==='綁定'||text==='開始綁定'||text==='重新綁定'){
        await saveBinding(s,uid,'WAIT_ROLE',{});
        await saveInteraction(s,uid,'互動模式',nowTaipei(),futureTaipei(minutes));
        if(event.replyToken)await lineReply(event.replyToken,'好的，開始 LINE 綁定。\n\n請先輸入您的身分：\n「家長」或「老師」\n\n這不需要提供學生姓名。');
        return;
      }

      if(text==='2'||text==='課程查詢'){if(event.replyToken)await lineReply(event.replyToken,'目前課程查詢服務尚未啟用，請諮詢人工客服。');return;}
      if(text==='3'||text==='繳費／收據'||text==='繳費/收據'){if(event.replyToken)await lineReply(event.replyToken,'目前繳費／收據服務尚未啟用，請諮詢人工客服。');return;}
      if(text==='4'||text==='人工客服'){if(event.replyToken)await lineReply(event.replyToken,'已進入人工客服服務，請直接留言。');return;}

      const state=findBinding(s,uid), status=state?.status||'WAIT_ROLE';

      if(status==='WAIT_ROLE'){
        if(text==='家長'){await saveBinding(s,uid,'WAIT_PARENT_STUDENT_NAMES',{role:'家長'});if(event.replyToken)await lineReply(event.replyToken,parentPrompt());return;}
        if(text==='老師'){await saveBinding(s,uid,'WAIT_TEACHER_NAME',{role:'老師'});if(event.replyToken)await lineReply(event.replyToken,teacherPrompt());return;}
      }
      if(status==='WAIT_PARENT_STUDENT_NAMES'){
        const names=uniq(splitStudents(text));if(!names.length){if(event.replyToken)await lineReply(event.replyToken,parentPrompt());return;}
        await saveBinding(s,uid,'WAIT_PARENT_CONFIRM',{role:'家長',studentNames:names});if(event.replyToken)await lineReply(event.replyToken,parentConfirm(names));return;
      }
      if(status==='WAIT_PARENT_CONFIRM'){
        if(text==='重新輸入'){await saveBinding(s,uid,'WAIT_PARENT_STUDENT_NAMES',{role:'家長'});if(event.replyToken)await lineReply(event.replyToken,parentPrompt());return;}
        if(text!=='確認'){if(event.replyToken)await lineReply(event.replyToken,'請回覆「確認」或「重新輸入」。');return;}
        const names=state?.data?.studentNames||[];
        try{
          try{await upsertContact(s,{uid,role:'家長',lineName,enteredName:'',students:names});}catch(e){console.error('Parent binding save error:',e);if(event.replyToken)await lineReply(event.replyToken,'綁定資料寫入失敗，請稍後再試；若持續發生請聯絡管理員。');return;}
        }catch(e){
          console.error('Parent binding save error:',e);
          if(event.replyToken)await lineReply(event.replyToken,'綁定資料寫入失敗，請稍後再試；若持續發生請聯絡管理員。');
          return;
        }
        await saveBinding(s,uid,'BOUND',{role:'家長',studentNames:names,personName:lineName});
        if(event.replyToken)await lineReply(event.replyToken,`綁定成功！\n\n學生：${names.join('、')}\nLINE 帳號已完成綁定。`);
        return;
      }
      if(status==='WAIT_TEACHER_NAME'){
        await saveBinding(s,uid,'WAIT_TEACHER_CONFIRM',{role:'老師',teacherName:text});if(event.replyToken)await lineReply(event.replyToken,teacherConfirm(text));return;
      }
      if(status==='WAIT_TEACHER_CONFIRM'){
        if(text==='重新輸入'){await saveBinding(s,uid,'WAIT_TEACHER_NAME',{role:'老師'});if(event.replyToken)await lineReply(event.replyToken,teacherPrompt());return;}
        if(text!=='確認'){if(event.replyToken)await lineReply(event.replyToken,'請回覆「確認」或「重新輸入」。');return;}
        const teacherName=String(state?.data?.teacherName||'').trim();
        try{
          try{await upsertContact(s,{uid,role:'老師',lineName,enteredName:teacherName,students:[]});}catch(e){console.error('Teacher binding save error:',e);if(event.replyToken)await lineReply(event.replyToken,'綁定資料寫入失敗，請稍後再試；若持續發生請聯絡管理員。');return;}
        }catch(e){
          console.error('Teacher binding save error:',e);
          if(event.replyToken)await lineReply(event.replyToken,'綁定資料寫入失敗，請稍後再試；若持續發生請聯絡管理員。');
          return;
        }
        await saveBinding(s,uid,'BOUND',{role:'老師',teacherName});
        if(event.replyToken)await lineReply(event.replyToken,`綁定成功！\n\n老師：${teacherName}\nLINE 帳號已完成綁定。`);
        return;
      }

      // All numeric menu commands are handled above once the user is awake.
    }).catch(err=>console.error('Webhook event error:',err)).finally(()=>{release();if(cache.locks.get(uid)===current)cache.locks.delete(uid);});
  }
});

const server=app.listen(PORT,()=>{
  console.log(`LINE bulk notification server v4 listening on ${PORT}`);
  void ensureSheets().then(()=>console.log('Google Sheets core-sheet check complete.')).catch(e=>console.error('Google Sheets init warning:',e.message));
});
process.on('SIGTERM',async()=>{try{await flushLogs();}catch{}try{server.close();}catch{}process.exit(0);});
process.on('uncaughtException',e=>console.error('Uncaught exception:',e));
process.on('unhandledRejection',e=>console.error('Unhandled rejection:',e));
