// ===== RÉGLAGES =====
const VERSION='4'; // à changer seulement si la structure des données de la salle change
const CONFIG={rounds:6,debateSeconds:90,pointsCorrectVote:2,pointsTrollWin:1,frenchPenalty:1,maxTrolls:2,minPlayers:3,maxPlayers:6,idleMinutes:20,endedMinutes:30};
firebase.initializeApp({projectId:"fakeorfact-8274b",databaseURL:"https://fakeorfact-8274b-default-rtdb.europe-west1.firebasedatabase.app"});

const db=firebase.database(),app=document.getElementById('app'),$=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const uid=()=>Math.random().toString(36).slice(2,10);
const store={get:k=>{try{return sessionStorage.getItem(k)}catch(e){return null}},set:(k,v)=>{try{sessionStorage.setItem(k,v)}catch(e){}},del:k=>{try{sessionStorage.removeItem(k)}catch(e){}}};
const show=h=>{app.innerHTML=h},err=m=>{const e=$('err');if(e)e.textContent=m};
// Petit message en haut de l'écran, qui disparaît après 5 secondes
const notice=m=>{const d=document.createElement('div');d.className='box toast';d.textContent=m;document.body.appendChild(d);setTimeout(()=>d.classList.add('out'),4500);setTimeout(()=>d.remove(),5000)};
// ----- Animations -----
// Les éléments de l'écran apparaissent un par un, SEULEMENT quand on change d'écran (pas à chaque mise à jour de Firebase)
let animKey=null,flipRole=false,popCard=null;
const animate=key=>{if(key===animKey)return;animKey=key;[...app.children].forEach((el,i)=>{el.style.animationDelay=Math.min(i*60,480)+'ms';el.classList.add('in')})};
let prevR=null,lastLeft='',room,pid,ref,R,offset=0,roleShown=false,seenRound=0,sel=null,done=0,lastPhase=null;
db.ref('.info/serverTimeOffset').on('value',s=>{offset=s.val()||0});
const now=()=>Date.now()+offset,isHost=()=>R&&R.host===pid,pn=i=>esc(R.players[i].name);
const act=()=>Object.keys(R.players).filter(i=>R.roles&&R.roles[i]);
const scores=()=>`<ul>${Object.keys(R.players).sort((a,b)=>R.players[b].score-R.players[a].score).map(i=>`<li>${pn(i)}: ${R.players[i].score}</li>`).join('')}</ul>`;

// ----- Accueil, création, connexion -----
function home(){
  const q=(new URLSearchParams(location.search).get('room')||'').toUpperCase().slice(0,4);
  show(`<h1 class="logo"><img src="ADDS/logo.png" alt="Fake or Fact"></h1><p class="sub">No account, no personal data. Just a nickname.</p>
  <label for="nm">Nickname</label><input id="nm" maxlength="14" autocomplete="off">
  <label for="cd">Room code</label><input id="cd" maxlength="4" value="${esc(q)}" autocapitalize="characters" autocomplete="off">
  <p id="err" class="FAKE"></p><button id="jn">Join</button>${q?'':'<button id="mk" class="ghost">Create a game</button>'}`);
  $('jn').onclick=()=>join($('cd').value.trim().toUpperCase(),$('nm').value.trim());
  if($('mk'))$('mk').onclick=create;
  animate('home');
  $('cd').oninput=e=>{e.target.value=e.target.value.toUpperCase()}; // code de salle toujours en majuscules
}
async function create(){
  const name=$('nm').value.trim();if(!name)return err('Enter a nickname.');
  const code=Array.from({length:4},()=>'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.random()*31|0]).join('');
  pid=uid();
  try{await db.ref('rooms/'+code).set({ver:VERSION,host:pid,phase:'lobby',round:0,players:{[pid]:{name,score:0}}})}catch(e){return err('Connection failed. Check your network.')}
  enter(code);
}
async function join(code,name){
  if(!name)return err('Enter a nickname.');
  if(code.length!==4)return err('The room code has 4 characters.');
  let s;try{s=await db.ref('rooms/'+code).get()}catch(e){return err('Connection failed. Check your network.')}
  if(!s.exists())return err('Room not found. Check the code.');
  const r=s.val(),ps=Object.values(r.players||{});
  if(ps.length>=CONFIG.maxPlayers)return err('The room is full.');
  if(ps.some(p=>p.name.toLowerCase()===name.toLowerCase()))return err('This nickname is taken.');
  pid=uid();await db.ref(`rooms/${code}/players/${pid}`).set({name,score:0});enter(code);
}
function enter(code){
  prevR=null;lastLeft='';room=code;done=0;lastPhase=null;store.set('fof',JSON.stringify({code,pid}));ref=db.ref('rooms/'+code);
  ref.on('value',s=>{
    const old=prevR;R=prevR=s.val();
    // Joueurs présents avant et absents maintenant = joueurs qui ont quitté
    const gone=old&&R?Object.keys(old.players||{}).filter(i=>i!==pid&&!(R.players||{})[i]).map(i=>old.players[i].name):[];
    if(gone.length)lastLeft=gone.join(', ');
    if(!R){leave();err('The room was closed.');return}
    // Le Host a fermé le salon : tout le monde voit la raison écrite dans la salle
    if(R.phase==='closed'){const m=R.closedMsg||'The room was closed.';leave();err(m);return}
    render();gone.forEach(n=>notice(`${n} left the game.`));
  });
  setInterval(updTimer,500);setInterval(beat,120000);cleanup();
}
function leave(){animKey=null;store.del('fof');if(ref)ref.off();ref=R=null;history.replaceState(null,'',location.pathname);home()}

// ----- Affichage selon la phase -----
function render(){
  if(R.phase==='lobby'){seenRound=0;sel=null}
  try{(R.ver!==VERSION?outdated:({lobby,role,debate,vote,verdict,end:final})[R.phase])()}catch(e){show(`<p class="FAKE">Display error: ${esc(e.message)}</p>`)}
  app.insertAdjacentHTML('beforeend',`<div class="foot">${isHost()?`${R.phase==='lobby'?'':'<button id="rs" class="ghost">Restart the game</button>'}<button id="cl" class="ghost">Close the room</button>`:'<button id="lv" class="ghost">Leave the game</button>'}</div>`);
  animate(R.phase+R.round);
  if(isHost()){
    if($('rs'))$('rs').onclick=()=>confirm('Restart? Scores are reset and everyone goes back to the lobby.')&&restart();
    $('cl').onclick=()=>confirm('Close the room for everyone?')&&closeRoom();
  }else $('lv').onclick=()=>{if(!confirm('Leave the game?'))return;const me=ref.child('players/'+pid);leave();me.remove()};
  const ids=act();
  // Moins de 3 joueurs pendant une partie : le salon se ferme tout seul
  if(isHost()&&R.phase!=='lobby'&&R.phase!=='end'&&Object.keys(R.players).length<CONFIG.minPlayers){closeRoom(`${lastLeft||'A player'} left the game. Not enough players to continue.`);return}
  if(isHost()&&R.phase!==lastPhase){lastPhase=R.phase;beat()}
  if(isHost()&&R.phase==='vote'&&ids.every(i=>(R.votes||{})[i]))reveal();
}
function outdated(){
  show(`<p class="FAKE">Your page is not up to date (yours: ${VERSION}, the room: ${esc(R.ver||'old')}).</p><p>Reload the page. If this message stays, close the tab and open the site again from the QR code.</p><button id="rl">Reload</button>`);
  $('rl').onclick=()=>location.reload();
}
// ----- Nettoyage des salles -----
// index/<code> = {t: dernier signal du Host, endAt: fin de partie}. Seul le Host envoie un signal.
function beat(){
  if(!ref||!R||!isHost())return;
  db.ref('index/'+room).set({t:firebase.database.ServerValue.TIMESTAMP,endAt:R.endAt||null});
}
// On écrit d'abord la raison dans la salle (tous les joueurs la voient), puis on supprime la salle 5 s plus tard
function closeRoom(msg){
  const r=ref,ix=db.ref('index/'+room);
  r.update({phase:'closed',closedMsg:msg||'The host closed the room.'});
  setTimeout(()=>{r.remove();ix.remove()},5000);
}
async function cleanup(){
  try{
    const s=await db.ref('index').get();if(!s.exists())return;
    Object.entries(s.val()).forEach(([code,v])=>{
      if(code===room)return;
      const idle=now()-(v.t||0)>CONFIG.idleMinutes*6e4,over=v.endAt&&now()-v.endAt>CONFIG.endedMinutes*6e4;
      if(idle||over){db.ref('rooms/'+code).remove();db.ref('index/'+code).remove()}
    });
  }catch(e){}
}
function restart(){
  const u={phase:'lobby',round:0,used:null,missed:null,roles:null,hands:null,spare:null,plays:null,post:null,votes:null,verdict:null,endsAt:null,endAt:null};
  Object.keys(R.players).forEach(i=>u[`players/${i}/score`]=0);done=0;ref.update(u);
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
const cardOf=id=>CARDS.find(c=>c.id===id);
const cardBox=c=>`<span class="muted">${c.category}</span><br>${esc(c.text)}`;
const playedBy=id=>{const i=Object.keys(R.plays||{}).find(k=>R.plays[k]===id);return i&&R.players[i]?pn(i):'?'}; // retrouve qui a joué la carte
const postBox=mark=>`<ol class="post">${R.post.map(id=>{const c=cardOf(id);return `<li><strong>${playedBy(id)}</strong> · ${cardBox(c)}${mark&&c.type==='redflag'?`<br><strong class="FAKE">Red flag:</strong> ${esc(c.why)}`:''}</li>`}).join('')}</ol>`;
function startRound(){
  const ids=Object.keys(R.players),n=R.round+1,used=R.used||[],left=HEADLINES.map((_,i)=>i).filter(i=>!used.includes(i));
  if(n>CONFIG.rounds||!left.length)return ref.update({phase:'end',endAt:firebase.database.ServerValue.TIMESTAMP});
  const k=left[Math.random()*left.length|0],max=ids.length>=5?CONFIG.maxTrolls:1,t=1+Math.floor(Math.random()*max),roles={},hands={},spare={};
  const pool=ty=>shuffle(CARDS.filter(c=>c.type===ty).map(c=>c.id)),F=pool('redflag'),Rl=pool('reliable'),N=pool('neutral');
  shuffle(ids).forEach((i,j)=>roles[i]=j<t?'Troll':'Citizen');
  ids.forEach(i=>{const tr=roles[i]==='Troll';hands[i]=shuffle([...F.splice(0,tr?3:1),...Rl.splice(0,tr?1:3),...N.splice(0,1)])});
  const rest=shuffle([...F,...Rl,...N]);ids.forEach(i=>spare[i]=rest.pop());
  ref.update({phase:'role',round:n,headline:HEADLINES[k],used:[...used,k],roles,hands,spare,plays:null,post:null,votes:null,verdict:null,endsAt:null});
}
function role(){
  if(R.round!==seenRound){seenRound=R.round;roleShown=false;sel=null}
  if(!R.roles||!R.roles[pid]){show(`<p class="muted">Round ${R.round} of ${CONFIG.rounds}</p><div class="box headline">${esc(R.headline)}</div><p>A round is already in progress. You will play from the next round.</p>`);return}
  const my=R.roles[pid],hand=(R.hands||{})[pid]||[],played=(R.plays||{})[pid],ids=act(),np=ids.filter(i=>(R.plays||{})[i]).length,sp=(R.spare||{})[pid];
  const goal=my==='Troll'?'Make the Citizens get it wrong. Convince them to SHARE a fake post or to REPORT a reliable one. You score 1 point for each Citizen who votes wrong, and nothing for your own vote.':'Build a reliable post. Read each card, play the one you trust, and find the Troll.';
  show(`<p class="muted">Round ${R.round} of ${CONFIG.rounds}</p><h2>Breaking news</h2><div class="box headline">${esc(R.headline)}</div>
  <button id="rv" class="ghost">${roleShown?'Hide my role and cards':'Show my role and cards'}</button>
  ${roleShown?`<div class="box${flipRole?' flip':''}"><div class="headline ${my==='Troll'?'FAKE':'FACT'}">${my}</div><p>${goal}</p></div><h2>Your cards</h2>
  ${hand.map(id=>`<button class="card ${id===(played||sel)?'on':''} ${id===popCard?'pop':''}" data-id="${id}" ${played?'disabled':''}>${cardBox(cardOf(id))}</button>`).join('')}
  ${played?'<p>Card played. Waiting for the others.</p>':`<div><button id="pl" ${sel?'':'disabled'}>Play selected card</button>${sp?`<button id="sw" class="ghost" ${sel?'':'disabled'}>Swap selected card (once)</button>`:''}</div>`}`:'<p>Make sure nobody can see your screen.</p>'}
  <p class="muted">Cards played: ${np}/${ids.length}</p>${isHost()?`<button id="go" ${np<ids.length?'disabled':''}>Reveal the post</button>`:''}`);
  flipRole=false;popCard=null;
  $('rv').onclick=()=>{roleShown=!roleShown;flipRole=roleShown;render()};
  app.querySelectorAll('.card').forEach(b=>b.onclick=()=>{sel=b.dataset.id;popCard=sel;render()});
  if($('pl'))$('pl').onclick=()=>ref.child('plays/'+pid).set(sel);
  if($('sw'))$('sw').onclick=()=>{const u={};u['hands/'+pid]=hand.map(c=>c===sel?sp:c);u['spare/'+pid]=null;sel=null;ref.update(u)};
  if(isHost())$('go').onclick=()=>ref.update({phase:'debate',post:shuffle(Object.values(R.plays)),endsAt:now()+CONFIG.debateSeconds*1000});
}
function debate(){
  show(`<h2>Debate (English only)</h2><div class="timer" id="t">--</div><div class="box headline">${esc(R.headline)}</div>${postBox(false)}
  <p>Is the post reliable? Who is the Troll? Every French word costs 1 point.</p>${isHost()?'<button id="go" class="ghost">Go to vote now</button>':''}`);
  if(isHost())$('go').onclick=toVote;updTimer();
}
const toVote=()=>{if(R&&R.phase==='debate')ref.update({phase:'vote'})};
function updTimer(){
  const t=$('t');if(!t||!R||R.phase!=='debate')return;
  const l=Math.max(0,Math.ceil((R.endsAt-now())/1000));t.textContent=l;t.classList.toggle('urgent',l>0&&l<=10);if(l<=0&&isHost())toVote();
}
function vote(){
  const ids=act(),v=R.votes||{},mine=v[pid];
  show(`<h2>Vote</h2><div class="box headline">${esc(R.headline)}</div>${postBox(false)}${R.roles[pid]?`<p>Is this post reliable enough to share?</p>
  <button id="s" class="${mine==='SHARE'?'':'ghost'}">SHARE</button><button id="r" class="${mine==='REPORT'?'':'ghost'}">REPORT</button>`:'<p>You will play from the next round.</p>'}
  <h2>Votes in</h2><p>${ids.map(i=>`${pn(i)} ${v[i]?'✓':'…'}`).join(', ')}</p>
  ${isHost()?'<button id="go" class="ghost">Reveal verdict now</button>':'<p class="muted">The verdict appears when everyone has voted.</p>'}`);
  if($('s')){$('s').onclick=()=>ref.child('votes/'+pid).set('SHARE');$('r').onclick=()=>ref.child('votes/'+pid).set('REPORT')}
  if(isHost())$('go').onclick=reveal;
}
function reveal(){
  if(done===R.round)return;done=R.round;
  const flags=R.post.filter(id=>cardOf(id).type==='redflag'),fake=flags.length>0,votes=R.votes||{},ids=act();
  const shared=ids.filter(i=>votes[i]==='SHARE').length>ids.length/2,good=fake?'REPORT':'SHARE',upd={};
  const fooled=ids.filter(i=>R.roles[i]!=='Troll'&&votes[i]!==good).length; // Citizens qui se sont trompés
  ids.forEach(i=>{let s=R.players[i].score;
    if(R.roles[i]==='Troll')s+=fooled*CONFIG.pointsTrollWin; // le Troll gagne quand les Citizens se trompent
    else if(votes[i]===good)s+=CONFIG.pointsCorrectVote;
    upd[`players/${i}/score`]=s});
  upd.phase='verdict';upd.verdict={fake,shared};
  if(fake&&shared)upd.missed=[...(R.missed||[]),...flags];
  ref.update(upd);
}
function verdict(){
  const V=R.verdict,ids=Object.keys(R.players),tr=ids.filter(i=>R.roles[i]==='Troll');
  show(`<div class="verdict ${V.fake?'FAKE':'FACT'}">${V.fake?'FAKE':'FACT'}</div><p>${V.shared?'The table shared the post.':'The table reported the post.'}</p>
  <h2>The post</h2>${postBox(true)}
  <h2>Trolls</h2><p>${tr.length?tr.map(i=>pn(i)).join(', '):'There was no Troll this round.'}</p><h2>Scores</h2>${scores()}
  ${isHost()?`<p class="muted">Lost in translation: tap a name for each French word.</p>${ids.map(i=>`<button class="ghost" data-i="${i}">${pn(i)} −${CONFIG.frenchPenalty}</button>`).join('')}<div><button id="nx">${R.round>=CONFIG.rounds?'See final scores':'Next round'}</button></div>`:'<p class="muted">Waiting for the host.</p>'}`);
  if(isHost()){
    app.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>ref.child(`players/${b.dataset.i}/score`).transaction(s=>(s||0)-CONFIG.frenchPenalty));
    $('nx').onclick=startRound;
  }
}
function final(){
  const miss=[...new Set(R.missed||[])].map(cardOf).filter(Boolean);
  show(`<h1>Final scores</h1>${scores()}
  ${miss.length?`<h2>Red flags the table missed</h2><ul>${miss.map(c=>`<li><strong>${esc(c.text)}</strong><br>${esc(c.why)}</li>`).join('')}</ul>`:'<p>No red flag slipped through. Well done.</p>'}
`);
}

// ----- Démarrage : reprend la partie en cours après un rechargement -----
(async()=>{
  cleanup();
  const sv=JSON.parse(store.get('fof')||'null'),q=(new URLSearchParams(location.search).get('room')||'').toUpperCase();
  if(sv&&(!q||q===sv.code)){
    try{const s=await db.ref(`rooms/${sv.code}/players/${sv.pid}`).get();if(s.exists()){pid=sv.pid;return enter(sv.code)}}catch(e){}
  }
  home();
})();