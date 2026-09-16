require('dotenv').config();
const express=require('express');
const crypto=require('crypto');
const {google}=require('googleapis');

const app=express();
const PORT=process.env.PORT||10000;
const TZ=process.env.TIMEZONE||'Asia/Taipei';
const SHEET_ID=process.env.GOOGLE_SHEET_ID||'';
const LINE_SECRET=process.env.LINE_CHANNEL_SECRET||'';
const LINE_TOKEN=process.env.LINE_CHANNEL_ACCESS_TOKEN||'';
const GEMINI_API_KEY=process.env.GEMINI_API_KEY||'';
const GEMINI_MODEL=process.env.GEMINI_MODEL||'gemini-2.5-flash-lite';
const AI_MAX_OUTPUT_TOKENS=Number(process.env.AI_MAX_OUTPUT_TOKENS||500);
const AI_MAX_HISTORY_TURNS=Math.max(1,Number(process.env.AI_MAX_HISTORY_TURNS||6));
const AI_DAILY_REQUEST_LIMIT=Math.max(1,Number(process.env.AI_DAILY_REQUEST_LIMIT||20));
const AI_TOTAL_DAILY_LIMIT=Math.max(1,Number(process.env.AI_TOTAL_DAILY_LIMIT||200));
const COURSE_QUERY_DAILY_LIMIT=Math.max(1,Number(process.env.COURSE_QUERY_DAILY_LIMIT||20));
const COURSE_QUERY_TOTAL_DAILY_LIMIT=Math.max(1,Number(process.env.COURSE_QUERY_TOTAL_DAILY_LIMIT||300));
const INITIAL_REBIND_MAX=Math.max(1,Number(process.env.INITIAL_REBIND_MAX||3));
const BIND_GRACE_MINUTES=Math.max(1,Number(process.env.BIND_GRACE_MINUTES||3));
const SNAPSHOT_TTL=Number(process.env.SHEETS_SNAPSHOT_TTL_MS||12000);
const RETRIES=Number(process.env.GOOGLE_API_MAX_RETRIES||4);
const REVIEW_SHEET='綁定審核';
const CONTACT_SHEET='聯絡人';
const BINDING_SHEET='綁定暫存';
const INTERACTION_SHEET='LINE互動狀態';
const COURSE_SHEET='實際課程';
const SETTINGS_SHEET='系統設定';
const AI_PROMPT=process.env.AI_SYSTEM_PROMPT||'你是補習班 LINE 客服 AI。請用繁體中文、親切、簡短回答。只能根據使用者問題和後端提供的已授權資料回答；不知道就說不知道，不要猜。不可透露其他使用者、其他學生、API 金鑰、Google Sheet 或系統內部資訊。涉及未授權資料、付款、帳務或權限變更時，請請使用者聯絡人工客服。';

for(const k of ['LINE_CHANNEL_SECRET','LINE_CHANNEL_ACCESS_TOKEN','GOOGLE_SHEET_ID','GOOGLE_SERVICE_ACCOUNT_JSON'])if(!process.env[k])throw new Error(`Missing required environment variable: ${k}`);
let creds;try{creds=JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);}catch{throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.');}
const auth=new google.auth.GoogleAuth({credentials:creds,scopes:['https://www.googleapis.com/auth/spreadsheets']});
const sheets=google.sheets({version:'v4',auth});
app.use(express.json({verify:(req,_res,buf)=>{req.rawBody=buf;}}));

const cache={snapshot:null,expiresAt:0,inFlight:null,locks:new Map()};
const logBuffer=[];let logTimer=null;
const ai={day:'',total:0,users:new Map(),history:new Map()};
const courseQuota={day:'',total:0,users:new Map()};

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const norm=v=>String(v??'').trim().replace(/\s+/g,'');
const uniq=a=>[...new Set(a)];
const splitNames=v=>uniq(String(v||'').split(/[、,，\n]/).map(s=>s.trim()).filter(Boolean));
const col=n=>{let s='';while(n>0){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26);}return s;};
const qsheet=n=>`'${String(n).replace(/'/g,"''")}'`;
const taipei=ms=>new Intl.DateTimeFormat('sv-SE',{timeZone:TZ,dateStyle:'short',timeStyle:'medium',hour12:false}).format(new Date(Date.now()+ms));
const nowTaipei=()=>taipei(0);
const dayKey=()=>new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const parseLocal=v=>v?Date.parse(`${String(v).replace(' ','T')}+08:00`):NaN;
const awake=(s,uid)=>{const x=findInteraction(s,uid);const t=parseLocal(x?.expireAt);return !!x&&Number.isFinite(t)&&Date.now()<t;};
const retryable=e=>[429,500,502,503,504].includes(Number(e?.code||e?.response?.status||0));
async function retry(label,fn){let last;for(let i=0;i<=RETRIES;i++){try{return await fn();}catch(e){last=e;if(!retryable(e)||i>=RETRIES)throw e;await sleep(Math.min(9000,500*2**i)+Math.random()*250);console.warn(label,'retry',i+1);}}throw last;}

function headerRow(rows,required){for(let i=0;i<(rows||[]).length;i++){const set=new Set((rows[i]||[]).map(x=>String(x).trim()));if(required.every(x=>set.has(x)))return i;}return -1;}
async function readSnapshot(force=false){
  if(!force&&cache.snapshot&&cache.expiresAt>Date.now())return cache.snapshot;
  if(cache.inFlight)return cache.inFlight;
  cache.inFlight=retry('snapshot',async()=>{
    const ranges=[`${qsheet(CONTACT_SHEET)}!A:Z`,`${qsheet(BINDING_SHEET)}!A:D`,`${qsheet(INTERACTION_SHEET)}!A:E`,`${qsheet(SETTINGS_SHEET)}!A:D`,`${qsheet(COURSE_SHEET)}!A:M`,`${qsheet(REVIEW_SHEET)}!A:J`];
    const r=await sheets.spreadsheets.values.batchGet({spreadsheetId:SHEET_ID,ranges,majorDimension:'ROWS'});
    const contacts=r.data.valueRanges?.[0]?.values||[],courses=r.data.valueRanges?.[4]?.values||[],reviews=r.data.valueRanges?.[5]?.values||[];
    return {contacts,contactsHeaderRow:headerRow(contacts,['姓名','身分','學生姓名/關聯（可多位）','LINE User ID','課表查詢權限']),bindings:r.data.valueRanges?.[1]?.values||[],interactions:r.data.valueRanges?.[2]?.values||[],settings:r.data.valueRanges?.[3]?.values||[],settingsHeaderRow:headerRow(r.data.valueRanges?.[3]?.values||[],['設定項目','目前值']),courses,coursesHeaderRow:headerRow(courses,['Course ID','學生','上課時間']),reviews,reviewsHeaderRow:headerRow(reviews,['申請時間','LINE User ID','申請狀態'])};
  }).then(s=>{cache.snapshot=s;cache.expiresAt=Date.now()+SNAPSHOT_TTL;cache.inFlight=null;return s;}).catch(e=>{cache.inFlight=null;throw e;});
  return cache.inFlight;
}
async function update(sheet,range,values){return retry(`update ${sheet}`,()=>sheets.spreadsheets.values.update({spreadsheetId:SHEET_ID,range:`${qsheet(sheet)}!${range}`,valueInputOption:'USER_ENTERED',requestBody:{values}}));}
async function append(sheet,rows){if(!rows.length)return;return retry(`append ${sheet}`,()=>sheets.spreadsheets.values.append({spreadsheetId:SHEET_ID,range:`${qsheet(sheet)}!A:Z`,valueInputOption:'USER_ENTERED',insertDataOption:'INSERT_ROWS',requestBody:{values:rows}}));}
async function ensureReviewSheet(){
  const meta=await retry('sheet metadata',()=>sheets.spreadsheets.get({spreadsheetId:SHEET_ID,fields:'sheets.properties.title'}));
  if((meta.data.sheets||[]).some(x=>x.properties?.title===REVIEW_SHEET))return;
  await retry('create review sheet',()=>sheets.spreadsheets.batchUpdate({spreadsheetId:SHEET_ID,requestBody:{requests:[{addSheet:{properties:{title:REVIEW_SHEET}}}]}}));
  await update(REVIEW_SHEET,'A1:J1',[['申請時間','LINE User ID','LINE 顯示名稱','身分','目前綁定','申請變更','申請狀態','管理員結果','處理時間','備註']]);
}
function queueLog(row){logBuffer.push(row);if(logBuffer.length>=10)void flushLogs();else if(!logTimer)logTimer=setTimeout(()=>{logTimer=null;void flushLogs();},1500);}
async function flushLogs(){if(!logBuffer.length)return;const rows=logBuffer.splice(0);try{await append('Webhook紀錄',rows);}catch(e){console.error('log flush',e.message);}}

function settingsMap(s){const o={};const rows=s.settings||[],h=s.settingsHeaderRow;if(h<0)return o;for(let i=h+1;i<rows.length;i++){const r=rows[i]||[];if(r[0])o[String(r[0])]=String(r[1]||'');}return o;}
function findBinding(s,uid){for(let i=0;i<(s.bindings||[]).length;i++){const r=s.bindings[i]||[];if(norm(r[0])!==norm(uid))continue;let d={};try{d=JSON.parse(r[2]||'{}');}catch{}return {row:i+1,status:String(r[1]||''),data:d};}return null;}
function findInteraction(s,uid){for(let i=0;i<(s.interactions||[]).length;i++){const r=s.interactions[i]||[];if(norm(r[0])===norm(uid))return {row:i+1,mode:String(r[1]||''),expireAt:String(r[3]||'')};}return null;}
function contactMeta(s){const rows=s.contacts||[],h=(rows[s.contactsHeaderRow]||[]).map(String).map(x=>x.trim());const idx=n=>h.indexOf(n);return {row:s.contactsHeaderRow,name:idx('姓名'),role:idx('身分'),student:idx('學生姓名/關聯（可多位）'),uid:idx('LINE User ID'),status:idx('綁定狀態'),time:idx('最後綁定時間'),active:idx('通知啟用'),note:idx('備註'),perm:idx('課表查詢權限')};}
function contactByUid(s,uid){const m=contactMeta(s);if(m.row<0)return null;for(let i=m.row+1;i<(s.contacts||[]).length;i++){const r=s.contacts[i]||[];if(norm(r[m.uid])===norm(uid))return {row:i+1,role:String(r[m.role]||''),students:splitNames(r[m.student]||''),teacherName:String(String(r[m.role]||'')==='老師'?r[m.student]||'':'').trim(),permission:String(r[m.perm]||''),status:String(r[m.status]||'')};}return null;}
async function upsertContact(s,uid,lineName,role,students,teacherName,note){
  const rows=s.contacts,m=contactMeta(s);if(m.row<0||m.perm<0)throw new Error('聯絡人缺少必要欄位：課表查詢權限。');
  let rowNo=null;for(let i=m.row+1;i<rows.length;i++)if(norm(rows[i]?.[m.uid])===norm(uid)){rowNo=i+1;break;}
  const width=Math.max(rows[m.row].length,10),row=Array(width).fill('');const old=rowNo?(rows[rowNo-1]||[]):[];for(let i=0;i<Math.min(width,old.length);i++)row[i]=old[i]||'';
  row[m.name]=lineName||row[m.name]||'';row[m.role]=role;row[m.student]=role==='老師'?(teacherName||''):uniq(students||[]).join('、');row[m.uid]=uid;row[m.status]='已綁定';row[m.time]=nowTaipei();if(m.active>=0&&!row[m.active])row[m.active]='是';if(note&&m.note>=0)row[m.note]=note;row[m.perm]='否';
  if(rowNo)await update(CONTACT_SHEET,`A${rowNo}:${col(width)}${rowNo}`,[row]);else await append(CONTACT_SHEET,[row]);
  s.contacts[rowNo?rowNo-1:rows.length]=row;cache.snapshot=s;cache.expiresAt=Date.now()+SNAPSHOT_TTL;
}

function reviewMeta(s){const h=(s.reviews[s.reviewsHeaderRow]||[]).map(x=>String(x).trim()),idx=n=>h.indexOf(n);return {row:s.reviewsHeaderRow,time:idx('申請時間'),uid:idx('LINE User ID'),line:idx('LINE 顯示名稱'),role:idx('身分'),current:idx('目前綁定'),requested:idx('申請變更'),status:idx('申請狀態'),result:idx('管理員結果'),processed:idx('處理時間'),note:idx('備註')};}
function pendingReview(s,uid){const m=reviewMeta(s);if(m.row<0)return null;let hit=null;for(let i=m.row+1;i<s.reviews.length;i++){const r=s.reviews[i]||[];if(norm(r[m.uid])===norm(uid))hit={row:i+1,r,meta:m};}return hit;}
async function appendReview(s,uid,lineName,role,current,requested){const row=[nowTaipei(),uid,lineName||'',role,current||'',requested||'','待管理員確認','待處理','',''];await append(REVIEW_SHEET,[row]);s.reviews.push(row);cache.snapshot=s;cache.expiresAt=Date.now()+SNAPSHOT_TTL;}
async function applyApprovedReview(s,uid,lineName){
  const m=reviewMeta(s);if(m.row<0)return false;let target=null;
  for(let i=m.row+1;i<s.reviews.length;i++){const r=s.reviews[i]||[];if(norm(r[m.uid])===norm(uid)&&norm(r[m.status])==='待管理員確認'&&norm(r[m.result])==='核准')target={row:i+1,r};}
  if(!target)return false;
  const role=String(target.r[m.role]||'').trim(), requested=String(target.r[m.requested]||'').trim();
  if(!requested)return false;
  await upsertContact(s,uid,lineName,role,role==='家長'?splitNames(requested):[],role==='老師'?requested:'','管理員核准的重新綁定；課表查詢權限已重置為否。');
  const b=findBinding(s,uid),data={role,studentNames:role==='家長'?splitNames(requested):[],teacherName:role==='老師'?requested:'',boundAt:nowTaipei(),graceUntil:taipei(BIND_GRACE_MINUTES*60000),correctionUsed:false,initialRebindCount:0,pendingAdminRebind:false};
  await saveBinding(s,uid,'BOUND',data);
  target.r[m.status]='已套用';target.r[m.processed]=nowTaipei();await update(REVIEW_SHEET,`A${target.row}:${col(Math.max(target.r.length,10))}${target.row}`,[target.r]);s.reviews[target.row-1]=target.r;cache.snapshot=s;cache.expiresAt=Date.now()+SNAPSHOT_TTL;return true;
}
async function saveBinding(s,uid,status,data){const old=findBinding(s,uid),row=[uid,status,JSON.stringify(data||{}),nowTaipei()];if(old){await update(BINDING_SHEET,`A${old.row}:D${old.row}`,[row]);s.bindings[old.row-1]=row;}else{await append(BINDING_SHEET,[row]);s.bindings.push(row);}cache.snapshot=s;cache.expiresAt=Date.now()+SNAPSHOT_TTL;}
async function saveInteraction(s,uid,mode,expire){const old=findInteraction(s,uid),row=[uid,mode,'',expire||'',nowTaipei()];if(old){await update(INTERACTION_SHEET,`A${old.row}:E${old.row}`,[row]);s.interactions[old.row-1]=row;}else{await append(INTERACTION_SHEET,[row]);s.interactions.push(row);}cache.snapshot=s;cache.expiresAt=Date.now()+SNAPSHOT_TTL;}

function bindingSummary(d){return d?.role==='老師'?`老師：${d.teacherName||'（未填）'}`:`學生：${(d?.studentNames||[]).join('、')||'（未填）'}`;}
function roleOf(d){return d?.role==='老師'?'老師':'家長';}
function bindStart(){return `開始第一次 LINE 綁定。\n\n請先回覆「家長」或「老師」。\n\n首次綁定尚未完成前，最多可以重新輸入 ${INITIAL_REBIND_MAX} 次，用來修正姓名打字錯誤。`;}
function valuePrompt(role){return role==='老師'?'請輸入系統登記的老師姓名。':'請輸入學生姓名；多位學生請用「、」分隔。';}
function confirmBind(d){return `請確認要綁定的資料：\n\n${bindingSummary(d)}\n\n確認後會完成 LINE 綁定。課表查詢權限仍需由後台開啟。\n\n請回覆「確認」或「重新輸入」。`;}
function graceActive(d){return Number.isFinite(parseLocal(d?.graceUntil))&&Date.now()<parseLocal(d.graceUntil);}

function dateFilter(text){const t=String(text||'');const year=Number(new Intl.DateTimeFormat('en-US',{timeZone:TZ,year:'numeric'}).format(new Date()));let m=t.match(/(\d{1,2})[\/月](\d{1,2})(?:日|號)?/);if(m){const mm=+m[1],dd=+m[2];if(mm>=1&&mm<=12&&dd>=1&&dd<=31)return {date:`${year}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`};}m=t.match(/(?:星期|禮拜)([日一二三四五六天])/);if(m)return {weekday:m[1]==='天'?'日':m[1]};if(/今天/.test(t))return {date:new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())};if(/明天/.test(t))return {date:new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+86400000))};return null;}
function courseMeta(s){const h=(s.courses[s.coursesHeaderRow]||[]).map(x=>String(x).trim()),idx=n=>h.indexOf(n);return {row:s.coursesHeaderRow,id:idx('Course ID'),date:idx('課程日期'),weekday:idx('星期'),time:idx('上課時間'),student:idx('學生'),course:idx('課程'),teacher:idx('老師'),campus:idx('校區'),note:idx('備註')};}
function authorizedCourses(s,uid,text){const c=contactByUid(s,uid);if(!c||c.status!=='已綁定')return {ok:false,reason:'NOT_BOUND'};if(c.permission!=='是')return {ok:false,reason:'PERMISSION_OFF'};const m=courseMeta(s);if(m.row<0||m.student<0||m.time<0)return {ok:false,reason:'SHEET'};const q=dateFilter(text),rows=s.courses,out=[];for(let i=m.row+1;i<rows.length;i++){const r=rows[i]||[],student=String(r[m.student]||'').trim(),teacher=String(r[m.teacher]||'').trim();if(!student)continue;const ok=c.role==='家長'?c.students.some(x=>norm(x)===norm(student)):c.role==='老師'&&norm(teacher)===norm(c.teacherName);if(!ok)continue;if(q?.date&&m.date>=0&&String(r[m.date]||'').trim()&&!String(r[m.date]).includes(q.date))continue;if(q?.weekday&&m.weekday>=0&&String(r[m.weekday]||'').replace(/^星期/,'').trim()!==q.weekday)continue;out.push({id:m.id>=0?String(r[m.id]||'').trim():'',date:m.date>=0?String(r[m.date]||'').trim():'',weekday:m.weekday>=0?String(r[m.weekday]||'').trim():'',time:String(r[m.time]||'').trim(),student,course:m.course>=0?String(r[m.course]||'').trim():'',teacher,campus:m.campus>=0?String(r[m.campus]||'').trim():'',note:m.note>=0?String(r[m.note]||'').trim():''});if(out.length>=20)break;}return {ok:true,role:c.role,rows:out};}

function resetQuota(q){const d=dayKey();if(q.day!==d){q.day=d;q.total=0;q.users.clear();}}
function useCourseQuota(uid){resetQuota(courseQuota);const n=courseQuota.users.get(uid)||0;if(n>=COURSE_QUERY_DAILY_LIMIT||courseQuota.total>=COURSE_QUERY_TOTAL_DAILY_LIMIT)throw new Error('COURSE_LIMIT');courseQuota.users.set(uid,n+1);courseQuota.total++;}
function aiHistory(uid){return ai.history.get(uid)||[];}
function clearHistory(uid){ai.history.delete(uid);}
async function gemini(uid,text,context){
  resetQuota(ai);const n=ai.users.get(uid)||0;if(n>=AI_DAILY_REQUEST_LIMIT||ai.total>=AI_TOTAL_DAILY_LIMIT)throw new Error('AI_LIMIT');
  const contents=[...aiHistory(uid),{role:'user',parts:[{text}]}];const body={systemInstruction:{parts:[{text:AI_PROMPT+(context?`\n\n後端背景：${context}`:'')}]},contents,generationConfig:{temperature:0.2,maxOutputTokens:AI_MAX_OUTPUT_TOKENS}};
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),raw=await r.text();if(!r.ok)throw new Error(`Gemini ${r.status}: ${raw.slice(0,300)}`);let data;try{data=JSON.parse(raw);}catch{throw new Error('Gemini invalid JSON');}const answer=String(data?.candidates?.[0]?.content?.parts?.map(p=>p?.text||'').join('')||'').trim();if(!answer)throw new Error('Gemini empty');ai.total++;ai.users.set(uid,n+1);ai.history.set(uid,[...contents,{role:'model',parts:[{text:answer}]}].slice(-AI_MAX_HISTORY_TURNS*2));return answer;
}
async function lineReply(token,text){const r=await fetch('https://api.line.me/v2/bot/message/reply',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${LINE_TOKEN}`},body:JSON.stringify({replyToken:token,messages:[{type:'text',text:String(text).slice(0,4900)}]})});if(!r.ok)throw new Error(`LINE reply ${r.status}: ${await r.text()}`);}
async function profile(uid){const r=await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(uid)}`,{headers:{Authorization:`Bearer ${LINE_TOKEN}`}});return r.ok?r.json():null;}
function sigOK(req){const sig=req.headers['x-line-signature'];if(!sig||!req.rawBody)return false;const digest=crypto.createHmac('sha256',LINE_SECRET).update(req.rawBody).digest('base64');try{return crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(digest));}catch{return false;}}

app.get('/health',(_req,res)=>res.json({ok:true,service:'line-frontend-customer-service-v7',geminiEnabled:!!GEMINI_API_KEY,geminiModel:GEMINI_MODEL,initialRebindMax:INITIAL_REBIND_MAX,bindGraceMinutes:BIND_GRACE_MINUTES,courseQueryDailyLimit:COURSE_QUERY_DAILY_LIMIT,courseQueryTotalDailyLimit:COURSE_QUERY_TOTAL_DAILY_LIMIT}));

app.post('/webhook',async(req,res)=>{
  if(!sigOK(req))return res.status(401).send('Invalid signature');res.status(200).send('OK');
  for(const event of req.body?.events||[]){const uid=event.source?.userId;if(!uid)continue;const prev=cache.locks.get(uid)||Promise.resolve();let release;const current=new Promise(r=>release=r);cache.locks.set(uid,current);
    prev.then(async()=>{
      const s=await readSnapshot();let lineName='';try{lineName=(await profile(uid))?.displayName||'';}catch{};try{await applyApprovedReview(s,uid,lineName);}catch(e){console.error('apply review',e.message);}
      if(event.type==='follow'){await saveInteraction(s,uid,'安靜模式','');queueLog([nowTaipei(),uid,lineName,'follow','','',event.replyToken||'','安靜模式']);const sm=settingsMap(s);if(event.replyToken&&sm['加入好友歡迎訊息']!=='否'){const welcome=sm['加入好友歡迎訊息']||`您好，歡迎加入！\n\n如需服務，請輸入「${sm['喚醒關鍵詞']||'選單'}」。`;await lineReply(event.replyToken,welcome);}return;}
      if(event.type!=='message'||event.message?.type!=='text')return;const text=String(event.message.text||'').trim();queueLog([nowTaipei(),uid,lineName,'message','text',text,event.replyToken||'','收到']);const sm=settingsMap(s),kw=sm['喚醒關鍵詞']||'選單',minutes=Number(sm['互動模式分鐘數']||10)||10;
      if(text===kw||text==='功能選單'){await saveInteraction(s,uid,'互動模式',taipei(minutes*60000));if(event.replyToken)await lineReply(event.replyToken,`您好，請選擇您要使用的功能：\n\n① LINE綁定\n② 課程查詢\n③ 繳費／收據\n④ AI客服\n⑤ 人工客服\n\n輸入「取消」可離開互動模式。\n\n※ Render 主機喚醒可能有短暫延遲；若未收到回覆，可在一分鐘後再輸入「選單」。`);return;}
      if(text==='取消'||text==='取消互動'){clearHistory(uid);await saveInteraction(s,uid,'安靜模式','');if(event.replyToken)await lineReply(event.replyToken,'已離開互動模式。\n\n如需服務，請輸入「選單」。');return;}

      if(text==='1'||text==='LINE綁定'||text==='綁定'||text==='開始綁定'||text==='重新綁定'||text==='更正綁定'){
        const b=findBinding(s,uid),c=contactByUid(s,uid);await saveInteraction(s,uid,'綁定模式',taipei(minutes*60000));
        if(!b||b.status!=='BOUND'){await saveBinding(s,uid,'WAIT_ROLE',{flow:'initial',initialRebindCount:0});if(event.replyToken)await lineReply(event.replyToken,bindStart());return;}
        if(text==='重新綁定'||text==='更正綁定'){
          if(graceActive(b.data)&&!b.data?.correctionUsed){await saveBinding(s,uid,'WAIT_REBIND_VALUE',{...b.data,flow:'graceCorrection'});if(event.replyToken)await lineReply(event.replyToken,`目前仍在 ${BIND_GRACE_MINUTES} 分鐘反悔期內，可以更正一次。\n\n${valuePrompt(roleOf(b.data))}\n\n輸入「取消」可保留原綁定。`);return;}
          const pending=pendingReview(s,uid);if(pending&&norm(pending.r[pending.meta.status])==='待管理員確認'){if(event.replyToken)await lineReply(event.replyToken,'您目前已有一筆綁定變更申請等待管理員確認。');return;}
          await saveBinding(s,uid,'WAIT_ADMIN_REBIND_VALUE',{...b.data,flow:'adminRebind'});if(event.replyToken)await lineReply(event.replyToken,`已超過 ${BIND_GRACE_MINUTES} 分鐘反悔期。新的綁定需要管理員確認。\n\n${valuePrompt(roleOf(b.data))}\n\n輸入「取消」可保留原綁定。`);return;
        }
        if(event.replyToken)await lineReply(event.replyToken,`您已完成 LINE 綁定。\n\n${bindingSummary(b.data)}\n\n課表查詢權限：${c?.permission==='是'?'已開啟':'尚未開啟'}\n\n剛完成綁定時，${BIND_GRACE_MINUTES} 分鐘內可用「更正綁定」修正一次。`);return;
      }
      if(text==='2'||text==='課程查詢'){
        const c=contactByUid(s,uid);if(!c||c.status!=='已綁定'){if(event.replyToken)await lineReply(event.replyToken,'課程查詢需要先完成 LINE 綁定。');return;}if(c.permission!=='是'){if(event.replyToken)await lineReply(event.replyToken,'您的課表查詢權限尚未開啟。綁定已完成，但需管理員在後台確認後才能查詢。');return;}if(!GEMINI_API_KEY){if(event.replyToken)await lineReply(event.replyToken,'課程查詢 AI 尚未設定，請使用人工客服。');return;}await saveInteraction(s,uid,'AI課程查詢模式',taipei(minutes*60000));clearHistory(uid);if(event.replyToken)await lineReply(event.replyToken,'已進入課程查詢。\n\n例如：「我小孩星期六幾點上課？」\n\n系統只會使用您已授權的課程資料。');return;
      }
      if(text==='3'||text==='繳費／收據'||text==='繳費/收據'){if(event.replyToken)await lineReply(event.replyToken,'目前繳費／收據服務尚未啟用，請使用人工客服。');return;}
      if(text==='4'||text==='AI客服'||text==='AI 客服'){if(!GEMINI_API_KEY){if(event.replyToken)await lineReply(event.replyToken,'AI 客服尚未設定 Gemini API Key，目前請使用人工客服。');return;}clearHistory(uid);await saveInteraction(s,uid,'AI客服模式',taipei(minutes*60000));if(event.replyToken)await lineReply(event.replyToken,'已進入 AI 客服。請直接輸入您的問題。\n\n輸入「取消」可離開。');return;}
      if(text==='5'||text==='人工客服'){clearHistory(uid);await saveInteraction(s,uid,'互動模式',taipei(minutes*60000));if(event.replyToken)await lineReply(event.replyToken,'已進入人工客服服務，請直接留言。');return;}

      const interaction=findInteraction(s,uid),b=findBinding(s,uid),status=b?.status||'UNBOUND';
      if(awake(s,uid)&&interaction?.mode==='綁定模式'){
        if(status==='WAIT_ROLE'){
          const role=/^家長$/.test(text)?'家長':/^老師$/.test(text)?'老師':'';if(!role){if(event.replyToken)await lineReply(event.replyToken,'請回覆「家長」或「老師」。');return;}await saveBinding(s,uid,'WAIT_BIND_VALUE',{flow:'initial',role,initialRebindCount:0});if(event.replyToken)await lineReply(event.replyToken,valuePrompt(role));return;
        }
        if(status==='WAIT_BIND_VALUE'){
          const d={...b.data};if(d.role==='老師')d.teacherName=text;else d.studentNames=splitNames(text);if(d.role==='老師'&&!d.teacherName||d.role==='家長'&&!d.studentNames.length){if(event.replyToken)await lineReply(event.replyToken,valuePrompt(d.role));return;}await saveBinding(s,uid,'WAIT_BIND_CONFIRM',d);if(event.replyToken)await lineReply(event.replyToken,confirmBind(d));return;
        }
        if(status==='WAIT_BIND_CONFIRM'){
          if(text==='重新輸入'){const n=Number(b.data?.initialRebindCount||0)+1;if(n>INITIAL_REBIND_MAX){if(event.replyToken)await lineReply(event.replyToken,`首次綁定最多只能重新輸入 ${INITIAL_REBIND_MAX} 次。`);return;}const d={...b.data,initialRebindCount:n};await saveBinding(s,uid,'WAIT_BIND_VALUE',d);if(event.replyToken)await lineReply(event.replyToken,`${valuePrompt(d.role)}\n\n這是第 ${n}/${INITIAL_REBIND_MAX} 次重新輸入機會。`);return;}
          if(text!=='確認'){if(event.replyToken)await lineReply(event.replyToken,'請回覆「確認」或「重新輸入」。');return;}
          const d=b.data||{};await upsertContact(s,uid,lineName,d.role,d.studentNames||[],d.teacherName||'','首次自助綁定；課表查詢權限待管理員確認。');const bd={role:d.role,studentNames:d.role==='家長'?uniq(d.studentNames||[]):[],teacherName:d.role==='老師'?String(d.teacherName||'').trim():'',boundAt:nowTaipei(),graceUntil:taipei(BIND_GRACE_MINUTES*60000),correctionUsed:false,initialRebindCount:Number(d.initialRebindCount||0),pendingAdminRebind:false};await saveBinding(s,uid,'BOUND',bd);if(event.replyToken)await lineReply(event.replyToken,`LINE 綁定完成！\n\n${bindingSummary(bd)}\n\n課表查詢權限目前是「否」，請等管理員確認後開啟。\n\n${BIND_GRACE_MINUTES} 分鐘內如發現打錯，可輸入「更正綁定」修正一次。`);return;
        }
        if(status==='WAIT_REBIND_VALUE'){
          if(text==='取消'){await saveBinding(s,uid,'BOUND',{...b.data,flow:'normal'});if(event.replyToken)await lineReply(event.replyToken,'已取消更正，原綁定維持不變。');return;}
          const d={...b.data};if(d.role==='老師')d.pendingTeacherName=text;else d.pendingStudentNames=splitNames(text);if(d.role==='老師'&&!d.pendingTeacherName||d.role==='家長'&&!d.pendingStudentNames.length){if(event.replyToken)await lineReply(event.replyToken,valuePrompt(d.role));return;}await saveBinding(s,uid,'WAIT_REBIND_CONFIRM',d);const p=d.role==='老師'?{role:d.role,teacherName:d.pendingTeacherName}:{role:d.role,studentNames:d.pendingStudentNames};if(event.replyToken)await lineReply(event.replyToken,`請確認更正後的資料：\n\n${bindingSummary(p)}\n\n確認後會取代原綁定，且課表查詢權限會重置為「否」。\n\n請回覆「確認」或「取消」。`);return;
        }
        if(status==='WAIT_REBIND_CONFIRM'){
          if(text==='取消'){await saveBinding(s,uid,'BOUND',{...b.data,flow:'normal'});if(event.replyToken)await lineReply(event.replyToken,'已取消更正，原綁定維持不變。');return;}if(text!=='確認'){if(event.replyToken)await lineReply(event.replyToken,'請回覆「確認」或「取消」。');return;}const d=b.data||{},students=d.pendingStudentNames||[],teacher=d.pendingTeacherName||'';await upsertContact(s,uid,lineName,d.role,students,teacher,'3分鐘反悔期內自助更正；課表查詢權限已重置為否。');const bd={role:d.role,studentNames:d.role==='家長'?students:[],teacherName:d.role==='老師'?teacher:'',boundAt:nowTaipei(),graceUntil:taipei(BIND_GRACE_MINUTES*60000),correctionUsed:true,initialRebindCount:d.initialRebindCount||0,pendingAdminRebind:false};await saveBinding(s,uid,'BOUND',bd);if(event.replyToken)await lineReply(event.replyToken,`綁定已更正。\n\n${bindingSummary(bd)}\n\n課表查詢權限已重置為「否」，請由管理員重新開啟。`);return;
        }
        if(status==='WAIT_ADMIN_REBIND_VALUE'){
          if(text==='取消'){await saveBinding(s,uid,'BOUND',{...b.data,flow:'normal'});if(event.replyToken)await lineReply(event.replyToken,'已取消重新綁定申請，原綁定維持不變。');return;}const d={...b.data};if(d.role==='老師')d.pendingTeacherName=text;else d.pendingStudentNames=splitNames(text);if(d.role==='老師'&&!d.pendingTeacherName||d.role==='家長'&&!d.pendingStudentNames.length){if(event.replyToken)await lineReply(event.replyToken,valuePrompt(d.role));return;}await saveBinding(s,uid,'WAIT_ADMIN_REBIND_CONFIRM',d);const p=d.role==='老師'?{role:d.role,teacherName:d.pendingTeacherName}:{role:d.role,studentNames:d.pendingStudentNames};if(event.replyToken)await lineReply(event.replyToken,`請確認要送出重新綁定申請：\n\n${bindingSummary(p)}\n\n送出後由管理員確認，不會立即取代目前綁定。\n\n請回覆「確認」或「取消」。`);return;
        }
        if(status==='WAIT_ADMIN_REBIND_CONFIRM'){
          if(text==='取消'){await saveBinding(s,uid,'BOUND',{...b.data,flow:'normal'});if(event.replyToken)await lineReply(event.replyToken,'已取消申請，原綁定維持不變。');return;}if(text!=='確認'){if(event.replyToken)await lineReply(event.replyToken,'請回覆「確認」或「取消」。');return;}const d=b.data||{},old=bindingSummary(d),requested=d.role==='老師'?String(d.pendingTeacherName||''):uniq(d.pendingStudentNames||[]).join('、');await appendReview(s,uid,lineName,d.role,old,requested);const c=contactByUid(s,uid),m=contactMeta(s);if(c&&m?.perm>=0){const row=[...(s.contacts[c.row-1]||[])];row[m.perm]='否';await update(CONTACT_SHEET,`A${c.row}:${col(Math.max(10,row.length))}${c.row}`,[row]);s.contacts[c.row-1]=row;}await saveBinding(s,uid,'BOUND',{...d,pendingAdminRebind:true});if(event.replyToken)await lineReply(event.replyToken,'重新綁定申請已送出。為保護資料，課表查詢權限已暫停；請等待管理員確認。');return;
        }
      }

      if(awake(s,uid)&&interaction?.mode==='AI課程查詢模式'){
        if(!GEMINI_API_KEY){if(event.replyToken)await lineReply(event.replyToken,'Gemini 尚未設定。');return;}try{useCourseQuota(uid);const q=authorizedCourses(s,uid,text);if(!q.ok){if(event.replyToken)await lineReply(event.replyToken,q.reason==='PERMISSION_OFF'?'您的課表查詢權限尚未開啟，請等待管理員確認。':'目前無法查詢您的課表，請先完成綁定或聯絡管理員。');return;}const rows=q.rows.map(x=>`學生：${x.student}\n日期：${x.date||'未提供'}\n星期：${x.weekday||'未提供'}\n時間：${x.time}\n課程：${x.course||'未提供'}\n老師：${x.teacher||'未提供'}\n校區：${x.campus||'未提供'}\n備註：${x.note||'無'}`).join('\n---\n');const ans=await gemini(uid,`回答使用者的課程查詢，只能使用以下後端已授權資料。使用者問題：${text}\n\n已授權資料：\n${rows||'（沒有符合條件的課程）'}`,`身分：${q.role}。後端已先依 LINE User ID 與課表查詢權限篩選，不得擴大範圍。`);if(event.replyToken)await lineReply(event.replyToken,ans);}catch(e){console.error('course ai',e.message);if(event.replyToken)await lineReply(event.replyToken,e.message==='COURSE_LIMIT'||e.message==='AI_LIMIT'?'今日課程查詢使用量已達系統保護上限，請稍後再試。':'課程查詢目前暫時無法完成，請稍後再試。');}return;
      }
      if(awake(s,uid)&&interaction?.mode==='AI客服模式'){
        try{const c=contactByUid(s,uid);const ans=await gemini(uid,text,`身分：${c?.role||'未完成綁定'}。`);if(event.replyToken)await lineReply(event.replyToken,ans);}catch(e){console.error('ai',e.message);if(event.replyToken)await lineReply(event.replyToken,e.message==='AI_LIMIT'?'今日 AI 使用量已達保護上限，請改用人工客服。':'AI 客服目前暫時無法使用，請稍後再試。');}return;
      }
    }).catch(e=>console.error('event',e)).finally(()=>{release();if(cache.locks.get(uid)===current)cache.locks.delete(uid);});
  }
});

(async()=>{try{await ensureReviewSheet();const s=await readSnapshot(true);const checks=[[s.contactsHeaderRow>=0,'聯絡人必須包含：姓名、身分、學生姓名/關聯（可多位）、LINE User ID、課表查詢權限'],[s.coursesHeaderRow>=0,'實際課程必須包含：Course ID、學生、上課時間'],[s.settingsHeaderRow>=0,'系統設定必須包含：設定項目、目前值'],[s.reviewsHeaderRow>=0,'綁定審核標題列不存在']];const bad=checks.filter(x=>!x[0]).map(x=>x[1]);if(bad.length)throw new Error(`Excel schema error: ${bad.join('；')}`);console.log('Excel master schema check complete.');}catch(e){console.error('Startup failed:',e.message);process.exit(1);return;}app.listen(PORT,()=>console.log(`LINE customer service server v7 listening on ${PORT}`));})();
process.on('uncaughtException',e=>console.error('Uncaught exception',e));process.on('unhandledRejection',e=>console.error('Unhandled rejection',e));
