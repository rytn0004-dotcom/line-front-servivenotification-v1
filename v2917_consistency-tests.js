const fs = require('fs');
const server = fs.readFileSync('./server.js','utf8');
const pkg = JSON.parse(fs.readFileSync('./package.json','utf8'));
const checks = [
  ['version 2.9.17', pkg.version === '2.9.17'],
  ['default Gemini order B,C,A', /process\.env\.GEMINI_PROJECT_ORDER\|\|'B,C,A'/.test(server)],
  ['model-only cooldown', /cooldownScope:'model-only'/.test(server) && /projectCooldownDisabled:true/.test(server)],
  ['quota fixed-row writer', /writeMode:'fixed-row'/.test(server) && /function quotaWriteGroups/.test(server)],
  ['image uses shared AI quota', /reserveAIQuota\(s,uid,lineName,role,settings,flow\?\.content\|\|'',\{cost:imageCost,mediaKind:'image_generation',allowWhenChatDisabled:true\}\)/.test(server)],
  ['image has separate daily image hard limit', /reserveImageGenerationQuota\(s,uid,lineName,role,settings\)/.test(server)],
  ['image quota refunded on pre-generation failure', /releaseImageGenerationQuota\(uid\)/.test(server) && /releaseAIQuota\(s,uid,\{cost:imageCost\}\)/.test(server)],
  ['image custom format flow', /action=image_comp_custom/.test(server) && /自訂格式／比例/.test(server)],
  ['binding guide disabled by default', /ENABLE_BINDING_GUIDE_IMAGE.*'false'/.test(server)],
  ['image function setting respected', /sm\['圖片製作功能'\]/.test(server)],
];
const failed = checks.filter(([,ok])=>!ok);
for (const [name,ok] of checks) console.log(`${ok?'PASS':'FAIL'} ${name}`);
if (failed.length) process.exit(1);
console.log('V2.9.17 consistency tests: PASS');
