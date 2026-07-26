const stages = ['Title','Classification','Houses','Celebrations','Activities','Difficulties'];
let score = {structure:0, paragraphs:0, keywords:0, tf:0, complete:0, listening:0, pronunciation:0, final:0};
let selectedWord = null;
const $ = (id)=>document.getElementById(id);
function setFeedback(id, msg, ok){ const el=$(id); el.textContent=msg; el.className='feedback '+(ok?'correct':'wrong'); }

function speak(text){
  if(!('speechSynthesis' in window)){ alert('Audio is not available in this browser.'); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.lang='en-US'; u.rate=.82; speechSynthesis.speak(u);
}

function shuffle(arr){ return [...arr].sort(()=>Math.random()-.5); }

function initStructure(){
  const list=$('structure-list'); list.innerHTML='';
  shuffle(stages).forEach(s=>{
    const div=document.createElement('div'); div.className='drag-item'; div.draggable=true; div.textContent=s; list.appendChild(div);
  });
  let drag=null;
  list.addEventListener('dragstart',e=>{ if(e.target.classList.contains('drag-item')) drag=e.target; });
  list.addEventListener('dragover',e=>{ e.preventDefault(); const target=e.target.closest('.drag-item'); if(target && target!==drag) target.classList.add('drag-over'); });
  list.addEventListener('dragleave',e=>{ const target=e.target.closest('.drag-item'); if(target) target.classList.remove('drag-over'); });
  list.addEventListener('drop',e=>{
    e.preventDefault(); const target=e.target.closest('.drag-item'); document.querySelectorAll('.drag-over').forEach(x=>x.classList.remove('drag-over'));
    if(target && drag && target!==drag){ const children=[...list.children]; const dragIndex=children.indexOf(drag); const targetIndex=children.indexOf(target); if(dragIndex<targetIndex) target.after(drag); else target.before(drag); }
  });
}
function checkStructure(){
  const current=[...$('structure-list').children].map(x=>x.textContent);
  let pts=current.filter((x,i)=>x===stages[i]).length; score.structure=pts;
  setFeedback('structure-feedback', pts===6?`Excellent! ${pts}/6`:`Try again. ${pts}/6 are in the correct place.`, pts===6);
}

const paragraphs=[
  {text:'Juana and Her Life in Chocó', ans:'Title'},
  {text:'Juana is a girl who belongs to an Afro-Colombian community located in Chocó, in the west of Colombia. She is 10 years old and lives with her family near the Atrato River.', ans:'Classification'},
  {text:'Juana lives in a wooden house. The houses in her community are built on stilts because it rains a lot in Chocó.', ans:'Houses'},
  {text:'Besides its beautiful landscapes, Juana’s community is also rich in culture and traditions. Juana enjoys music and traditional dances. During celebrations, people play drums, sing, and dance together.', ans:'Celebrations'},
  {text:'In her daily life, Juana helps her family and enjoys spending time outdoors. She likes fishing with her uncle, helping her mother cook, singing and playing with her friends near the river.', ans:'Activities'},
  {text:'However, life in Chocó also has some challenges. One of the main problems in Juana’s community is transportation. Some roads are muddy, and many families travel by boat to go to school or buy food. Despite these challenges, Juana feels proud of her community and culture.', ans:'Difficulties'}
];
function initParagraphs(){
  const box=$('paragraph-game'); box.innerHTML='';
  shuffle(paragraphs).forEach((p,i)=>{
    const q=document.createElement('div'); q.className='q'; q.dataset.ans=p.ans;
    q.innerHTML=`<p>${p.text}</p><select><option value="">Choose a stage</option>${stages.map(s=>`<option>${s}</option>`).join('')}</select>`;
    box.appendChild(q);
  });
}
function checkParagraphs(){
  const qs=[...document.querySelectorAll('#paragraph-game .q')];
  let pts=qs.filter(q=>q.querySelector('select').value===q.dataset.ans).length; score.paragraphs=pts;
  setFeedback('paragraph-feedback', pts===qs.length?`Great job! ${pts}/${qs.length}`:`Keep trying. ${pts}/${qs.length}`, pts===qs.length);
}

const keyWords = [
  ['wooden house','Houses'],['stilts','Houses'],['rains a lot','Houses'],['house near the river','Houses'],
  ['traditional dances','Celebrations'],['drums','Celebrations'],['sing','Celebrations'],['culture','Celebrations'],
  ['fishing','Activities'],['helping family','Activities'],['cooking','Activities'],['playing with friends','Activities'],
  ['transportation','Difficulties'],['muddy roads','Difficulties'],['boat','Difficulties'],['challenges','Difficulties']
];
function initKeywords(){
  const bank=$('word-bank'); const cats=$('categories'); bank.innerHTML=''; cats.innerHTML=''; selectedWord=null;
  shuffle(keyWords).forEach(([w,c])=>{ const span=document.createElement('span'); span.className='word'; span.textContent=w; span.dataset.cat=c; span.onclick=()=>{ document.querySelectorAll('.word').forEach(x=>x.classList.remove('selected')); if(!span.classList.contains('used')){ selectedWord=span; span.classList.add('selected'); } }; bank.appendChild(span); });
  ['Houses','Celebrations','Activities','Difficulties'].forEach(c=>{ const div=document.createElement('div'); div.className='category'; div.dataset.cat=c; div.innerHTML=`<h4>${c==='Houses'?'🏠':c==='Celebrations'?'🥁':c==='Activities'?'🎣':'🚤'} ${c}</h4><div class="dropzone"></div>`; div.onclick=()=>{ if(selectedWord){ const p=document.createElement('span'); p.className='placed'; p.textContent=selectedWord.textContent; p.dataset.cat=selectedWord.dataset.cat; div.querySelector('.dropzone').appendChild(p); selectedWord.classList.add('used'); selectedWord.classList.remove('selected'); selectedWord=null; } }; cats.appendChild(div); });
}
function checkKeywords(){
  const placed=[...document.querySelectorAll('.placed')]; let pts=placed.filter(p=>p.dataset.cat===p.closest('.category').dataset.cat).length; score.keywords=pts;
  setFeedback('keywords-feedback', pts===16?`Amazing! ${pts}/16`:`You have ${pts}/16 correct.`, pts===16);
}
function resetKeywords(){ initKeywords(); setFeedback('keywords-feedback','',true); }

const tf = [
 ['Juana lives in Chocó.', true],['Juana lives in an apartment.', false],['Juana lives near the Atrato River.', true],['Juana enjoys fishing with her uncle.', true],['Juana travels by airplane to school.', false],['The roads in Juana’s community can be muddy.', true],['People play drums during celebrations in Juana’s community.', true],['Juana’s house is made of wood.', true],['Juana lives in Bogotá.', false],['Juana feels proud of her community.', true]
];
function initTF(){ const box=$('tf-game'); box.innerHTML=''; tf.forEach((x,i)=>{ const q=document.createElement('div'); q.className='q'; q.dataset.ans=x[1]; q.innerHTML=`<p>${i+1}. ${x[0]}</p><div class="options"><button type="button" class="option" data-val="true">✅ True</button><button type="button" class="option" data-val="false">❌ False</button></div>`; box.appendChild(q); }); bindOptions('#tf-game'); }
function bindOptions(scope){ document.querySelectorAll(`${scope} .option`).forEach(btn=>btn.onclick=()=>{ const parent=btn.closest('.options'); parent.querySelectorAll('.option').forEach(b=>b.classList.remove('selected')); btn.classList.add('selected'); }); }
function checkTF(){ const qs=[...document.querySelectorAll('#tf-game .q')]; let pts=qs.filter(q=>q.querySelector('.selected')?.dataset.val===q.dataset.ans).length; score.tf=pts; setFeedback('tf-feedback', pts===qs.length?`Excellent! ${pts}/${qs.length}`:`You got ${pts}/${qs.length}.`, pts===qs.length); }

const complete=[
 ['Juana lives near the ____ River.','Atrato',['Atrato','Amazon','Magdalena']],
 ['She lives in a ____ house.','wooden',['brick','wooden','modern']],
 ['The houses are built on ____.','stilts',['roads','stilts','boats']],
 ['People play ____ during celebrations.','drums',['phones','drums','planes']],
 ['Some roads are ____.','muddy',['muddy','dry','clean']],
 ['Juana feels ____ of her community.','proud',['bored','proud','angry']]
];
function initComplete(){ const box=$('complete-game'); box.innerHTML=''; complete.forEach((x,i)=>{ const q=document.createElement('div'); q.className='q'; q.dataset.ans=x[1]; q.innerHTML=`<p>${i+1}. ${x[0]}</p><div class="options">${x[2].map(o=>`<button type="button" class="option" data-val="${o}">${o}</button>`).join('')}</div>`; box.appendChild(q); }); bindOptions('#complete-game'); }
function checkComplete(){ const qs=[...document.querySelectorAll('#complete-game .q')]; let pts=qs.filter(q=>q.querySelector('.selected')?.dataset.val===q.dataset.ans).length; score.complete=pts; setFeedback('complete-feedback', pts===qs.length?`Great! ${pts}/${qs.length}`:`You got ${pts}/${qs.length}.`, pts===qs.length); }

const listening=[
 ['Juana lives in a wooden house.','wooden house',['apartment','wooden house','airplane']],
 ['People play drums during celebrations.','drums',['drums','boat','muddy roads']],
 ['Juana likes fishing with her uncle.','fishing',['Christmas','fishing','grafiti']],
 ['Many families travel by boat.','boat',['boat','school','bedroom']],
 ['It rains a lot in Chocó.','rains a lot',['rains a lot','sunny city','snow']]
];
function initListening(){ const box=$('listening-game'); box.innerHTML=''; listening.forEach((x,i)=>{ const q=document.createElement('div'); q.className='listen-card q'; q.dataset.ans=x[1]; q.innerHTML=`<div><p>${i+1}. Listen and choose.</p><div class="options">${x[2].map(o=>`<button type="button" class="option" data-val="${o}">${o}</button>`).join('')}</div></div><button class="speaker" onclick="speak('${x[0].replace(/'/g,"\\'")}')">🔊 Listen</button>`; box.appendChild(q); }); bindOptions('#listening-game'); }
function checkListening(){ const qs=[...document.querySelectorAll('#listening-game .q')]; let pts=qs.filter(q=>q.querySelector('.selected')?.dataset.val===q.dataset.ans).length; score.listening=pts; setFeedback('listening-feedback', pts===qs.length?`Excellent listening! ${pts}/${qs.length}`:`You got ${pts}/${qs.length}.`, pts===qs.length); }

const pron=[
 ['life','/aɪ/'],['likes','/aɪ/'],['by','/aɪ/'],['buy','/aɪ/'],
 ['play','/eɪ/'],['rains','/eɪ/'],['landscapes','/eɪ/'],
 ['fishing','-ing'],['singing','-ing'],['helping','-ing']
];
function initPronunciation(){ const box=$('pron-game'); box.innerHTML=''; shuffle(pron).forEach((x,i)=>{ const q=document.createElement('div'); q.className='q'; q.dataset.ans=x[1]; q.innerHTML=`<p>${i+1}. <strong>${x[0]}</strong> <button class="speaker" onclick="speak('${x[0]}')">🔊</button></p><div class="options"><button type="button" class="option" data-val="/aɪ/">🟢 /aɪ/</button><button type="button" class="option" data-val="/eɪ/">🔵 /eɪ/</button><button type="button" class="option" data-val="-ing">🟣 -ing</button></div>`; box.appendChild(q); }); bindOptions('#pron-game'); }
function checkPronunciation(){ const qs=[...document.querySelectorAll('#pron-game .q')]; let pts=qs.filter(q=>q.querySelector('.selected')?.dataset.val===q.dataset.ans).length; score.pronunciation=pts; setFeedback('pron-feedback', pts===qs.length?`Great pronunciation work! ${pts}/${qs.length}`:`You got ${pts}/${qs.length}.`, pts===qs.length); }

const finalQ=[
 ['What is the main purpose of the text?','To describe Juana and her community',['To tell a joke','To describe Juana and her community','To give cooking instructions']],
 ['Which stage comes first after the title?','Classification',['Activities','Classification','Difficulties']],
 ['Where does Juana live?','Chocó',['Bogotá','Chocó','Caquetá']],
 ['Why are houses built on stilts?','Because it rains a lot',['Because it is cold','Because it rains a lot','Because they are apartments']],
 ['Which word introduces the celebrations paragraph?','Besides',['However','Besides','One']],
 ['Which activity does Juana enjoy?','Fishing',['Fishing','Driving','Watching TV']],
 ['What is one difficulty?','Transportation',['Transportation','Too many parks','Snow']],
 ['What does “belongs” mean?','is part of',['travels to','is part of','buys food']],
 ['Which pair belongs to Difficulties?','transportation - muddy roads',['music - drums','transportation - muddy roads','wooden house - stilts']],
 ['How does Juana feel about her community?','proud',['proud','angry','bored']]
];
function initFinal(){ const box=$('final-quiz'); box.innerHTML=''; finalQ.forEach((x,i)=>{ const q=document.createElement('div'); q.className='q'; q.dataset.ans=x[1]; q.innerHTML=`<p>${i+1}. ${x[0]}</p><div class="options">${x[2].map(o=>`<button type="button" class="option" data-val="${o}">${o}</button>`).join('')}</div>`; box.appendChild(q); }); bindOptions('#final-quiz'); }
function checkFinal(){ const qs=[...document.querySelectorAll('#final-quiz .q')]; let pts=qs.filter(q=>q.querySelector('.selected')?.dataset.val===q.dataset.ans).length; score.final=pts; const totalPossible=6+6+16+10+6+5+10+10; const total=Object.values(score).reduce((a,b)=>a+b,0); let msg=pts>=9?'Excellent! 🌟':pts>=7?'Good job! 😊':'Keep practicing! 💪'; $('final-feedback').className='feedback big correct'; $('final-feedback').innerHTML=`${msg}<br>Final Challenge: ${pts}/10<br>Total page score: ${total}/${totalPossible}`; }

window.addEventListener('DOMContentLoaded',()=>{ initStructure(); initParagraphs(); initKeywords(); initTF(); initComplete(); initListening(); initPronunciation(); initFinal(); });
