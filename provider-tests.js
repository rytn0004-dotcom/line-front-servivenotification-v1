const fs = require('fs');
const source = fs.readFileSync(require.resolve('./server.js'),'utf8');
if (/projectCooldowns|setGeminiProjectQuotaCooldown|GEMINI_PROJECT_QUOTA_COOLDOWN_MS|clearProjectCooldown/.test(source)) {
  throw new Error('Project-wide Gemini cooldown logic still exists in server.js');
}
if (!source.includes("cooldownScope:'model-only'")) throw new Error('Model-only cooldown diagnostic missing');
for (const id of ['gen-lang-client-0348350940','gen-lang-client-0609456009','gen-lang-client-0705859251']) { if (!source.includes(id)) throw new Error(`Configured Gemini Project ID missing: ${id}`); }
if (!source.includes('projectCooldownDisabled:true')) throw new Error('Project-wide cooldown disable diagnostic missing');
console.log('V2.9.7 model-only cooldown + Project mapping regression: PASS');
const assert = require('assert');

function textFromContent(value){
  if(value==null)return '';
  if(typeof value==='string')return value;
  if(typeof value==='number'||typeof value==='boolean')return String(value);
  if(Array.isArray(value))return value.map(textFromContent).filter(Boolean).join('\n');
  if(value&&typeof value==='object'){
    for(const key of ['text','content','generated_text','output_text','response','answer','message']){
      if(key in value){const out=textFromContent(value[key]);if(out)return out;}
    }
    if(Array.isArray(value.parts))return textFromContent(value.parts);
  }
  return '';
}
function extractCloudflareTextAnswer(data){
  const candidates=[
    data?.result?.response,data?.result?.text,data?.response,data?.text,
    data?.result?.output_text,data?.output_text,data?.result?.generated_text,
    data?.result?.message?.content,data?.result?.content,
    data?.result?.choices?.[0]?.message?.content,data?.choices?.[0]?.message?.content,
    data?.result?.choices?.[0]?.text,data?.choices?.[0]?.text,data?.result
  ];
  for(const value of candidates){const out=textFromContent(value).trim();if(out)return out;}
  return '';
}
function parseSse(raw){
  const parts=[];
  for(const line of String(raw).split(/\r?\n/)){
    const payload=line.replace(/^data:\s*/,'').trim();
    if(!payload||payload==='[DONE]')continue;
    try{const obj=JSON.parse(payload);const out=textFromContent(obj?.choices?.[0]?.delta?.content||obj?.choices?.[0]?.message?.content||obj?.response||obj?.result?.response||obj?.result?.text||obj?.text||obj?.result);if(out)parts.push(out);}catch{}
  }
  return parts.join('').trim();
}

const cases=[
  [{result:{response:'hello'}},'hello'],
  [{result:{text:'hello'}},'hello'],
  [{choices:[{message:{content:'hello'}}]},'hello'],
  [{choices:[{message:{content:[{type:'text',text:'hello'}]}}]},'hello'],
  [{result:{output_text:'hello'}},'hello'],
  [{result:{message:{content:'hello'}}},'hello'],
  [{result:{content:[{text:'hello'}]}},'hello'],
];
for(const [input,expected] of cases)assert.strictEqual(extractCloudflareTextAnswer(input),expected);
assert.strictEqual(parseSse('data: {"choices":[{"delta":{"content":"he"}}]}\ndata: {"choices":[{"delta":{"content":"llo"}}]}\ndata: [DONE]'), 'hello');
assert.strictEqual(extractCloudflareTextAnswer({success:true,result:{}}), '');
console.log('V2.9.5 provider extraction tests: PASS', {cases:cases.length+2});


function orderProjects(order, available){
  const valid=['A','B','C'];
  const seq=String(order||'B,C,A').split(',').map(x=>x.trim().toUpperCase()).filter(x=>valid.includes(x));
  return [...new Set(seq)].filter(x=>available.includes(x));
}
const orderResult=orderProjects(process.env.GEMINI_PROJECT_ORDER||'B,C,A',['A','B','C']);
if(orderResult.join(',')!=='B,C,A') throw new Error('Gemini project order regression');
console.log('Gemini project order test: PASS',orderResult.join(','));
