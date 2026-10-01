'use strict';

function clean(text){
  return String(text ?? '').trim().replace(/\s+/g,' ');
}

function needsFreshWeb(text){
  const t=clean(text);
  if(!t)return false;

  // 明確查找／搜尋意圖使用 Google Search grounding，不只依賴「今天、最新」等時間詞。
  const explicitWebSearch=[
    /(?:上網|網路|網上|網頁|Google).{0,24}(?:搜尋|搜索|查|找|查詢|確認|核實|比較)/i,
    /(?:搜尋|搜索|查詢|查一下|查查看|查找|找一下|找資料|確認|核實|比較).{0,24}(?:上網|網路|網頁|Google|資料|資訊|最新|目前|支援|版本|功能|原因|價格|規定|消息|天氣)/i,
    /(?:幫我|請|麻煩|可以幫我|想請你).{0,18}(?:查|搜尋|搜索|找|確認|核實|比較)(?:一下|看看|查看|查詢|資料)?/i,
    /(?:Gemini|Google|ChatGPT|模型|API|版本|功能|服務).{0,24}(?:最新|目前|支援|限制|失敗|錯誤|變更|更新)/i,
    /\b(?:search(?:\s+the\s+web)?|browse|look up|check online|find out|google)\b/i,
  ].some(re=>re.test(t));
  if(explicitWebSearch)return true;

  // Broad intent signals: explicit lookup verbs, time-sensitive questions, and changing technical facts.
  const explicitSearchIntent=/(?:上網|網路|網上|網頁).{0,24}(?:搜尋|搜索|查|找|確認|核實|比較)|(?:搜尋|搜索|查詢|查一下|查查看|查找|找一下|找資料|幫我查|幫我找|look up|search online|search the web|browse|find out)/i.test(t);
  const timeSensitiveSignal=/(?:今天|今日|現在|目前|現今|最新|近期|最近|剛剛|明天|明日|本週|這週|下週|今年|現任|截至目前|截至現在|當前)/i.test(t);
  const questionSignal=/(?:嗎|？|\?|是否|能否|能不能|可不可以|是不是|為什麼|為何|怎麼|如何|誰|哪裡|哪個|何時|幾點|多少|有哪些)/i.test(t);
  const technicalTopic=/(?:Gemini|Google|ChatGPT|OpenAI|API|LLM|模型|版本|系統|服務|產品|功能|平台|App|應用程式|GitHub|Render|LINE)/i.test(t);
  const changingTechnicalFact=/(?:支援|推出|發布|更新|停用|下架|開放|可用|限制|錯誤|失敗|故障|異常|原因|價格|費用|收費|費率|額度|配額|429|503|變更|改版)/i.test(t);
  const definitionOnly=/(?:是什麼|什麼意思|定義|概念)/i.test(t)&&!timeSensitiveSignal&&!/(?:幫我|請|麻煩|look up|search|搜尋一下|查一下)/i.test(t);
  if(explicitSearchIntent&&!definitionOnly)return true;
  if(timeSensitiveSignal&&questionSignal)return true;
  if(technicalTopic&&changingTechnicalFact&&(questionSignal||/(?:錯誤|失敗|故障|異常|429|503)/i.test(t)))return true;

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
  if(needsFreshWeb(t))return {route:'fresh-search',useSearch:true,confidence:'high',reason:'explicit-search-or-current-information'};
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
