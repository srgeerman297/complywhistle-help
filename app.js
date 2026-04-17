let qnaData=[];
let recognition=null;
let isListening=false;
let micButton=null;
let userInput=null;

const STOP_WORDS=new Set(["a","an","the","to","for","of","on","in","at","by","from","with","and","or","is","are","do","does","did","can","i","me","my","we","our","you","your","it","this","that","what","how","why","where","when"]);

const PHRASE_SYNONYMS=[
  ["pois","person of interest"],
  ["poi","person of interest"],
  ["person of interests","persons of interest"],
  ["aml deed","deed"],
  ["aml case","deed"],
  ["aml file","deed"],
  ["object file","deed"],
  ["fiu report","report"],
  ["fiu package","report package"],
  ["report package","fiu report package"],
  ["screening url","link"],
  ["screening link","link"],
  ["digital journey","journey"],
  ["compliance journey","journey"],
  ["shufti pro","shufti"],
  ["three dot menu","options menu"],
  ["ellipsis menu","options menu"],
  ["mail icon","email icon"],
  ["bell icon","notifications icon"],
  ["refresh button","sync button"],
  ["poi url","person of interest link"],
  ["poi link","person of interest link"],
  ["send again","resend"],
  ["copy again","resend"],
  ["proof zip","proof images zip"],
  ["proof images","evidence"],
  ["pdf file","pdf report"],
  ["view all pois","persons of interest page"],
  ["poi list","persons of interest page"],
  ["action buttons","actions"],
  ["update date","last updated"],
  ["sign in","login"],
  ["single sign on","sso"]
];

const TOKEN_SYNONYMS={
  poi:["person","interest"],
  pois:["person","interest"],
  person:["interest","poi"],
  deed:["aml","case","matter","file","object"],
  aml:["deed","compliance"],
  fiu:["report","reporting"],
  zip:["package","download","archive"],
  mail:["email","send"],
  email:["mail","send"],
  sync:["refresh","update","shufti"],
  refresh:["sync","update"],
  reported:["report","reported"],
  findings:["finding","hit","review","pep"],
  finding:["findings","hit","pep"],
  approved:["clear","passed","view"],
  pending:["waiting","incomplete","not","finished"],
  docs:["documents","files"],
  doc:["document","file"],
  upload:["add","file","attachment","image"],
  attachments:["files","documents"],
  action:["button","icon","menu"],
  actions:["buttons","icons","menu"],
  page:["limit","results"],
  customer:["client"],
  customers:["clients"],
  url:["link","copy"],
  link:["url","copy","journey"],
  resend:["again","repeat","copy","link"],
  again:["resend","repeat"],
  copy:["link","url","clipboard"],
  evidence:["proof","images","zip"],
  proof:["evidence","images","zip"],
  report:["fiu","pdf","email"],
  sso:["login","sign","identity"],
  login:["sign","access","dashboard"],
  audit:["trail","evidence","retention"],
  trail:["audit","history","evidence"],
  reminder:["notifications","emails"],
  notifications:["reminders","silence","bell"],
  bell:["notifications","silence"],
  pdf:["report","download"],
  view:["details","open"],
  image:["photo","png","jpg","upload"],
  jpg:["image","upload"],
  png:["image","upload"],
  sms:["message","text","link"],
  whatsapp:["message","link","send"],
  browser:["chrome","supported"],
  chrome:["browser","recommended"]
};

const INTENT_PAIRS=[
  ["resend","link"],
  ["copy","link"],
  ["send","email"],
  ["download","report"],
  ["download","documents"],
  ["download","package"],
  ["download","pdf"],
  ["download","proof"],
  ["silence","notifications"],
  ["sync","shufti"],
  ["create","deed"],
  ["add","person"],
  ["status","approved"],
  ["status","reported"],
  ["status","findings"],
  ["status","pending"],
  ["login","dashboard"],
  ["poi","actions"],
  ["view","details"]
];

const STAGE_RULES=[
  {stage:"login",tokens:["login","sign","dashboard","sso","continue"]},
  {stage:"deeds",tokens:["deed","create","image","title","description","deeds"]},
  {stage:"poi",tokens:["person","interest","poi","label","buyer","seller","beneficiary","director"]},
  {stage:"link",tokens:["link","url","copy","journey","sms","whatsapp","email"]},
  {stage:"outcomes",tokens:["approved","pending","findings","pep","view","status"]},
  {stage:"reporting",tokens:["fiu","report","pdf","proof","zip","submission","reported"]},
  {stage:"poi-page",tokens:["page","filter","actions","columns","update","date","persons","interest"]},
  {stage:"reminders",tokens:["reminder","notifications","silence","bell","deadline","daily"]},
  {stage:"troubleshooting",tokens:["troubleshoot","problem","not","open","upload","refresh","browser","chrome"]},
  {stage:"definitions",tokens:["meaning","define","definition","what","stands","abbreviation","audit","trail"]}
];

function normalize(text){
  return String(text||"")
    .toLowerCase()
    .replace(/[→/|\\]/g," ")
    .replace(/&/g," and ")
    .replace(/[^a-z0-9\s-]/g," ")
    .replace(/-/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function normalizeWithSynonyms(text){
  let value=normalize(text);
  for(const [from,to] of PHRASE_SYNONYMS){
    value=value.replace(new RegExp(`\\b${from.replace(/[.*+?^${}()|[\\]\\]/g,"\\$&")}\\b`,"g"),to);
  }
  return value.replace(/\s+/g," ").trim();
}

function unique(values){
  return [...new Set(values.filter(Boolean))];
}

function tokenize(text){
  const base=normalizeWithSynonyms(text);
  const rawTokens=base.split(" ").filter(Boolean);
  const expanded=[];
  for(const token of rawTokens){
    expanded.push(token);
    if(TOKEN_SYNONYMS[token]) expanded.push(...TOKEN_SYNONYMS[token]);
  }
  return unique(expanded.filter(token=>token&&!STOP_WORDS.has(token)));
}

function getCharacterNgrams(text,size=3){
  const cleaned=normalizeWithSynonyms(text).replace(/\s+/g,"");
  if(!cleaned) return [];
  if(cleaned.length<=size) return [cleaned];
  const grams=[];
  for(let i=0;i<=cleaned.length-size;i+=1) grams.push(cleaned.slice(i,i+size));
  return unique(grams);
}

function jaccardSimilarity(left,right){
  const a=new Set(left);
  const b=new Set(right);
  if(!a.size||!b.size) return 0;
  let intersection=0;
  for(const value of a) if(b.has(value)) intersection+=1;
  const union=a.size+b.size-intersection;
  return union?intersection/union:0;
}

function editDistance(a,b){
  if(a===b) return 0;
  const left=a.length;
  const right=b.length;
  if(!left) return right;
  if(!right) return left;
  const dp=Array.from({length:left+1},()=>new Array(right+1).fill(0));
  for(let i=0;i<=left;i+=1) dp[i][0]=i;
  for(let j=0;j<=right;j+=1) dp[0][j]=j;
  for(let i=1;i<=left;i+=1){
    for(let j=1;j<=right;j+=1){
      const cost=a[i-1]===b[j-1]?0:1;
      dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+cost);
    }
  }
  return dp[left][right];
}

function tokenSimilarity(left,right){
  if(!left||!right) return 0;
  if(left===right) return 1;
  if(left.startsWith(right)||right.startsWith(left)){
    const ratio=Math.min(left.length,right.length)/Math.max(left.length,right.length);
    if(ratio>=0.7) return 0.93;
  }
  const distance=editDistance(left,right);
  const maxLen=Math.max(left.length,right.length);
  if(maxLen<=4&&distance===1) return 0.82;
  if(maxLen<=7&&distance===1) return 0.9;
  if(maxLen>=5&&distance===2) return 0.76;
  return 0;
}

function tokenSetScore(queryTokens,targetTokens){
  if(!queryTokens.length||!targetTokens.length) return 0;
  let score=0;
  const usedTargets=new Set();
  for(const queryToken of queryTokens){
    let best=0;
    let bestIndex=-1;
    for(let i=0;i<targetTokens.length;i+=1){
      if(usedTargets.has(i)) continue;
      const similarity=tokenSimilarity(queryToken,targetTokens[i]);
      if(similarity>best){
        best=similarity;
        bestIndex=i;
      }
    }
    if(bestIndex>=0){
      usedTargets.add(bestIndex);
      if(best===1) score+=9;
      else if(best>=0.9) score+=6.5;
      else if(best>=0.8) score+=4.5;
      else if(best>=0.75) score+=3;
    }
  }
  const exactOverlap=queryTokens.filter(token=>targetTokens.includes(token)).length;
  score+=exactOverlap*2;
  return score;
}

function countStrongMatches(queryTokens,targetTokens){
  let count=0;
  for(const queryToken of queryTokens){
    const strong=targetTokens.some(targetToken=>tokenSimilarity(queryToken,targetToken)>=0.9);
    if(strong) count+=1;
  }
  return count;
}

function buildEntryCorpus(entry){
  const questions=Array.isArray(entry.questions)?entry.questions:[];
  const keywords=Array.isArray(entry.keywords)?entry.keywords:[];
  const category=entry.category||"";
  const joined=[...questions,...keywords,category].join(" ");
  return {
    normalized:normalizeWithSynonyms(joined),
    tokens:tokenize(joined),
    questionNormals:questions.map(question=>normalizeWithSynonyms(question)),
    keywordNormals:keywords.map(keyword=>normalizeWithSynonyms(keyword)),
    ngrams:getCharacterNgrams(joined)
  };
}

function scoreIntentPairs(queryTokens,targetTokens){
  let score=0;
  for(const [left,right] of INTENT_PAIRS){
    const queryHasPair=queryTokens.includes(left)&&queryTokens.includes(right);
    const targetHasPair=targetTokens.includes(left)&&targetTokens.includes(right);
    if(queryHasPair&&targetHasPair) score+=24;
  }
  return score;
}

function detectStages(queryTokens){
  const matches=[];
  for(const rule of STAGE_RULES){
    const hitCount=rule.tokens.filter(token=>queryTokens.includes(token)).length;
    if(hitCount>0) matches.push({stage:rule.stage,count:hitCount});
  }
  matches.sort((a,b)=>b.count-a.count);
  return matches.map(item=>item.stage);
}

function getEntryStages(entry){
  const corpus=buildEntryCorpus(entry);
  return detectStages(corpus.tokens);
}

function stageCompatibilityBoost(queryStages,entryStages){
  if(!queryStages.length||!entryStages.length) return 0;
  let score=0;
  if(queryStages[0]===entryStages[0]) score+=26;
  const overlap=queryStages.filter(stage=>entryStages.includes(stage)).length;
  score+=overlap*10;
  return score;
}

function scoreActionPriority(queryTokens,entryTokens){
  const actionSignals=["button","icon","actions","notifications","bell","pdf","report","sync","documents","download","view"];
  const queryActionHits=actionSignals.filter(token=>queryTokens.includes(token));
  if(!queryActionHits.length) return 0;
  const matchingHits=queryActionHits.filter(token=>entryTokens.includes(token)).length;
  return matchingHits*12;
}

function scoreDefinitionsBoost(query,queryTokens,entry){
  const definitionSignals=["meaning","define","definition","stands","abbreviation","what is","what does"];
  const isDefinitionQuery=definitionSignals.some(signal=>query.includes(signal))||queryTokens.some(token=>["audit","trail","pending","approved","findings","poi","fiu","zip","pdf","sso","url"].includes(token));
  if(!isDefinitionQuery) return 0;
  const corpus=buildEntryCorpus(entry);
  let score=0;
  const definitionTerms=["pending","approved","findings","audit","trail","poi","fiu","zip","pdf","sso","url","evidence","view","update","date","copy","link"];
  for(const term of definitionTerms){
    if(queryTokens.includes(term)&&corpus.tokens.includes(term)) score+=9;
  }
  return score;
}

function scoreMatch(userQuestion,entry){
  const query=normalizeWithSynonyms(userQuestion);
  const queryTokens=tokenize(userQuestion);
  const queryNgrams=getCharacterNgrams(userQuestion);
  const corpus=buildEntryCorpus(entry);
  const queryStages=detectStages(queryTokens);
  const entryStages=getEntryStages(entry);
  let score=0;

  for(const question of corpus.questionNormals){
    if(query===question) score+=180;
    if(query&&question.includes(query)) score+=55;
    if(query&&query.includes(question)) score+=70;
    const qTokens=tokenize(question);
    score+=tokenSetScore(queryTokens,qTokens)*1.65;
    score+=jaccardSimilarity(queryNgrams,getCharacterNgrams(question))*42;
  }

  if(corpus.keywordNormals.some(keyword=>keyword&&query.includes(keyword))) score+=28;
  score+=tokenSetScore(queryTokens,corpus.tokens);
  score+=jaccardSimilarity(queryTokens,corpus.tokens)*30;
  score+=jaccardSimilarity(queryNgrams,corpus.ngrams)*24;
  score+=scoreIntentPairs(queryTokens,corpus.tokens);

  const strongMatchCount=countStrongMatches(queryTokens,corpus.tokens);
  const coverage=queryTokens.length?strongMatchCount/queryTokens.length:0;
  score+=strongMatchCount*8;
  score+=coverage*40;

  score+=stageCompatibilityBoost(queryStages,entryStages);
  score+=scoreActionPriority(queryTokens,corpus.tokens);
  score+=scoreDefinitionsBoost(query,queryTokens,entry);

  if(queryTokens.length<=4){
    const shortIntentHits=queryTokens.filter(token=>corpus.tokens.includes(token)).length;
    score+=shortIntentHits*5;
  }

  if((entry.category||"")&&query.includes(normalize(entry.category))) score+=8;
  return score;
}

function getTopMatches(question,limit=3){
  const ranked=qnaData.map(entry=>({entry,score:scoreMatch(question,entry)})).sort((a,b)=>b.score-a.score);
  return ranked.slice(0,limit);
}

function getBestEntry(question){
  const ranked=getTopMatches(question,3);
  const best=ranked[0];
  const second=ranked[1];
  if(!best||best.score<26) return {entry:null,ambiguous:false,options:[]};
  const ambiguous=second&&best.score<second.score*1.12&&best.score<58;
  if(ambiguous){
    return {
      entry:null,
      ambiguous:true,
      options:ranked.filter(item=>item.score>=26).map(item=>item.entry.questions[0]).slice(0,3)
    };
  }
  return {entry:best.entry,ambiguous:false,options:[]};
}

function getRelatedQuestions(currentEntry){
  if(!currentEntry) return [];
  const related=[];
  for(const entry of qnaData){
    if(entry.id===currentEntry.id) continue;
    const sameCategory=entry.category===currentEntry.category;
    const sharedKeywords=(entry.keywords||[]).filter(keyword=>(currentEntry.keywords||[]).includes(keyword)).length;
    if(sameCategory||sharedKeywords>0) related.push(entry.questions[0]);
    if(related.length===3) break;
  }
  if(related.length<3){
    for(const entry of qnaData){
      if(entry.id===currentEntry.id) continue;
      const candidate=entry.questions[0];
      if(!related.includes(candidate)) related.push(candidate);
      if(related.length===3) break;
    }
  }
  return related;
}

function addMessage(text,sender,relatedQuestions=[]){
  const chatBox=document.getElementById("chat-box");
  if(!chatBox) return;
  const message=document.createElement("div");
  message.className=`message ${sender}`;
  const textBlock=document.createElement("div");
  textBlock.className="message-text";
  textBlock.textContent=text;
  message.appendChild(textBlock);
  if(sender==="bot"&&relatedQuestions.length){
    const relatedWrap=document.createElement("div");
    relatedWrap.className="related-questions";
    const label=document.createElement("div");
    label.className="related-label";
    label.textContent="Related questions";
    relatedWrap.appendChild(label);
    relatedQuestions.forEach(questionText=>{
      const button=document.createElement("button");
      button.type="button";
      button.className="related-question-chip";
      button.textContent=questionText;
      button.addEventListener("click",()=>{
        askQuestion(questionText);
        if(userInput) userInput.focus();
      });
      relatedWrap.appendChild(button);
    });
    message.appendChild(relatedWrap);
  }
  chatBox.appendChild(message);
  chatBox.scrollTop=chatBox.scrollHeight;
}

function updateAssistantStatus(message){
  const status=document.getElementById("assistant-status");
  if(status) status.textContent=message;
}

function setMicState(listening){
  isListening=listening;
  if(!micButton) return;
  micButton.classList.toggle("listening",listening);
  micButton.setAttribute("aria-pressed",String(listening));
  micButton.setAttribute("title",listening?"Stop voice input":"Use voice input");
  micButton.textContent=listening?"Stop":"Mic";
}

async function loadQnA(){
  try{
    const response=await fetch("data/qna.json",{cache:"no-store"});
    if(!response.ok) throw new Error("Could not load Q&A data.");
    qnaData=await response.json();
  }catch(error){
    addMessage("The help content could not be loaded right now. Please refresh the page and try again.","bot");
    console.error(error);
  }
}

function askQuestion(question){
  const cleaned=question.trim();
  if(!cleaned) return;
  addMessage(cleaned,"user");
  const match=getBestEntry(cleaned);
  if(match.ambiguous){
    addMessage("I found a few close topics. Pick the one that matches what you mean.","bot",match.options);
    return;
  }
  const bestEntry=match.entry;
  const answer=bestEntry?bestEntry.answer:"I could not find a clear answer in the current ComplyWhistle help content yet. Please try asking in a different way or contact your administrator or AXIOMA for assistance.";
  const related=bestEntry?getRelatedQuestions(bestEntry):[];
  addMessage(answer,"bot",related);
}

async function requestMicPermission(){
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia) return true;
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});
  stream.getTracks().forEach(track=>track.stop());
  return true;
}

function initializeVoiceInput(){
  micButton=document.getElementById("mic-button");
  userInput=document.getElementById("user-input");
  if(!micButton||!userInput) return;
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SpeechRecognition){
    micButton.disabled=true;
    updateAssistantStatus("Voice input is not supported in this browser. You can still type your question.");
    return;
  }
  recognition=new SpeechRecognition();
  recognition.lang="en-US";
  recognition.interimResults=true;
  recognition.continuous=false;
  recognition.maxAlternatives=1;
  let finalTranscript="";
  let shouldAutoSubmit=false;
  recognition.onstart=()=>{
    finalTranscript="";
    shouldAutoSubmit=false;
    setMicState(true);
    updateAssistantStatus("Listening... Speak your question now.");
  };
  recognition.onresult=event=>{
    let interim="";
    for(let i=event.resultIndex;i<event.results.length;i+=1){
      const transcript=event.results[i][0].transcript.trim();
      if(event.results[i].isFinal){
        finalTranscript=`${finalTranscript} ${transcript}`.trim();
        shouldAutoSubmit=true;
      }else{
        interim=`${interim} ${transcript}`.trim();
      }
    }
    const combined=`${finalTranscript} ${interim}`.trim();
    if(combined) userInput.value=combined;
  };
  recognition.onerror=event=>{
    setMicState(false);
    shouldAutoSubmit=false;
    let message="Voice input could not be started. Please try again.";
    switch(event.error){
      case"not-allowed":
      case"service-not-allowed":
        message="Microphone access was blocked. Please allow microphone access and try again.";
        break;
      case"no-speech":
        message="No speech was detected. Please click Mic and try again.";
        break;
      case"audio-capture":
        message="No microphone was detected. Please check your microphone and try again.";
        break;
      case"network":
        message="Voice input hit a network issue. Please try again.";
        break;
      default:
        message=`Voice input error: ${event.error}. Please try again.`;
    }
    updateAssistantStatus(message);
  };
  recognition.onend=()=>{
    const transcript=userInput.value.trim();
    setMicState(false);
    if(shouldAutoSubmit&&transcript){
      updateAssistantStatus("Voice input captured. Sending your question...");
      askQuestion(transcript);
      userInput.value="";
      updateAssistantStatus("Voice input ready. Click Mic to speak your question.");
      return;
    }
    if(!userInput.value.trim()) updateAssistantStatus("Voice input ready. Click Mic to speak your question.");
    else updateAssistantStatus("Voice captured. You can edit the text or click Send.");
  };
  micButton.addEventListener("click",async()=>{
    if(!recognition) return;
    if(isListening){
      recognition.stop();
      return;
    }
    try{
      updateAssistantStatus("Checking microphone permission...");
      await requestMicPermission();
      userInput.focus();
      recognition.start();
    }catch(error){
      console.error(error);
      setMicState(false);
      updateAssistantStatus("Microphone access was denied or unavailable. Please allow microphone access in Chrome and try again.");
    }
  });
  updateAssistantStatus("Voice input ready. Click Mic to speak your question.");
}

document.addEventListener("DOMContentLoaded",async()=>{
  await loadQnA();
  initializeVoiceInput();
  const chatForm=document.getElementById("chat-form");
  userInput=document.getElementById("user-input");
  document.querySelectorAll(".suggestion-chip").forEach(button=>button.addEventListener("click",()=>{
    const question=button.getAttribute("data-question")||"";
    askQuestion(question);
    if(userInput) userInput.focus();
  }));
  if(chatForm&&userInput){
    chatForm.addEventListener("submit",event=>{
      event.preventDefault();
      askQuestion(userInput.value);
      userInput.value="";
      userInput.focus();
      updateAssistantStatus("Voice input ready. Click Mic to speak your question.");
    });
  }
});