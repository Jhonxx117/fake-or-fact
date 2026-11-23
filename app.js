// ===== RÉGLAGES =====
const CONFIG={rounds:6,debateSeconds:90,pointsCorrectVote:2,pointsTrollWin:3,frenchPenalty:1,maxTrolls:2,minPlayers:3,maxPlayers:6};
firebase.initializeApp({projectId:"fakeorfact-8274b",databaseURL:"https://fakeorfact-8274b-default-rtdb.europe-west1.firebasedatabase.app"});

const db=firebase.database(),app=document.getElementById('app'),$=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const uid=()=>Math.random().toString(36).slice(2,10);
const store={get:k=>{try{return sessionStorage.getItem(k)}catch(e){return null}},set:(k,v)=>{try{sessionStorage.setItem(k,v)}catch(e){}},del:k=>{try{sessionStorage.removeItem(k)}catch(e){}}};
const show=h=>{app.innerHTML=h},err=m=>{const e=$('err');if(e)e.textContent=m};
let room,pid,ref,R,offset=0,draft='',roleShown=false,seenRound=0;
db.ref('.info/serverTimeOffset').on('value',s=>{offset=s.val()||0});
const now=()=>Date.now()+offset,isHost=()=>R&&R.host===pid,pn=i=>esc(R.players[i].name);
const scores=()=>`<ul>${Object.keys(R.players).sort((a,b)=>R.players[b].score-R.players[a].score).map(i=>`<li>${pn(i)}: ${R.players[i].score}</li>`).join('')}</ul>`;

// ----- Accueil, création, connexion -----
function home(){
  const q=(new URLSearchParams(location.search).get('room')||'').toUpperCase().slice(0,4);
  show(`<h1>Fake or Fact</h1><p class="sub">No account, no personal data. Just a nickname.</p>
  <label for="nm">Nickname</label><input id="nm" maxlength="14" autocomplete="off">
  <label for="cd">Room code</label><input id="cd" maxlength="4" value="${esc(q)}" autocapitalize="characters" autocomplete="off">
  <p id="err" class="FAKE"></p><button id="jn">Join</button>${q?'':'<button id="mk" class="ghost">Create a game</button>'}`);
  $('jn').onclick=()=>join($('cd').value.trim().toUpperCase(),$('nm').value.trim());
  if($('mk'))$('mk').onclick=create;
}
async function create(){
  const name=$('nm').value.trim();if(!name)return err('Enter a nickname.');
  const code=Array.from({length:4},()=>'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.random()*31|0]).join('');
  pid=uid();
  try{await db.ref('rooms/'+code).set({host:pid,phase:'lobby',round:0,players:{[pid]:{name,score:0}}})}catch(e){return err('Connection failed. Check your network.')}
  enter(code);
}
async function join(code,name){
  if(!name)return err('Enter a nickname.');
  if(code.length!==4)return err('The room code has 4 characters.');
  let s;try{s=await db.ref('rooms/'+code).get()}catch(e){return err('Connection failed. Check your network.')}
  if(!s.exists())return err('Room not found. Check the code.');
  const r=s.val(),ps=Object.values(r.players||{});
  if(r.phase!=='lobby')return err('This game has already started.');
  if(ps.length>=CONFIG.maxPlayers)return err('The room is full.');
  if(ps.some(p=>p.name.toLowerCase()===name.toLowerCase()))return err('This nickname is taken.');
  pid=uid();await db.ref(`rooms/${code}/players/${pid}`).set({name,score:0});enter(code);
}
function enter(code){
  room=code;store.set('fof',JSON.stringify({code,pid}));ref=db.ref('rooms/'+code);
  ref.on('value',s=>{R=s.val();if(!R){leave();return}render()});
  setInterval(updTimer,500);
}
function leave(){store.del('fof');if(ref)ref.off();ref=R=null;history.replaceState(null,'',location.pathname);home()}

// ----- Affichage selon la phase -----
function render(){
  const c=$('codes');if(c)draft=c.value;const had=c&&document.activeElement===c;
  if(R.phase!=='vote')draft='';
  ({lobby,role,debate,vote,verdict,end:final})[R.phase]();
  const n=$('codes');if(n){n.value=draft;if(had)n.focus()}
}
function lobby(){
  const url=location.origin+location.pathname+'?room='+room,ids=Object.keys(R.players),qr=qrcode(0,'M');
  qr.addData(url);qr.make();
  show(`<h1>Room ${room}</h1><p class="sub">Scan to join, or enter the code on the home page.</p>
  <div class="qr">${qr.createSvgTag(5,0)}</div><p class="muted">${esc(url)}</p>
  <h2>Players (${ids.length}/${CONFIG.maxPlayers})</h2><ul>${ids.map(i=>`<li>${pn(i)}${i===R.host?' (host)':''}</li>`).join('')}</ul>
  ${isHost()?`<button id="st" ${ids.length<CONFIG.minPlayers?'disabled':''}>Start game</button>${ids.length<CONFIG.minPlayers?'<p class="muted">At least 3 players needed.</p>':''}`:'<p class="muted">Waiting for the host to start.</p>'}`);
  if(isHost())$('st').onclick=startRound;
}
function startRound(){
  const ids=Object.keys(R.players),n=R.round+1,used=R.used||[],left=HEADLINES.map((_,i)=>i).filter(i=>!used.includes(i));
  if(n>CONFIG.rounds||!left.length)return ref.update({phase:'end'});
  const k=left[Math.random()*left.length|0],max=ids.length>=5?CONFIG.maxTrolls:1,t=Math.floor(Math.random()*(max+1)),roles={};
  shuffle(ids).forEach((i,j)=>roles[i]=j<t?'Troll':'Citizen');
  ref.update({phase:'role',round:n,headline:HEADLINES[k],used:[...used,k],roles,votes:null,verdict:null,endsAt:null});
}
function role(){
  if(R.round!==seenRound){seenRound=R.round;roleShown=false}
  const my=R.roles[pid];
  show(`<p class="muted">Round ${R.round} of ${CONFIG.rounds}</p><h2>Breaking news</h2><div class="box headline">${esc(R.headline)}</div>
  <div class="box">${roleShown?`<div class="headline ${my==='Troll'?'FAKE':'FACT'}">${my}</div><p>${my==='Troll'?'Slip a red flag into the post without being caught.':'Build a reliable post and find the Troll, if there is one.'}</p>`:'<p>Make sure nobody can see your screen.</p>'}
  <button id="rv" class="ghost">${roleShown?'Hide my role':'Show my role'}</button></div>
  <ol><li>Refresh: swap one card if you want.</li><li>Play one card face down.</li><li>Shuffle, then flip the cards.</li></ol>
  ${isHost()?'<button id="go">Start the debate</button>':'<p class="muted">Waiting for the host.</p>'}`);
  $('rv').onclick=()=>{roleShown=!roleShown;role()};
  if(isHost())$('go').onclick=()=>ref.update({phase:'debate',endsAt:now()+CONFIG.debateSeconds*1000});
}
function debate(){
  show(`<h2>Debate (English only)</h2><div class="timer" id="t">--</div><div class="box">${esc(R.headline)}</div>
  <p>Is the post reliable? Who is the Troll? Every French word costs 1 point.</p>${isHost()?'<button id="go" class="ghost">Go to vote now</button>':''}`);
  if(isHost())$('go').onclick=toVote;updTimer();
}
const toVote=()=>{if(R&&R.phase==='debate')ref.update({phase:'vote'})};
function updTimer(){
  const t=$('t');if(!t||!R||R.phase!=='debate')return;
  const l=Math.max(0,Math.ceil((R.endsAt-now())/1000));t.textContent=l;if(l<=0&&isHost())toVote();
}
function vote(){
  const ids=Object.keys(R.players),v=R.votes||{},mine=v[pid];
  show(`<h2>Vote</h2><div class="box">${esc(R.headline)}</div><p>Is this post reliable enough to share?</p>
  <button id="s" class="${mine==='SHARE'?'':'ghost'}">SHARE</button><button id="r" class="${mine==='REPORT'?'':'ghost'}">REPORT</button>
  <h2>Votes in</h2><p>${ids.map(i=>`${pn(i)} ${v[i]?'✓':'…'}`).join(', ')}</p>
  ${isHost()?`<label for="codes">Codes of the cards on the table</label><input id="codes" placeholder="S01, E02, T01, V01, D01" autocapitalize="characters" autocomplete="off"><p id="err" class="FAKE"></p><button id="go">Reveal verdict</button>`:'<p class="muted">Waiting for the verdict.</p>'}`);
  $('s').onclick=()=>ref.child('votes/'+pid).set('SHARE');
  $('r').onclick=()=>ref.child('votes/'+pid).set('REPORT');
  if(isHost())$('go').onclick=reveal;
}
function reveal(){
  const codes=($('codes').value||'').toUpperCase().split(/[\s,;]+/).filter(Boolean),cards=codes.map(c=>CARDS.find(x=>x.id===c));
  if(!codes.length||cards.includes(undefined))return err('Unknown or missing code. Check the cards.');
  const flags=cards.filter(c=>c.type==='redflag').map(c=>c.id),fake=flags.length>0,votes=R.votes||{},ids=Object.keys(R.players);
  const shared=ids.filter(i=>votes[i]==='SHARE').length>ids.length/2,good=fake?'REPORT':'SHARE',upd={};
  ids.forEach(i=>{let s=R.players[i].score;if(votes[i]===good)s+=CONFIG.pointsCorrectVote;if(fake&&shared&&R.roles[i]==='Troll')s+=CONFIG.pointsTrollWin;upd[`players/${i}/score`]=s});
  upd.phase='verdict';upd.verdict={fake,shared,flags,codes};
  if(fake&&shared)upd.missed=[...(R.missed||[]),...flags];
  ref.update(upd);
}
function verdict(){
  const V=R.verdict,fl=(V.flags||[]).map(id=>CARDS.find(c=>c.id===id)).filter(Boolean),ids=Object.keys(R.players),tr=ids.filter(i=>R.roles[i]==='Troll');
  show(`<div class="verdict ${V.fake?'FAKE':'FACT'}">${V.fake?'FAKE':'FACT'}</div><p>${V.shared?'The table shared the post.':'The table reported the post.'}</p>
  ${fl.length?`<h2>Red flags</h2><ul>${fl.map(c=>`<li><strong>${esc(c.text)}</strong><br>${esc(c.why)}</li>`).join('')}</ul>`:'<p>No red flag: the post is reliable.</p>'}
  <h2>Trolls</h2><p>${tr.length?tr.map(i=>pn(i)).join(', '):'There was no Troll this round.'}</p><h2>Scores</h2>${scores()}
  ${isHost()?`<p class="muted">Lost in translation: tap a name for each French word.</p>${ids.map(i=>`<button class="ghost" data-i="${i}">${pn(i)} −${CONFIG.frenchPenalty}</button>`).join('')}<div><button id="nx">${R.round>=CONFIG.rounds?'See final scores':'Next round'}</button></div>`:'<p class="muted">Waiting for the host.</p>'}`);
  if(isHost()){
    app.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>ref.child(`players/${b.dataset.i}/score`).transaction(s=>(s||0)-CONFIG.frenchPenalty));
    $('nx').onclick=startRound;
  }
}
function final(){
  const miss=[...new Set(R.missed||[])].map(id=>CARDS.find(c=>c.id===id)).filter(Boolean);
  show(`<h1>Final scores</h1>${scores()}
  ${miss.length?`<h2>Red flags the table missed</h2><ul>${miss.map(c=>`<li><strong>${esc(c.text)}</strong><br>${esc(c.why)}</li>`).join('')}</ul>`:'<p>No red flag slipped through. Well done.</p>'}
  ${isHost()?'<button id="cl">Close the room</button>':'<button id="lv">Leave</button>'}`);
  if(isHost())$('cl').onclick=()=>ref.remove();else $('lv').onclick=leave;
}

// ----- Démarrage : reprend la partie en cours après un rechargement -----
(async()=>{
  const sv=JSON.parse(store.get('fof')||'null'),q=(new URLSearchParams(location.search).get('room')||'').toUpperCase();
  if(sv&&(!q||q===sv.code)){
    try{const s=await db.ref(`rooms/${sv.code}/players/${sv.pid}`).get();if(s.exists()){pid=sv.pid;return enter(sv.code)}}catch(e){}
  }
  home();
})();
