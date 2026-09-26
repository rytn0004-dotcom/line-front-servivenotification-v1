'use strict';
const assert=require('assert');
const fs=require('fs');
const source=fs.readFileSync(require.resolve('./server.js'),'utf8');

const mustContain=[
  "createAdminRebindReviewIfNeeded",
  "待管理員核准後輸入新綁定資料",
  "已核准待輸入",
  "finalizeApprovedAdminRebind",
  "管理員先核准，核准後使用者才能輸入新綁定資料",
  "WAIT_ADMIN_REBIND_VALUE",
  "WAIT_ADMIN_REBIND_CONFIRM",
  "flow==='adminRebind'",
  "pendingAdminRebind!==true"
];
for(const needle of mustContain) assert(source.includes(needle), `missing binding-review guard: ${needle}`);

assert(!source.includes("if(!b||b.status!=='BOUND'){await saveBinding(s,uid,'WAIT_ADMIN_REBIND_VALUE'"), 'old direct-input bypass still exists');
assert(source.includes("await createAdminRebindReviewIfNeeded(s,uid,lineName,b)"), 'admin review must be created before new value input');
assert(source.includes("norm(target.r[target.meta.status])==='已核准待輸入'"), 'final apply must require approved review');
assert(source.includes("if(norm(target.r[m.status])!=='已核准待輸入' || norm(target.r[m.result])!=='核准')return false;"), 'final apply approval guard must be present');

const flowOrder=[
  source.indexOf('createAdminRebindReviewIfNeeded'),
  source.indexOf("saveBinding(s,uid,'WAIT_ADMIN_REBIND_VALUE'"),
  source.indexOf('finalizeApprovedAdminRebind')
];
assert(flowOrder[0] >= 0 && flowOrder[1] >= 0 && flowOrder[2] >= 0, 'binding review flow symbols not found');

console.log('Binding review regression checks: PASS');
console.log(JSON.stringify({checks:mustContain.length,flowOrder},null,2));
