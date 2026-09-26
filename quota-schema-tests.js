const assert = require('assert');
function col(n){let s='';while(n>0){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26);}return s;}
function buildMeta(header){
  const pos=n=>header.findIndex(x=>x===n);
  const m={};
  for(const [k,n] of [['uid','LINE User ID'],['name','LINE 顯示名稱／姓名'],['role','身分'],['base','每日基本額度'],['extra','額外次數'],['used','今日已用'],['remain','剩餘次數'],['date','額度日期'],['op','額度操作'],['opStatus','操作狀態'],['last','最後使用時間'],['note','備註'],['instructions','操作說明'],['mediaBytes','今日媒體 MB'],['mediaDate','媒體額度日期'],['imageGenCount','今日生圖次數'],['imageGenDate','生圖額度日期']])m[k]=pos(n);
  return m;
}
function groups(meta,row,changes){
 const entries=Object.entries(changes).filter(([,v])=>v!==undefined).map(([k,v])=>[meta[k],v]).filter(([i])=>i>=0).sort((a,b)=>a[0]-b[0]);
 const out=[]; for(const [i,v] of entries){const g=out[out.length-1]; if(g&&g.end===i-1){g.end=i;g.values.push(v);}else out.push({start:i,end:i,values:[v]});}
 return out.map(g=>({range:`${col(g.start+1)}${row}:${col(g.end+1)}${row}`,values:[g.values]}));
}
const canonical=['LINE User ID','LINE 顯示名稱／姓名','身分','每日基本額度','額外次數','今日已用','剩餘次數','額度日期','額度操作','操作狀態','最後使用時間','備註','操作說明','今日媒體 MB','媒體額度日期','今日生圖次數','生圖額度日期'];
const shifted=Array(24).fill(''); const start=4; canonical.forEach((x,i)=>shifted[start+i]=x);
const m=buildMeta(shifted);
assert.equal(col(m.uid+1),'E');
assert.equal(col(m.base+1),'H');
assert.equal(col(m.used+1),'J');
assert.equal(col(m.remain+1),'K');
assert.equal(col(m.mediaBytes+1),'R');
assert.equal(col(m.imageGenDate+1),'U');
const writes=groups(m,12,{uid:'U123',name:'未綁定家長',role:'未完成綁定',base:'5',used:'1',op:'無',opStatus:'待處理',last:'2026-09-26 10:42:03',mediaBytes:'0',mediaDate:'2026-09-26',imageGenCount:'0',imageGenDate:'2026-09-26'});
assert(writes.some(x=>x.range.startsWith('E12')));
assert(writes.some(x=>x.range.includes('H12')));
assert(writes.some(x=>x.range.includes('J12')));
assert(writes.some(x=>x.range.includes('R12')));

function nextRow(rows,headerRow){ let last=headerRow; for(let i=headerRow+1;i<rows.length;i++){ if((rows[i]||[]).some(v=>String(v??'').trim()!=='')) last=i; } return last+2; }
const rows=[canonical, ['U1','','家長','5','0','0','','2026-09-26','無','待處理','','可用'], ['', '', '', '', '', '', '=FORMULA', '2026-09-26'], ['', '', '', '', '', '', '0', '2026-09-26']];
assert.equal(nextRow(rows,0),5);
console.log('V2.9.14 quota fixed-row schema tests: PASS');
