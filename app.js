// ===== RÉGLAGES =====
const VERSION='9'; // à augmenter à CHAQUE mise à jour du jeu : les téléphones avec l'ancien code verront « not up to date »
const CONFIG={rounds:6,debateSeconds:90,pointsCorrectVote:2,pointsTrollFound:1,pointsTrollWin:1,frenchPenalty:1,maxTrolls:2,minPlayers:3,maxPlayers:6,idleMinutes:20,endedMinutes:30};
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
let secretShown=false,secretKey=null,secretFlip=false,animKey=null,flipRole=false,popCard=null,seenPlayers=null,wasReady=null;
const animate=key=>{if(key===animKey)return false;animKey=key;[...app.children].forEach((el,i)=>{el.style.animationDelay=Math.min(i*60,480)+'ms';el.classList.add('in')});return true};
const calm=()=>matchMedia('(prefers-reduced-motion: reduce)').matches; // le téléphone demande moins d'animations
const buzz=ms=>{try{if(!calm()&&navigator.vibrate)navigator.vibrate(ms)}catch(e){}}; // vibration (Android seulement)
// Confettis aux couleurs de la charte (petit canvas temporaire)
function confetti(n=140){
  if(calm())return;const c=document.createElement('canvas'),x=c.getContext('2d'),W=c.width=innerWidth,H=c.height=innerHeight;
  c.className='confetti';document.body.appendChild(c);
  const col=['#ffe925','#314995','#020203','#ffffff'],P=Array.from({length:n},()=>({x:W/2+(Math.random()-.5)*W*.4,y:H*.35,vx:(Math.random()-.5)*14,vy:-Math.random()*14-4,s:6+Math.random()*7,r:Math.random()*6,vr:(Math.random()-.5)*.3,c:col[Math.random()*4|0]}));
  const t0=performance.now();(function f(t){x.clearRect(0,0,W,H);P.forEach(p=>{p.vy+=.35;p.vx*=.99;p.x+=p.vx;p.y+=p.vy;p.r+=p.vr;x.save();x.translate(p.x,p.y);x.rotate(p.r);x.fillStyle=p.c;x.fillRect(-p.s/2,-p.s/4,p.s,p.s/2);x.restore()});
    if(t-t0<3000)requestAnimationFrame(f);else c.remove()})(t0);
}
// Fond sombre qui s'efface (révélation du rôle)
const flash=()=>{if(calm())return;const d=document.createElement('div');d.className='flash';document.body.appendChild(d);setTimeout(()=>d.remove(),900)};
// Effets joués une seule fois, quand on arrive sur un écran
function screenFx(){
  if(R.phase==='verdict'&&R.verdict){
    const d=(R.verdict.pts||{})[pid],won=d&&Object.values(d).reduce((a,b)=>a+b,0)>0;
    if(R.verdict.fake&&R.verdict.shared){app.classList.remove('shake');void app.offsetWidth;app.classList.add('shake');buzz([80,60,80])}
    if(won)setTimeout(()=>confetti(),500);
  }
  if(R.phase==='end')setTimeout(()=>confetti(220),1200);
}
let prevR=null,lastLeft='',room,pid,ref,R,offset=0,roleShown=false,seenRound=0,sel=null,done=0,lastPhase=null;
db.ref('.info/serverTimeOffset').on('value',s=>{offset=s.val()||0});
const now=()=>Date.now()+offset,isHost=()=>R&&R.host===pid,pn=i=>esc(R.players[i].name);
const act=()=>Object.keys(R.players).filter(i=>R.roles&&R.roles[i]);
const scores=()=>`<ul>${Object.keys(R.players).sort((a,b)=>R.players[b].score-R.players[a].score).map(i=>`<li>${pn(i)}: ${R.players[i].score}</li>`).join('')}</ul>`;

// ----- Fenêtre « How to play » : règles très simples, en anglais -----
function howTo(){
  if($('howto'))return;
  const d=document.createElement('div');d.id='howto';d.className='modal';
  d.innerHTML=`<div class="sheet" role="dialog" aria-modal="true" aria-label="How to play">
  <button class="close ghost" aria-label="Close">✕</button>
  <h1>How to play</h1>
  <p class="big">Build a post together.<br>Is it <span class="FACT">TRUE</span> or a <span class="FAKE">TRAP</span>?</p>
  <h2>Who are you? 🤫</h2>
  <ul class="steps"><li>😇 <strong>Citizen:</strong> find the truth and find the Troll.</li>
  <li>😈 <strong>Troll:</strong> make the others vote wrong.</li></ul>
  <h2>The golden rule 🚩</h2>
  <p><strong>1 red flag</strong> in the post = <span class="FAKE">FAKE</span>.<br>No red flag = <span class="FACT">FACT</span>.</p>
  <h2>Each round</h2>
  <ol class="steps"><li>📰 Read the news.</li><li>🃏 Look at your 5 cards. Play 1.</li><li>🗣️ Talk for 90 seconds. <strong>English only!</strong></li>
  <li>🗳️ Vote <strong>SHARE</strong> or <strong>REPORT</strong>, and pick the Troll.</li><li>⚖️ See the answer and your points.</li></ol>
  <h2>Points ⭐</h2>
  <ul class="steps"><li>✅ Good vote: <strong>+2</strong></li><li>🔍 You found the Troll: <strong>+1</strong></li>
  <li>😈 Troll: <strong>+1</strong> for each player who votes wrong</li><li>🇫🇷 A French word: <strong>−1</strong></li></ul>
  <p class="big">After 6 rounds, the most points wins! 🏆</p>
  <button class="close">Got it!</button></div>`;
  const close=()=>{d.classList.add('out');setTimeout(()=>d.remove(),250);document.removeEventListener('keydown',esc_)};
  const esc_=e=>{if(e.key==='Escape')close()};
  d.addEventListener('click',e=>{if(e.target===d||e.target.classList.contains('close'))close()});
  document.addEventListener('keydown',esc_);document.body.appendChild(d);d.querySelector('.close').focus();
}

// ----- Accueil, création, connexion -----
function home(){
  const q=(new URLSearchParams(location.search).get('room')||'').toUpperCase().slice(0,4);
  show(`<h1 class="logo"><img src="ADDS/logo.png" alt="Fake or Fact"></h1><p class="sub">No account, no personal data. Just a nickname.</p>
  <label for="nm">Nickname</label><input id="nm" maxlength="14" autocomplete="off">
  <label for="cd">Room code</label><input id="cd" maxlength="4" value="${esc(q)}" autocapitalize="characters" autocomplete="off">
  <p id="err" class="FAKE"></p><button id="jn">Join</button>${q?'':'<button id="mk" class="ghost">Create a game</button>'}<div><button id="how" class="how">❓ How to play</button></div>`);
  $('jn').onclick=()=>join($('cd').value.trim().toUpperCase(),$('nm').value.trim());
  if($('mk'))$('mk').onclick=create;
  $('how').onclick=howTo;
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
function leave(){animKey=null;seenPlayers=wasReady=null;store.del('fof');if(ref)ref.off();ref=R=null;history.replaceState(null,'',location.pathname);home()}

// ----- Affichage selon la phase -----
function render(){
  if(R.phase==='lobby'){seenRound=0;sel=null}
  try{(R.ver!==VERSION?outdated:({lobby,role,debate,vote,verdict,end:final})[R.phase])()}catch(e){show(`<p class="FAKE">Display error: ${esc(e.message)}</p>`)}
  app.insertAdjacentHTML('beforeend',`<div class="foot">${isHost()?`${R.phase==='lobby'?'':'<button id="rs" class="ghost">Restart the game</button>'}<button id="cl" class="ghost">Close the room</button>`:'<button id="lv" class="ghost">Leave the game</button>'}</div>`);
  if(animate(R.phase+R.round))screenFx();
  if(R.phase!=='debate')document.body.classList.remove('edge');
  if(isHost()){
    if($('rs'))$('rs').onclick=()=>confirm('Restart? Scores are reset and everyone goes back to the lobby.')&&restart();
    $('cl').onclick=()=>confirm('Close the room for everyone?')&&closeRoom();
  }else $('lv').onclick=()=>{if(!confirm('Leave the game?'))return;const me=ref.child('players/'+pid);leave();me.remove()};
  const ids=act();
  // Moins de 3 joueurs pendant une partie : le salon se ferme tout seul
  if(isHost()&&R.phase!=='lobby'&&R.phase!=='end'&&Object.keys(R.players).length<CONFIG.minPlayers){closeRoom(`${lastLeft||'A player'} left the game. Not enough players to continue.`);return}
  if(isHost()&&R.phase!==lastPhase){lastPhase=R.phase;beat()}
  if(isHost()&&R.phase==='vote'&&ids.every(voted))reveal();
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
  const u={phase:'lobby',round:0,used:null,missed:null,roles:null,hands:null,spare:null,plays:null,post:null,votes:null,suspects:null,french:null,verdict:null,endsAt:null,endAt:null};
  Object.keys(R.players).forEach(i=>u[`players/${i}/score`]=0);done=0;ref.update(u);
}
function lobby(){
  const url=location.origin+location.pathname+'?room='+room,ids=Object.keys(R.players),qr=qrcode(0,'M');
  qr.addData(url);qr.make();
  // ready = assez de joueurs ; boom = on vient juste d'atteindre le minimum (effet une seule fois)
  const need=Math.max(0,CONFIG.minPlayers-ids.length),ready=!need,boom=ready&&wasReady===false;
  show(`<h1>Room ${room}</h1><p class="sub">Scan to join, or enter the code on the home page.</p>
  <div class="qr">${qr.createSvgTag(5,0)}</div><p class="muted">${esc(url)}</p>
  <h2>Players (${ids.length}/${CONFIG.maxPlayers})</h2><ul class="players">${ids.map(i=>`<li class="${seenPlayers&&!seenPlayers.includes(i)?'join':''}">${pn(i)}${i===R.host?' (host)':''}</li>`).join('')}</ul>
  ${isHost()?`<button id="st" class="${ready?'':'locked'} ${boom?'boom':''}" ${ready?'':'disabled'}>Start game</button><p class="muted">${ready?'Everyone is here? Let\'s go!':`At least ${CONFIG.minPlayers} players needed (${need} more).`}</p>`:'<p class="muted">Waiting for the host to start.</p>'}<div><button id="how" class="how">❓ How to play</button></div>`);
  seenPlayers=ids;wasReady=ready;$('how').onclick=howTo;
  if(isHost())$('st').onclick=startRound;
}
const voted=i=>(R.votes||{})[i]&&(R.suspects||{})[i]; // vote complet = SHARE/REPORT + suspect
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
  ref.update({phase:'role',round:n,headline:HEADLINES[k],used:[...used,k],roles,hands,spare,plays:null,post:null,votes:null,suspects:null,french:null,verdict:null,endsAt:null});
}
// Seul le Troll voit sur SON téléphone quelles cartes de sa main sont des red flags
const trollTag=c=>c.type==='redflag'?'<br><span class="tag flag">🚩 Red flag</span>':'<br><span class="tag safe">Not a red flag</span>';
// Troll : état du post EN DIRECT pendant le choix des cartes (d'après les cartes déjà jouées)
function trollLive(){
  const pl=Object.values(R.plays||{}),n=act().length,fake=pl.some(id=>cardOf(id).type==='redflag');
  if(!pl.length)return `<div class="box"><p><strong>Troll secret:</strong> no card has been played yet. Wait: here you will see if the post is FAKE or FACT, card after card.</p></div>`;
  return `<div class="box"><p><strong>Troll secret:</strong> with the ${pl.length}/${n} cards played so far, the post is <span class="${fake?'FAKE':'FACT'}">${fake?'FAKE':'FACT'}</span>.</p><p class="muted">${fake?'There is already a red flag in it: you can play a good card to hide.':'No red flag yet: play one of your 🚩 cards to make it FAKE, or keep it a FACT and make the Citizens REPORT it.'}</p></div>`;
}
function role(){
  if(R.round!==seenRound){seenRound=R.round;roleShown=false;sel=null}
  if(!R.roles||!R.roles[pid]){show(`<p class="muted">Round ${R.round} of ${CONFIG.rounds}</p><div class="box headline">${esc(R.headline)}</div><p>A round is already in progress. You will play from the next round.</p>`);return}
  const my=R.roles[pid],hand=(R.hands||{})[pid]||[],played=(R.plays||{})[pid],ids=act(),np=ids.filter(i=>(R.plays||{})[i]).length,sp=(R.spare||{})[pid];
  const goal=my==='Troll'?'Make the Citizens get it wrong. Convince them to SHARE a fake post or to REPORT a reliable one. You score 1 point for each Citizen who votes wrong, and nothing for your own vote. Your red flags are marked 🚩 below, and you can see live if the post is FAKE or FACT.':'Build a reliable post. Read each card, play the one you trust, and find the Troll.';
  show(`<p class="muted">Round ${R.round} of ${CONFIG.rounds}</p><h2>Breaking news</h2><div class="box headline">${esc(R.headline)}</div>
  <button id="rv" class="ghost">${roleShown?'Hide my role and cards':'Show my role and cards'}</button>
  ${roleShown?`<div class="box rolebox ${my==='Troll'?'troll':'citizen'}${flipRole?' flip reveal':''}"><p class="youare">You are…</p><div class="headline rolename ${my==='Troll'?'FAKE':'FACT'}" data-text="${my}">${my} ${my==='Troll'?'😈':'😇'}</div><p>${goal}</p></div>${my==='Troll'?trollLive():''}<h2>Your cards</h2>
  ${hand.map(id=>`<button class="card ${id===(played||sel)?'on':''} ${id===popCard?'pop':''}" data-id="${id}" ${played?'disabled':''}>${cardBox(cardOf(id))}${my==='Troll'?trollTag(cardOf(id)):''}</button>`).join('')}
  ${played?'<p>Card played. Waiting for the others.</p>':`<div><button id="pl" ${sel?'':'disabled'}>Play selected card</button>${sp?`<button id="sw" class="ghost" ${sel?'':'disabled'}>Swap selected card (once)</button>`:''}</div>`}`:'<p>Make sure nobody can see your screen.</p>'}
  <p class="muted">Cards played: ${np}/${ids.length}</p>${isHost()?`<button id="go" ${np<ids.length?'disabled':''}>Reveal the post</button>`:''}`);
  flipRole=false;popCard=null;
  $('rv').onclick=()=>{roleShown=!roleShown;flipRole=roleShown;if(roleShown){flash();buzz(40)}render()};
  app.querySelectorAll('.card').forEach(b=>b.onclick=()=>{sel=b.dataset.id;popCard=sel;render()});
  if($('pl'))$('pl').onclick=()=>ref.child('plays/'+pid).set(sel);
  if($('sw'))$('sw').onclick=()=>{const u={};u['hands/'+pid]=hand.map(c=>c===sel?sp:c);u['spare/'+pid]=null;sel=null;ref.update(u)};
  if(isHost())$('go').onclick=()=>ref.update({phase:'debate',post:shuffle(Object.values(R.plays)),endsAt:now()+CONFIG.debateSeconds*1000});
}
function debate(){
  show(`<h2>Debate (English only)</h2><div class="tring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="bg" cx="60" cy="60" r="54"/><circle class="fg" id="tr" cx="60" cy="60" r="54"/></svg><div class="timer" id="t">--</div></div><div class="box headline">${esc(R.headline)}</div>${postBox(false).replace('class="post"','class="post flipcards"')}
  <p>Is the post reliable? Who is the Troll? Every French word costs 1 point.</p>${secretHtml()}${isHost()?'<div><button id="go" class="ghost">Go to vote now</button></div>':''}`);
  bindSecret();if(isHost())$('go').onclick=toVote;updTimer();
}
// ----- Info secrète (débat + vote) -----
// Le Troll peut voir si le post est FAKE ou FACT, pour pousser la table vers la mauvaise réponse.
// Tout le monde a le même bouton (un Citizen voit « pas d'info secrète ») : appuyer dessus ne trahit donc pas le Troll.
function secretHtml(){
  const k=R.phase+R.round;if(k!==secretKey){secretKey=k;secretShown=false}
  if(!R.roles||!R.roles[pid])return '';
  const troll=R.roles[pid]==='Troll',fake=R.post.some(id=>cardOf(id).type==='redflag');
  const info=troll?`<p><strong>Troll secret:</strong> this post is <span class="${fake?'FAKE':'FACT'}">${fake?'FAKE':'FACT'}</span>.</p><p>${fake?'There is a red flag in it. Convince the Citizens to SHARE it.':'There is no red flag in it. Convince the Citizens to REPORT it.'}</p>`
    :'<p>You are a Citizen: no secret info for you. Read the cards and trust your eyes!</p>';
  const h=`<button id="sc" class="secret">${secretShown?'Hide my secret info':'🤫 Show my secret info'}</button>${secretShown?`<div class="box${secretFlip?' flip':''}">${info}</div>`:''}`;
  secretFlip=false;return h;
}
const bindSecret=()=>{if($('sc'))$('sc').onclick=()=>{secretShown=!secretShown;secretFlip=secretShown;render()}};
const toVote=()=>{if(R&&R.phase==='debate')ref.update({phase:'vote'})};
function updTimer(){
  const t=$('t');if(!t||!R||R.phase!=='debate')return;
  const left=Math.max(0,R.endsAt-now()),l=Math.ceil(left/1000);t.textContent=l;t.classList.toggle('urgent',l>0&&l<=10);
  // Anneau qui se vide + bords de l'écran qui pulsent et vibration les 5 dernières secondes
  const ring=$('tr');if(ring)ring.style.strokeDashoffset=(339.3*(1-Math.min(1,left/(CONFIG.debateSeconds*1000)))).toFixed(1);
  if(ring)ring.classList.toggle('urgent',l>0&&l<=10);
  document.body.classList.toggle('edge',l>0&&l<=5);
  if(l>0&&l<=5&&l!==lastBuzz){lastBuzz=l;buzz(60)}
  if(l<=0&&isHost())toVote();
}
let lastBuzz=null;
function vote(){
  const ids=act(),v=R.votes||{},mine=v[pid],sus=(R.suspects||{})[pid];
  show(`<h2>Vote</h2><div class="box headline">${esc(R.headline)}</div>${postBox(false)}${secretHtml()}${R.roles[pid]?`<p>1. Is this post reliable enough to share?</p>
  <button id="s" class="${mine==='SHARE'?'':'ghost'}">SHARE</button><button id="r" class="${mine==='REPORT'?'':'ghost'}">REPORT</button>
  <p>2. Who is the Troll?</p><div>${ids.filter(i=>i!==pid).map(i=>`<button class="${sus===i?'':'ghost'}" data-sus="${i}">${pn(i)}</button>`).join('')}</div>
  ${mine&&sus?'<p class="muted">Vote saved. You can still change it.</p>':'<p class="muted">Choose both to validate your vote.</p>'}`:'<p>You will play from the next round.</p>'}
  <h2>Votes in</h2><p>${ids.map(i=>`${pn(i)} ${voted(i)?'✓':'…'}`).join(', ')}</p>
  ${isHost()?'<button id="go" class="ghost">Reveal verdict now</button>':'<p class="muted">The verdict appears when everyone has voted.</p>'}`);
  if($('s')){$('s').onclick=()=>ref.child('votes/'+pid).set('SHARE');$('r').onclick=()=>ref.child('votes/'+pid).set('REPORT')}
  bindSecret();app.querySelectorAll('[data-sus]').forEach(b=>b.onclick=()=>ref.child('suspects/'+pid).set(b.dataset.sus));
  if(isHost())$('go').onclick=reveal;
}
function reveal(){
  if(done===R.round)return;done=R.round;
  const flags=R.post.filter(id=>cardOf(id).type==='redflag'),fake=flags.length>0,votes=R.votes||{},ids=act();
  const shared=ids.filter(i=>votes[i]==='SHARE').length>ids.length/2,good=fake?'REPORT':'SHARE',upd={};
  const sus=R.suspects||{},isTroll=i=>R.roles[i]==='Troll';
  const fooled=ids.filter(i=>!isTroll(i)&&votes[i]!==good).length; // Citizens qui se sont trompés (ou n'ont pas voté)
  const pts={}; // détail des points de la manche, affiché au verdict
  ids.forEach(i=>{
    const d=isTroll(i)?{fooled:fooled*CONFIG.pointsTrollWin} // Fooled you! : le Troll gagne quand les Citizens se trompent
      :{right:votes[i]===good?CONFIG.pointsCorrectVote:0, // Right vote
        found:sus[i]&&isTroll(sus[i])?CONFIG.pointsTrollFound:0}; // Troll found
    pts[i]=d;upd[`players/${i}/score`]=R.players[i].score+Object.values(d).reduce((a,b)=>a+b,0)});
  upd.phase='verdict';upd.verdict={fake,shared,pts};
  if(fake&&shared)upd.missed=[...(R.missed||[]),...flags];
  ref.update(upd);
}
function verdict(){
  const V=R.verdict,ids=Object.keys(R.players),tr=ids.filter(i=>R.roles[i]==='Troll');
  show(`<div class="verdict ${V.fake?'FAKE':'FACT'}">${V.fake?'FAKE':'FACT'}</div><p>${V.shared?'The table shared the post.':'The table reported the post.'}</p>
  <h2>The post</h2>${postBox(true)}
  <h2>Trolls</h2><p>${tr.length?tr.map(i=>pn(i)).join(', '):'There was no Troll this round.'}</p>
  <h2>Points this round</h2>${roundPts()}<h2>Scores</h2>${scores()}
  ${isHost()?`<p class="muted">Lost in translation: tap a name for each French word.</p>${ids.map(i=>`<button class="ghost" data-i="${i}">${pn(i)} −${CONFIG.frenchPenalty}</button>`).join('')}<div><button id="nx">${R.round>=CONFIG.rounds?'See final scores':'Next round'}</button></div>`:'<p class="muted">Waiting for the host.</p>'}`);
  if(isHost()){
    app.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{const i=b.dataset.i;ref.child(`players/${i}/score`).transaction(s=>(s||0)-CONFIG.frenchPenalty);ref.child(`french/${i}`).transaction(n=>(n||0)+1)});
    $('nx').onclick=startRound;
  }
}
// Détail des points de la manche : Right vote, Troll found, Fooled you!, Lost in translation
function roundPts(){
  const P=(R.verdict&&R.verdict.pts)||{},F=R.french||{};
  return `<ul class="pts">${Object.keys(P).filter(i=>R.players[i]).map(i=>{
    const d=P[i],fr=(F[i]||0)*CONFIG.frenchPenalty,parts=[];
    if(d.right)parts.push(`Right vote +${d.right}`);
    if(d.found)parts.push(`Troll found +${d.found}`);
    if(d.fooled)parts.push(`Fooled you! +${d.fooled}`);
    if(fr)parts.push(`Lost in translation −${fr}`);
    const tot=(d.right||0)+(d.found||0)+(d.fooled||0)-fr;
    return `<li><strong>${pn(i)}</strong> ${tot>=0?'+':'−'}${Math.abs(tot)}${parts.length?` <span class="muted">(${parts.join(', ')})</span>`:''}</li>`}).join('')}</ul>`;
}
// Podium : 2e, 1er, 3e (les barres montent l'une après l'autre)
function podium(){
  const ids=Object.keys(R.players).sort((a,b)=>R.players[b].score-R.players[a].score),top=ids.slice(0,3);
  const med=['🥇','🥈','🥉'],order=[1,0,2].filter(i=>top[i]);
  return `<div class="podium">${order.map(i=>`<div class="step p${i+1}"><div class="who">${med[i]}<br><strong>${pn(top[i])}</strong><br>${R.players[top[i]].score} pts</div><div class="bar">${i+1}</div></div>`).join('')}</div>
  ${ids.length>3?`<ul>${ids.slice(3).map((i,k)=>`<li>${k+4}. ${pn(i)}: ${R.players[i].score}</li>`).join('')}</ul>`:''}`;
}
function final(){
  const miss=[...new Set(R.missed||[])].map(cardOf).filter(Boolean);
  show(`<h1>Final scores</h1>${podium()}
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