'use strict';

function clean(text){
  return String(text ?? '').trim().replace(/\s+/g,' ');
}

function needsFreshWeb(text){
  const t=clean(text);
  if(!t)return false;

  // 明確要求上網搜尋時直接啟用 grounding；一般「查資料」仍交由新鮮資訊規則判斷。
  const explicitWebSearch=[
    /(?:上網|網路|網上|網頁|Google).{0,16}(?:搜尋|搜索|查詢|查一下|查查看|找資料)/i,
    /(?:搜尋|搜索|查詢|查一下|查查看|找資料).{0,16}(?:上網|網路|網上|網頁|Google|最新|即時|目前)/i,
    /(?:幫我|請|麻煩).{0,10}(?:上網查|網路查|搜尋網路|搜尋網頁|網路搜尋|網上搜尋|Google一下)/i,
    /\b(?:search|browse|look up|check online|google)\b/i,
  ].some(re=>re.test(t));
  if(explicitWebSearch)return true;

  const zhFresh = [
    /(?:最新|即時)(?:消息|新聞|公告|版本)/i,
    /(?:今天|今日|現在|目前|剛剛|明天|明日|本週|這週|下週)\s*(?:的)?\s*(?:天氣|氣溫|降雨|新聞|消息|比賽|賽程|匯率|股價|行情)/i,
    /(?:天氣|氣溫|降雨|颱風|新聞|消息|股價|股票行情|匯率|外匯|比分|賽況|比賽結果|賽程|版本).{0,24}(?:今天|今日|現在|目前|明天|明日|本週|這週|下週|即時|最新|近期)/i,
    /(?:[\u3400-\u9fff]{2,20})\s*(?:的)?\s*(?:天氣|氣溫|降雨|匯率|股價)/i,
    /(?:截至目前|截至現在|目前狀況|當前狀況|近期發布|最近發布)/i,
  ];
  const zhDefinition=/(?:是什麼|什麼意思|為什麼|為何|怎麼形成|如何形成|形成原理|定義|概念|如何運作|怎麼運作)/i.test(t);
  const zhHasTime=/(?:今天|今日|現在|目前|剛剛|即時|最新|近期|最近|明天|明日|本週|這週|下週|截至目前|截至現在)/i.test(t);
  if(zhFresh.some(re=>re.test(t)) && !(zhDefinition && !zhHasTime))return true;

  const enFresh = [
    /\b(?:how(?:'s| is)|what(?:'s| is))\s+the\s+weather(?:\s+(?:in|at|for)\s+[^?!.]+)?\??$/i,
    /\b(?:weather|forecast|temperature|rain|typhoon)\b.{0,40}\b(?:today|tomorrow|now|currently|right\s+now|this\s+week|next\s+week|in\s+[A-Za-z\u3400-\u9fff]|at\s+[A-Za-z\u3400-\u9fff]|for\s+[A-Za-z\u3400-\u9fff])\b/i,
    /\b(?:today(?:'s)?|latest|breaking|recent|current|right\s+now)\b.{0,40}\b(?:news|update|updates|stock(?:\s+price)?|share\s+price|exchange\s+rate|score|scores|game\s+result|match\s+result|live\s+score|schedule|version|status|situation)\b/i,
    /\b(?:news|stock(?:\s+price)?|share\s+price|exchange\s+rate|score|scores|game\s+result|match\s+result|live\s+score|schedule|version)\b.{0,30}\b(?:today|latest|current|now|recent|live)\b/i,
  ];
  return enFresh.some(re=>re.test(t));
}

// Route classification is a signal only. It must never be used as a hard denial by itself.
function classifyAIRoute(text){
  const t=clean(text);
  if(!t)return {route:'general',useSearch:false,confidence:'none',reason:'empty'};
  if(needsFreshWeb(t))return {route:'fresh-search',useSearch:true,confidence:'high',reason:'explicit-current-information'};
  return {route:'general',useSearch:false,confidence:'normal',reason:'no-high-confidence-current-signal'};
}

function looksLikeInternalInfoProbe(text){
  const t=clean(text);
  if(!t)return false;

  // 只有詢問「本系統本身」的內部資訊才攔截；一般學習題例如「prompt 是什麼」不攔。
  const providerProbe=/(你|本客服|這個客服|本系統|這個系統|機器人).{0,24}(現在|目前|背後|使用|採用|運作|配置).{0,24}(什麼|哪個|哪一個|哪家|哪種)?\s*(模型|AI|LLM|引擎|服務商|provider|平台|API|GPT|Gemini|Claude|OpenAI|Groq|OpenRouter)/i;
  const modelProbe=/(你是|你用的是|你目前是|你現在是|你背後是).{0,18}(GPT|Gemini|Claude|OpenAI|Groq|OpenRouter|模型|AI|LLM)/i;
  const secretOwnershipProbe=/(?:你的|本系統的|這個客服的|後端的).{0,12}(?:API\s*KEY|API金鑰|access\s*token|token|密鑰|服務帳號)/i;
  const secretAsk=/(?:API\s*KEY|API金鑰|access\s*token|token|密鑰|服務帳號).{0,24}(?:給我|提供|告訴我|顯示|貼出|透露)/i;
  const promptProbe=/(?:系統|你|本客服|這個客服|後端).{0,18}(?:prompt|提示詞|system\s*prompt).{0,18}(?:是什麼|內容|全文|給我|貼出|提供|顯示)/i;
  const deployProbe=/(?:你們|本系統|這個客服|後端|服務).{0,20}(?:部署|Render|GitHub|資料庫|Google\s*Sheet|環境變數|備援模型|模型列表|模型順序|路由設定|router|部署設定).{0,20}(?:是什麼|在哪|哪個|哪家|怎麼配置|設定|內容|給我|提供)/i;

  return providerProbe.test(t)||modelProbe.test(t)||secretOwnershipProbe.test(t)||secretAsk.test(t)||promptProbe.test(t)||deployProbe.test(t);
}

module.exports={needsFreshWeb,classifyAIRoute,looksLikeInternalInfoProbe};
