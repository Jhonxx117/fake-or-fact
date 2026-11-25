// ===== RÉGLAGES =====
const VERSION='22'; // à augmenter à CHAQUE mise à jour du jeu : les téléphones avec l'ancien code verront « not up to date »
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
let litOpen=false,autoDebate=null,turned=new Set(),flipNow=null,swapIn=null,secretShown=false,secretKey=null,secretFlip=false,animKey=null,flipRole=false,popCard=null,seenPlayers=null,wasReady=null;
const animate=key=>{if(key===animKey)return false;animKey=key;[...app.children].filter(el=>!el.classList.contains('bar')).forEach((el,i)=>{el.style.animationDelay=Math.min(i*60,480)+'ms';el.classList.add('in')});return true};
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
// Écran rouge : mauvaise réponse (bords rouges qui pulsent + l'écran tremble + « Wrong! »)
function redFx(){
  if(calm())return;const d=document.createElement('div');d.className='redfx';document.body.appendChild(d);setTimeout(()=>d.remove(),1400);
  app.classList.remove('shake');void app.offsetWidth;app.classList.add('shake');buzz([100,60,100]);
}
// Petite étiquette qui monte au milieu de l'écran puis disparaît (ex. « Wrong! », « 🔍 Troll found +1 »)
function popMsg(txt,cls,delay=0){
  setTimeout(()=>{const d=document.createElement('div');d.className='popmsg '+cls;d.textContent=txt;document.body.appendChild(d);setTimeout(()=>d.remove(),1900)},delay);
}
// Effets joués une seule fois, quand on arrive sur un écran
function screenFx(){
  if(R.phase==='verdict'&&R.verdict){
    const d=(R.verdict.pts||{})[pid];if(!d)return; // spectateur : rien
    if('fooled' in d){ // Troll : content s'il a trompé quelqu'un
      if(d.fooled>0){setTimeout(()=>confetti(),500);popMsg(`Fooled you! +${d.fooled}`,'good',500)}
      else{setTimeout(redFx,500);popMsg('Nobody was fooled…','bad',500)}
    }else if(d.right>0){ // Citizen qui a voté juste : confettis
      setTimeout(()=>confetti(d.found?200:140),500);popMsg(d.found?'✅ Right vote + 🔍 Troll found!':'✅ Right vote!','good',500);
    }else{ // Citizen qui s'est trompé : rouge… mais petit bonus s'il a trouvé le Troll
      setTimeout(redFx,500);popMsg('❌ Wrong vote!','bad',500);
      if(d.found){popMsg('🔍 But you found the Troll! +1','good small',1600);setTimeout(()=>confetti(35),1600)}
    }
  }
  if(R.phase==='end')setTimeout(()=>confetti(220),1200);
}
let prevR=null,lastLeft='',room,pid,ref,R,offset=0,roleShown=false,seenRound=0,sel=null,done=0,lastPhase=null;
db.ref('.info/serverTimeOffset').on('value',s=>{offset=s.val()||0});
const now=()=>Date.now()+offset,isHost=()=>R&&R.host===pid,pn=i=>esc(R.players[i].name);
const act=()=>Object.keys(R.players).filter(i=>R.roles&&R.roles[i]);
// Pastille ronde avec l'initiale du joueur (couleur fixe selon son ordre d'arrivée)
const avatar=i=>{const k=Object.keys(R.players).indexOf(i),n=R.players[i]?R.players[i].name:'?';return `<span class="av c${(k<0?0:k)%3}" aria-hidden="true">${esc(n.charAt(0).toUpperCase())}</span>`};
// Classement avec barres (le 1er en jaune)
const scores=()=>{const ids=Object.keys(R.players).sort((a,b)=>R.players[b].score-R.players[a].score),max=Math.max(1,...ids.map(i=>R.players[i].score));
  return `<ol class="board">${ids.map((i,k)=>`<li><span class="rk">${k+1}</span>${avatar(i)}<span class="n">${pn(i)}</span><span class="barw"><span style="width:${Math.max(4,Math.max(0,R.players[i].score)/max*100)}%"></span></span><b>${R.players[i].score}</b></li>`).join('')}</ol>`};
// Barre du haut (dans le salon et pendant la partie) : logo, manche + points de progression, mon score
const topBar=()=>{const me=R.players&&R.players[pid],playing=R.round&&R.phase!=='lobby'&&R.phase!=='end';
  const dots=Array.from({length:CONFIG.rounds},(_,k)=>`<i class="${k<R.round-1?'done':k===R.round-1?'now':''}"></i>`).join('');
  return `<header class="bar"><img src="ADDS/logo.png" alt="Fake or Fact"><div class="mid">${playing?`<span class="rnd">Round ${R.round} / ${CONFIG.rounds}</span><span class="dots">${dots}</span>`:`<span class="rnd">${R.phase==='end'?'Game over':'Room '+room}</span>`}</div>${me?`<span class="me">${avatar(pid)}<b>${me.score}</b><small>pts</small></span>`:''}</header>`};

// ----- Fenêtre « How to play » : règles très simples, en anglais -----
function howTo(){
  if($('howto'))return;
  const d=document.createElement('div');d.id='howto';d.className='modal';
  d.innerHTML=`<div class="sheet" role="dialog" aria-modal="true" aria-label="How to play">
  <button class="close ghost" aria-label="Close">✕</button>
  <h1>How to play</h1>
  <p class="big">Each round, a news story about the internet.<br>Is it <span class="FACT">TRUE</span> or <span class="FAKE">FAKE</span>?</p>
  <h2>Who are you?</h2>
  <ul class="steps"><li><span class="mini-role citizen">Citizen</span> find the truth and find the Troll.</li>
  <li><span class="mini-role troll">Troll</span> make the others vote wrong.</li></ul>
  <h2>Your clues</h2>
  <p>Each card is a clue. ✅ Most clues tell the truth.<br>🚩 Some clues are <strong>traps</strong>: they lie to fool you!</p>
  <h2>Each round</h2>
  <ol class="steps"><li>📰 Read the news.</li><li>🃏 Look at your 3 clues. Play 1.</li><li>🗣️ Talk for 90 seconds. <strong>English only!</strong></li>
  <li>🗳️ True? Vote <strong>SHARE</strong>. Fake? Vote <strong>REPORT</strong>. And pick the Troll.</li><li>⚖️ See the answer and your points.</li></ol>
  <h2>Points</h2>
  <ul class="steps"><li>✅ Good vote: <strong>+2</strong></li><li>🔍 You found the Troll: <strong>+1</strong></li>
  <li><span class="mini-role troll">Troll</span> <strong>+1</strong> for each player who votes wrong</li><li>🇫🇷 A French word: <strong>−1</strong></li></ul>
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
  show(`<div class="hero"><h1 class="logo"><img src="ADDS/logo.png" alt="Fake or Fact"></h1><p class="tagline">Build the post. <mark>Find the troll.</mark> Don't share the fake.</p></div>
  <div class="panel"><label for="nm">Nickname</label><input id="nm" maxlength="14" autocomplete="off" placeholder="Your nickname">
  <label for="cd">Room code</label><input id="cd" maxlength="4" value="${esc(q)}" autocapitalize="characters" autocomplete="off" placeholder="ABCD" class="codein">
  <p id="err" class="FAKE"></p><button id="jn" class="wide">Join the game</button>${q?'':'<div class="or"><span>or</span></div><button id="mk" class="ghost wide">Create a game</button>'}</div>
  <button id="how" class="how wide">How to play</button><p class="sub small">No account, no personal data. Just a nickname.</p>`);
  // Effet pinceau « out » sur le logo avant de quitter l'accueil
  const out=fn=>{const h=app.querySelector('.hero');if(!h||calm())return fn();h.classList.add('out');setTimeout(fn,450)};
  $('jn').onclick=()=>{const c=$('cd').value.trim().toUpperCase(),n=$('nm').value.trim();if(!n||c.length!==4)return join(c,n);out(()=>join(c,n))};
  if($('mk'))$('mk').onclick=()=>{if(!$('nm').value.trim())return create();out(create)};
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
  if(R.phase==='lobby'){seenRound=0;sel=null;autoDebate=null}
  try{(R.ver!==VERSION?outdated:({lobby,role,debate,vote,verdict,end:final})[R.phase])()}catch(e){show(`<p class="FAKE">Display error: ${esc(e.message)}</p>`)}
  if(R.ver===VERSION)app.insertAdjacentHTML('afterbegin',topBar());
  app.insertAdjacentHTML('beforeend',`<div class="foot">${isHost()?`${R.phase==='lobby'?'':'<button id="rs" class="link">Restart the game</button>'}<button id="cl" class="link">Close the room</button>`:'<button id="lv" class="link">Leave the game</button>'}</div>`);
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
  // Tout le monde a joué sa carte : le Host passe tout seul au débat (petite pause pour voir « Card played »)
  if(isHost()&&R.phase==='role'&&ids.length&&ids.every(i=>(R.plays||{})[i])&&autoDebate!==R.round){autoDebate=R.round;setTimeout(toDebate,900)}
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
  const u={phase:'lobby',round:0,theme:null,used:null,missed:null,roles:null,hands:null,spare:null,plays:null,post:null,votes:null,suspects:null,french:null,verdict:null,endsAt:null,endAt:null};
  Object.keys(R.players).forEach(i=>u[`players/${i}/score`]=0);done=0;ref.update(u);
}
function lobby(){
  const url=location.origin+location.pathname+'?room='+room,ids=Object.keys(R.players),qr=qrcode(0,'M');
  qr.addData(url);qr.make();
  // ready = assez de joueurs ; boom = on vient juste d'atteindre le minimum (effet une seule fois)
  const need=Math.max(0,CONFIG.minPlayers-ids.length),ready=!need,boom=ready&&wasReady===false;
  show(`<p class="kicker">Room code</p><div class="bigcode">${[...room].map(c=>`<span>${c}</span>`).join('')}</div>
  <div class="joinbox"><div class="qr">${qr.createSvgTag(5,0)}</div><p class="sub">Scan the QR code, or type the code on the home page.</p></div>
  <h2>Players <small>${ids.length}/${CONFIG.maxPlayers}</small></h2><ul class="players">${ids.map(i=>`<li class="pchip ${seenPlayers&&!seenPlayers.includes(i)?'join':''}">${avatar(i)}<span>${pn(i)}</span>${i===R.host?'<em>Host</em>':''}</li>`).join('')}${Array.from({length:Math.max(0,CONFIG.minPlayers-ids.length)},()=>'<li class="pchip empty"><span class="av">?</span><span>Waiting…</span></li>').join('')}</ul>
  ${isHost()?`<button id="st" class="wide ${ready?'':'locked'} ${boom?'boom':''}" ${ready?'':'disabled'}>Start game</button><p class="muted center">${ready?'Everyone is here? Let\'s go!':`At least ${CONFIG.minPlayers} players needed (${need} more).`}</p>`:'<p class="muted center wait-host">Waiting for the host to start…</p>'}<button id="how" class="how wide">How to play</button>`);
  seenPlayers=ids;wasReady=ready;$('how').onclick=howTo;
  if(isHost())$('st').onclick=startRound;
}
const voted=i=>(R.votes||{})[i]&&(R.suspects||{})[i]; // vote complet = SHARE/REPORT + suspect
const cardOf=id=>CARDS.find(c=>c.id===id);
const theme=()=>THEMES[R.theme]; // thème de la manche
const cardBox=c=>`<span class="cat">${c.category}</span><span class="txt">${esc(c.text)}</span>`; // contenu d'une carte (format portrait, voir .card dans le CSS)
// Carte illustrée du thème : dossier theme/ à la racine (theme01.png … theme15.png dans l'ordre de THEMES, dos = back.png).
// Elle arrive de dos puis se retourne (voir .tcard dans le CSS).
const themeCard=()=>theme()?`<div class="tcard"><div class="inner"><img class="front" src="theme/theme${String(R.theme+1).padStart(2,'0')}.png" alt="${esc(theme().name)} card"><img class="back" src="theme/back.png" alt=""></div></div>`:'';
const newsBox=()=>`<p class="theme-name">${theme()?esc(theme().name):''}</p><div class="box headline">${esc(R.headline)}</div>`;
const playedBy=id=>{const i=Object.keys(R.plays||{}).find(k=>R.plays[k]===id);return i&&R.players[i]?pn(i):'?'}; // retrouve qui a joué la carte
const postBox=mark=>`<ol class="post">${R.post.filter(id=>{const k=Object.keys(R.plays||{}).find(k=>R.plays[k]===id);return k&&R.players&&R.players[k]}).map(id=>{const c=cardOf(id);return `<li class="pcard"><span class="who">${playedBy(id)}</span>${cardBox(c)}${mark?(c.type==='trap'?`<span class="tag flag">🚩 Trap</span><span class="why">${esc(c.why)}</span>`:'<span class="tag ok">✅ True clue</span>'):''}</li>`}).join('')}</ol>`;
function startRound(){
  const ids=Object.keys(R.players),n=R.round+1,used=R.used||[],left=THEMES.map((_,i)=>i).filter(i=>!used.includes(i));
  if(n>CONFIG.rounds||!left.length)return ref.update({phase:'end',endAt:firebase.database.ServerValue.TIMESTAMP});
  const k=left[Math.random()*left.length|0],max=ids.length>=5?CONFIG.maxTrolls:1,t=1+Math.floor(Math.random()*max),roles={},hands={},spare={};
  // Pioches du thème : vrais indices et pièges. Si une pioche est vide (5-6 joueurs), on la remélange (une même carte peut alors être chez 2 joueurs).
  const all=ty=>CARDS.filter(c=>c.theme===k&&c.type===ty).map(c=>c.id),P={true:shuffle(all('true')),trap:shuffle(all('trap'))};
  const draw=(ty,not)=>{let i=P[ty].findIndex(id=>!not.includes(id));if(i<0){P[ty]=shuffle(all(ty));i=P[ty].findIndex(id=>!not.includes(id))}return P[ty].splice(i,1)[0]};
  shuffle(ids).forEach((i,j)=>roles[i]=j<t?'Troll':'Citizen');
  // Citizen : 2 vrais indices + 1 piège caché. Troll : 2 pièges + 1 vrai indice.
  // Citizen : 2 vrais indices + 1 piège. Troll : 1, 2 ou 3 pièges au hasard (1 = 35 %, 2 = 45 %, 3 = 20 %), le reste en vrais indices.
  const trollTraps=()=>{const x=Math.random();return x<.35?1:x<.8?2:3};
  ids.forEach(i=>{const tr=roles[i]==='Troll',h=[],n=tr?trollTraps():1;for(const ty of ['trap','trap','trap'].slice(0,n).concat(['true','true','true'].slice(0,3-n)))h.push(draw(ty,h));hands[i]=shuffle(h)});
  ids.forEach(i=>spare[i]=draw(Math.random()<.6?'true':'trap',hands[i]));
  ref.update({phase:'role',round:n,theme:k,headline:THEMES[k].claim,used:[...used,k],roles,hands,spare,plays:null,post:null,votes:null,suspects:null,french:null,verdict:null,endsAt:null});
}
// Seul le Troll voit sur SON téléphone quels indices de sa main sont des pièges
const trollTag=c=>c.type==='trap'?'<span class="tag flag">🚩 Trap</span>':'<span class="tag safe">True clue</span>';
// Troll : état du post EN DIRECT pendant le choix des cartes (d'après les cartes déjà jouées)
// Troll : il connaît la vraie réponse dès le début de la manche
const isFake=()=>theme()&&theme().answer==='FAKE';
function trollLive(){
  const f=isFake();
  return `<div class="box secretbox"><p><strong>Troll secret:</strong> this news is <span class="${f?'FAKE':'FACT'}">${f?'FAKE':'TRUE'}</span>.</p><p class="muted">Make the Citizens believe it is ${f?'TRUE (so they SHARE it)':'FAKE (so they REPORT it)'}. Your traps 🚩 can help you.</p></div>`;
}
function role(){
  if(R.round!==seenRound){seenRound=R.round;roleShown=false;sel=null;turned=new Set()}
  if(!R.roles||!R.roles[pid]){show(`${newsBox()}<p>A round is already in progress. You will play from the next round.</p>`);return}
  const my=R.roles[pid],hand=(R.hands||{})[pid]||[],played=(R.plays||{})[pid],ids=act(),np=ids.filter(i=>(R.plays||{})[i]).length,sp=(R.spare||{})[pid];
  const goal=my==='Troll'?'You know the truth. Make the Citizens vote wrong! You score 1 point for each Citizen who votes wrong, and nothing for your own vote. Your traps are marked below.':'Is this news true or fake? Read your clues: one of them is a trap! Play the clue you trust, and find the Troll.';
  show(`<p class="breaking"><i></i>Breaking news</p>${themeCard()}${newsBox()}
  <button id="rv" class="ghost wide">${roleShown?'Hide my role and cards':'Show my role and cards'}</button>
  ${roleShown?`<div class="box rolebox ${my==='Troll'?'troll':'citizen'}${flipRole?' flip reveal':''}"><p class="youare">You are…</p><div class="rolename" data-text="${my}">${my}</div><p>${goal}</p></div>${my==='Troll'?trollLive():''}<h2>Your clues</h2>
  <p class="muted">${played?'':'Tap a card to turn it over, then tap it again to choose it.'}</p>
  <div class="hand">${hand.map(id=>turned.has(id)||id===played
    ?`<button class="card ${id===(played||sel)?'on':''} ${id===popCard?'pop':''} ${id===flipNow?'flipin':''}" data-id="${id}" ${played?'disabled':''}>${cardBox(cardOf(id))}${my==='Troll'?trollTag(cardOf(id)):''}</button>`
    :`<button class="card facedown ${id===swapIn?'swapin':''}" data-id="${id}" ${played?'disabled':''} aria-label="Face-down card: tap to turn it over"></button>`).join('')}</div>
  ${played?'<p class="done-msg">Card played. Waiting for the others…</p>':`<div class="actions"><button id="pl" ${sel?'':'disabled'}>Play this card</button>${sp?`<button id="sw" class="ghost" ${sel?'':'disabled'}>Swap it (once)</button>`:''}</div>`}`:'<p class="muted center">Make sure nobody can see your screen.</p>'}
  <div class="progress"><span>Cards played</span><span class="pdots">${ids.map(i=>`<i class="${(R.plays||{})[i]?'on':''}"></i>`).join('')}</span><b>${np}/${ids.length}</b></div>
  <p class="muted center small">The clues appear when everyone has played.</p>`);
  flipRole=false;popCard=null;flipNow=null;if(swapIn&&hand.includes(swapIn))swapIn=null;
  $('rv').onclick=()=>{roleShown=!roleShown;flipRole=roleShown;if(roleShown){flash();buzz(40)}render()};
  // Carte face cachée : 1er toucher = elle se retourne ; carte retournée : toucher = la choisir
  app.querySelectorAll('.card').forEach(b=>b.onclick=()=>{const id=b.dataset.id;
    if(!turned.has(id)){turned.add(id);flipNow=id;buzz(15)}else{sel=id;popCard=sel}render()});
  if($('pl'))$('pl').onclick=()=>ref.child('plays/'+pid).set(sel);
  if($('sw'))$('sw').onclick=()=>{const u={},out=sel,el=app.querySelector(`.card[data-id="${out}"]`);u['hands/'+pid]=hand.map(c=>c===out?sp:c);u['spare/'+pid]=null;sel=null;
    if(el&&!calm())el.classList.add('swapout');
    setTimeout(()=>{swapIn=sp;ref.update(u)},calm()?0:380)};

}
function debate(){
  show(`<h2>Debate</h2><p class="kicker">English only · ${CONFIG.debateSeconds} seconds</p><div class="tring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="bg" cx="60" cy="60" r="54"/><circle class="fg" id="tr" cx="60" cy="60" r="54"/></svg><div class="timer" id="t">--</div></div>${newsBox()}${postBox(false).replace('class="post"','class="post flipcards"')}
  <ul class="asks"><li>Is this news <b>true</b> or <b>fake</b>?</li><li>Which clue is a <b>trap</b>?</li><li>Who is the <b>Troll</b>?</li></ul><p class="muted center small">Every French word costs 1 point.</p>${secretHtml()}${isHost()?'<button id="go" class="ghost wide">Go to vote now</button>':''}`);
  bindSecret();if(isHost())$('go').onclick=toVote;updTimer();
}
// ----- Info secrète (débat + vote) -----
// Le Troll peut voir si le post est FAKE ou FACT, pour pousser la table vers la mauvaise réponse.
// Tout le monde a le même bouton (un Citizen voit « pas d'info secrète ») : appuyer dessus ne trahit donc pas le Troll.
function secretHtml(){
  const k=R.phase+R.round;if(k!==secretKey){secretKey=k;secretShown=false}
  if(!R.roles||!R.roles[pid])return '';
  const troll=R.roles[pid]==='Troll',fake=isFake();
  const info=troll?`<p><strong>Troll secret:</strong> this news is <span class="${fake?'FAKE':'FACT'}">${fake?'FAKE':'TRUE'}</span>.</p><p>${fake?'Convince the Citizens it is TRUE, so they SHARE it.':'Convince the Citizens it is FAKE, so they REPORT it.'}</p>`
    :'<p>You are a Citizen: no secret info for you. Read the clues and trust your brain!</p>';
  const h=`<button id="sc" class="secret wide">${secretShown?'Hide my secret info':'Show my secret info'}</button>${secretShown?`<div class="box secretbox${secretFlip?' flip':''}">${info}</div>`:''}`;
  secretFlip=false;return h;
}
const bindSecret=()=>{if($('sc'))$('sc').onclick=()=>{secretShown=!secretShown;secretFlip=secretShown;render()}};
// Passage au débat : les cartes jouées sont mélangées et le chrono démarre
const toDebate=()=>{if(R&&R.phase==='role')ref.update({phase:'debate',post:shuffle(Object.entries(R.plays||{}).filter(([k])=>R.players&&R.players[k]).map(([,v])=>v)),endsAt:now()+CONFIG.debateSeconds*1000})};
const toVote=()=>{if(R&&R.phase==='debate')ref.update({phase:'vote'})};
function updTimer(){
  const t=$('t');if(!t||!R||R.phase!=='debate')return;
  const left=Math.max(0,R.endsAt-now()),l=Math.ceil(left/1000);t.textContent=l;t.classList.toggle('urgent',l>0&&l<=10);
  // Anneau qui se vide + bords de l'écran qui pulsent et vibration les 5 dernières secondes
  const ring=$('tr');if(ring)ring.style.strokeDashoffset=(339.3*(1-Math.min(1,left/(CONFIG.debateSeconds*1000)))).toFixed(1);
  if(ring)ring.classList.toggle('urgent',l>0&&l<=10);
  document.body.classList.toggle('edge',l>0&&l<=5);
  if(l>0&&l<=5&&l!==lastBuzz){lastBuzz=l;buzz(60)}
  // Chrono à 0 : n'importe quel joueur fait passer au vote (si l'onglet du Host est en arrière-plan, son chrono peut être ralenti par le navigateur)
  if(l<=0)toVote();
}
let lastBuzz=null;
function vote(){
  const ids=act(),v=R.votes||{},mine=v[pid],sus=(R.suspects||{})[pid];
  show(`<h2>Vote</h2>${newsBox()}${postBox(false)}${secretHtml()}${R.roles[pid]?`<p class="q"><b>1</b> Is this news true?</p>
  <div class="choices ${mine?'has':''}"><button id="s" class="choice share ${mine==='SHARE'?'on':''}"><strong>Share</strong><small>It's true</small></button><button id="r" class="choice report ${mine==='REPORT'?'on':''}"><strong>Report</strong><small>It's fake</small></button></div>
  <p class="q"><b>2</b> Who is the Troll?</p><div class="suspects">${ids.filter(i=>i!==pid).map(i=>`<button class="pchip ${sus===i?'on':''}" data-sus="${i}">${avatar(i)}<span>${pn(i)}</span></button>`).join('')}</div>
  <p class="status ${mine&&sus?'ok':''}">${mine&&sus?'✓ Vote saved. You can still change it.':'Choose both to validate your vote.'}</p>`:'<p>You will play from the next round.</p>'}
  <h2>Votes in</h2><ul class="players">${ids.map(i=>`<li class="pchip ${voted(i)?'ok':'wait'}">${avatar(i)}<span>${pn(i)}</span><em>${voted(i)?'✓':'…'}</em></li>`).join('')}</ul>
  ${isHost()?'<button id="go" class="ghost wide">Reveal verdict now</button>':'<p class="muted center">The verdict appears when everyone has voted.</p>'}`);
  if($('s')){$('s').onclick=()=>ref.child('votes/'+pid).set('SHARE');$('r').onclick=()=>ref.child('votes/'+pid).set('REPORT')}
  bindSecret();app.querySelectorAll('[data-sus]').forEach(b=>b.onclick=()=>ref.child('suspects/'+pid).set(b.dataset.sus));
  if(isHost())$('go').onclick=reveal;
}
function reveal(){
  if(done===R.round)return;done=R.round;
  const fake=isFake(),votes=R.votes||{},ids=act();
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
  if(shared===fake)upd.missed=[...(R.missed||[]),R.theme]; // la table s'est trompée : on garde le thème pour la fin
  ref.update(upd);
}
function verdict(){
  const V=R.verdict,ids=Object.keys(R.players),tr=ids.filter(i=>R.roles[i]==='Troll');
  show(`<div class="vhead"><div class="verdict ${V.fake?'FAKE':'FACT'}">${V.fake?'FAKE':'FACT'}</div><p class="callout ${V.shared!==V.fake?'good':'bad'}">The table ${V.shared?'shared':'reported'} it · ${V.shared!==V.fake?'Good call!':'Wrong call!'}</p></div>
  ${newsBox()}<div class="box truth"><p class="kicker">The truth</p><p>${theme()?esc(theme().why):''}</p></div>
  <h2>The clues</h2>${postBox(true)}
  <h2>${tr.length>1?'The Trolls':'The Troll'}</h2><ul class="players">${tr.length?tr.map(i=>`<li class="pchip troll">${avatar(i)}<span>${pn(i)}</span><em>Troll</em></li>`).join(''):'<li>There was no Troll this round.</li>'}</ul>
  <h2>Points this round</h2>${roundPts()}<h2>Scores</h2>${scores()}
  ${isHost()?`<details class="lit" ${litOpen?'open':''}><summary>Lost in translation: tap a name for each French word (−${CONFIG.frenchPenalty})</summary><div>${ids.map(i=>`<button class="ghost mini" data-i="${i}">${pn(i)} −${CONFIG.frenchPenalty}</button>`).join('')}</div></details><button id="nx" class="wide">${R.round>=CONFIG.rounds?'See final scores':'Next round'}</button>`:'<p class="muted center wait-host">Waiting for the host…</p>'}`);
  const lt=app.querySelector('.lit');if(lt)lt.ontoggle=()=>{litOpen=lt.open};
  if(isHost()){
    app.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{const i=b.dataset.i;ref.child(`players/${i}/score`).transaction(s=>(s||0)-CONFIG.frenchPenalty);ref.child(`french/${i}`).transaction(n=>(n||0)+1)});
    $('nx').onclick=startRound;
  }
}
// Détail des points de la manche : Right vote, Troll found, Fooled you!, Lost in translation
function roundPts(){
  const P=(R.verdict&&R.verdict.pts)||{},F=R.french||{};
  return `<ul class="rows">${Object.keys(P).filter(i=>R.players[i]).map(i=>{
    const d=P[i],fr=(F[i]||0)*CONFIG.frenchPenalty,parts=[];
    if(d.right)parts.push(`Right vote +${d.right}`);
    if(d.found)parts.push(`Troll found +${d.found}`);
    if(d.fooled)parts.push(`Fooled you! +${d.fooled}`);
    if(fr)parts.push(`Lost in translation −${fr}`);
    const tot=(d.right||0)+(d.found||0)+(d.fooled||0)-fr;
    return `<li>${avatar(i)}<span class="n">${pn(i)}</span><span class="d">${parts.join(' · ')||'No points'}</span><b class="${tot>0?'pos':tot<0?'neg':'zero'}">${tot>=0?'+':'−'}${Math.abs(tot)}</b></li>`}).join('')}</ul>`;
}
// Podium : 2e, 1er, 3e (les barres montent l'une après l'autre)
function podium(){
  const ids=Object.keys(R.players).sort((a,b)=>R.players[b].score-R.players[a].score),top=ids.slice(0,3);
  const med=['🥇','🥈','🥉'],order=[1,0,2].filter(i=>top[i]);
  return `<div class="podium">${order.map(i=>`<div class="step p${i+1}"><div class="who">${med[i]}<br><strong>${pn(top[i])}</strong><br>${R.players[top[i]].score} pts</div><div class="bar">${i+1}</div></div>`).join('')}</div>
  ${ids.length>3?`<ul>${ids.slice(3).map((i,k)=>`<li>${k+4}. ${pn(i)}: ${R.players[i].score}</li>`).join('')}</ul>`:''}`;
}
function final(){
  const miss=[...new Set(R.missed||[])].map(i=>THEMES[i]).filter(Boolean);
  show(`<h1 class="center">Final scores</h1>${podium()}
  <h2>Full ranking</h2>${scores()}
  ${miss.length?`<h2>What the table got wrong</h2><ul class="missed">${miss.map(t=>`<li><p class="kicker">${esc(t.name)}</p><strong>${esc(t.claim)}</strong> <span class="${t.answer==='FAKE'?'FAKE':'FACT'}">${t.answer==='FAKE'?'FAKE':'TRUE'}</span><p>${esc(t.why)}</p></li>`).join('')}</ul>`:'<p class="callout good">The table got every news right. Well done!</p>'}
`);
}

// =====================================================================
// MODE TABLE (jeu physique) : ouvert UNIQUEMENT par le QR code d'une carte thème (?card=01 … ?card=15).
// Un seul téléphone qu'on se passe : nombre de joueurs → chaque joueur entre son nom et voit son rôle →
// débat chronométré → le maître du jeu donne les points. Chaque carte = une partie indépendante (rien n'est enregistré).
// =====================================================================
let T=null,tTimer=null;
const tAv=(k,n)=>`<span class="av c${k%3}" aria-hidden="true">${esc(n.charAt(0).toUpperCase())}</span>`;
const tBar=()=>`<header class="bar"><img src="ADDS/logo.png" alt="Fake or Fact"><div class="mid"><span class="rnd">Table mode</span><span class="tname">${esc(THEMES[T.theme].name)}</span></div></header>`;
function tShow(key,html){show(tBar()+html);animate('t-'+key)}
function tableMode(t){
  T={theme:t,n:0,players:[],step:'count',undo:[]};tCount();
}
// 1. Combien de joueurs ?
function tCount(){
  const th=THEMES[T.theme];
  tShow('count',`<div class="tcard"><div class="inner"><img class="front" src="theme/theme${String(T.theme+1).padStart(2,'0')}.png" alt="${esc(th.name)} card"><img class="back" src="theme/back.png" alt=""></div></div>
  <h1 class="center">How many players?</h1><p class="muted center">The game master does not count as a player.</p>
  <div class="counts">${[3,4,5,6].map(n=>`<button class="count" data-n="${n}">${n}</button>`).join('')}</div>
  <button id="how" class="how wide">How to play</button>`);
  app.querySelectorAll('.count').forEach(b=>b.onclick=()=>{
    const n=+b.dataset.n,trolls=n>=5?1+Math.floor(Math.random()*2):1,roles=shuffle(Array.from({length:n},(_,k)=>k<trolls?'Troll':'Citizen'));
    T.n=n;T.roles=roles;T.players=[];tName()});
  $('how').onclick=howTo;
}
// 2. Chaque joueur : « Who are you? » puis son rôle
function tName(){
  const k=T.players.length;
  tShow('name'+k,`<p class="kicker center">Player ${k+1} of ${T.n}</p><h1 class="center">Who are you?</h1>
  <div class="panel"><label for="tn">Your name</label><input id="tn" maxlength="14" autocomplete="off" placeholder="Your name"><p id="err" class="FAKE"></p>
  <button id="tok" class="wide">OK</button></div>
  <p class="muted center small">Make sure nobody else can see the screen.</p>`);
  const go=()=>{const n=$('tn').value.trim();if(!n)return err('Enter your name.');if(T.players.some(p=>p.name.toLowerCase()===n.toLowerCase()))return err('This name is already taken.');
    T.players.push({name:n,role:T.roles[k],score:0});flash();buzz(40);tRole()};
  $('tok').onclick=go;$('tn').onkeydown=e=>{if(e.key==='Enter')go()};$('tn').focus();
}
function tRole(){
  const k=T.players.length-1,p=T.players[k],troll=p.role==='Troll',last=T.players.length===T.n;
  tShow('role'+k,`<p class="kicker center">Player ${k+1} of ${T.n}</p>
  <div class="box rolebox ${troll?'troll':'citizen'} flip reveal"><p class="youare">${esc(p.name)}, you are…</p><div class="rolename">${p.role}</div>
  <p>${troll?'Make the others vote wrong! Show this screen to the game master only: they will tell you if the news is true or fake.':'Find out if the news is true or fake, and find the Troll.'}</p></div>
  <button id="tnext" class="wide">${last?'Hide my role and start':'Hide my role and pass the phone'}</button>
  <p class="muted center small">${last?'Everyone is ready after you!':'Next: player '+(k+2)+' of '+T.n}</p>`);
  $('tnext').onclick=()=>last?tReady():tName();
}
// 3. Tout le monde est prêt : l'info + bouton « Start the debate »
function tReady(){
  const th=THEMES[T.theme];
  tShow('ready',`<p class="breaking"><i></i>Breaking news</p><p class="theme-name kicker">${esc(th.name)}</p><div class="box headline">${esc(th.claim)}</div>
  <h2>Players</h2><ul class="players">${T.players.map((p,k)=>`<li class="pchip">${tAv(k,p.name)}<span>${esc(p.name)}</span></li>`).join('')}</ul>
  <details class="lit gm"><summary>Game master only: show the answer</summary><p>This news is <span class="${th.answer==='FAKE'?'FAKE':'FACT'}">${th.answer==='FAKE'?'FAKE':'TRUE'}</span>. ${esc(th.why)}</p>
  <p>${T.players.filter(p=>p.role==='Troll').length>1?'Trolls':'Troll'}: <strong>${T.players.filter(p=>p.role==='Troll').map(p=>esc(p.name)).join(', ')}</strong></p></details>
  <button id="tgo" class="wide">Start the debate</button>`);
  $('tgo').onclick=tDebate;
}
// 4. Débat chronométré (même anneau que la version téléphone)
function tDebate(){
  const th=THEMES[T.theme],end=Date.now()+CONFIG.debateSeconds*1000;
  tShow('debate',`<h2>Debate</h2><p class="kicker">English only · ${CONFIG.debateSeconds} seconds</p>
  <div class="tring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="bg" cx="60" cy="60" r="54"/><circle class="fg" id="tr" cx="60" cy="60" r="54"/></svg><div class="timer" id="t">${CONFIG.debateSeconds}</div></div>
  <div class="box headline">${esc(th.claim)}</div>
  <ul class="asks"><li>Is this news <b>true</b> or <b>fake</b>?</li><li>Which clue is a <b>trap</b>?</li><li>Who is the <b>Troll</b>?</li></ul>
  <button id="tstop" class="ghost wide">Stop the debate now</button>`);
  let last=null;clearInterval(tTimer);
  const tick=()=>{const left=Math.max(0,end-Date.now()),l=Math.ceil(left/1000),t=$('t'),ring=$('tr');if(!t){clearInterval(tTimer);return}
    t.textContent=l;t.classList.toggle('urgent',l>0&&l<=10);if(ring){ring.style.strokeDashoffset=(339.3*(1-left/(CONFIG.debateSeconds*1000))).toFixed(1);ring.classList.toggle('urgent',l>0&&l<=10)}
    document.body.classList.toggle('edge',l>0&&l<=5);if(l>0&&l<=5&&l!==last){last=l;buzz(60)}
    if(l<=0){clearInterval(tTimer);document.body.classList.remove('edge');buzz([150,80,150]);tVote()}};
  tTimer=setInterval(tick,250);tick();
  $('tstop').onclick=()=>{clearInterval(tTimer);document.body.classList.remove('edge');tVote()};
}
// 5. Vote avec les cartes Vote (avant de montrer la réponse)
function tVote(){
  tShow('vote',`<div class="vhead"><p class="kicker">Time's up!</p><h1 class="center">Time to vote!</h1></div>
  <ul class="asks"><li>On <b>3, 2, 1</b>, everyone shows their Vote card: <b>SHARE</b> (true) or <b>REPORT</b> (fake).</li><li>At the same time, <b>point at the player</b> you think is the Troll.</li><li>The game master remembers the votes.</li></ul>
  <button id="tshow" class="wide">Show the answer</button>`);
  $('tshow').onclick=()=>{T.undo=[];tScore()};
}
// 6. Points : le maître du jeu tape sur les boutons de chaque joueur
function tScore(){
  const th=THEMES[T.theme],trolls=T.players.filter(p=>p.role==='Troll');
  const btn=(k,pts,label)=>`<button class="ghost mini tp" data-k="${k}" data-p="${pts}">${label}</button>`;
  const ranked=T.players.map((p,k)=>({p,k})).sort((a,b)=>b.p.score-a.p.score),max=Math.max(1,...T.players.map(p=>p.score));
  tShow('score',`<div class="vhead"><p class="kicker">The answer</p><div class="verdict ${th.answer==='FAKE'?'FAKE':'FACT'}">${th.answer==='FAKE'?'FAKE':'FACT'}</div></div>
  <div class="box headline">${esc(th.claim)}</div><div class="box truth"><p class="kicker">The truth</p><p>${esc(th.why)}</p></div>
  <h2>${trolls.length>1?'The Trolls':'The Troll'}</h2><ul class="players">${trolls.map(p=>`<li class="pchip troll">${tAv(T.players.indexOf(p),p.name)}<span>${esc(p.name)}</span><em>Troll</em></li>`).join('')}</ul>
  <h2>Give the points</h2><p class="muted small">Game master: tap a button for each player.</p>
  <ul class="tscore">${T.players.map((p,k)=>`<li><div class="who">${tAv(k,p.name)}<span class="n">${esc(p.name)}</span><span class="mini-role ${p.role==='Troll'?'troll':'citizen'}">${p.role}</span><b>${p.score}</b></div>
    <div class="btns">${p.role==='Troll'?btn(k,1,'Fooled +1'):btn(k,2,'Right vote +2')+btn(k,1,'Troll found +1')}${btn(k,-1,'French −1')}</div></li>`).join('')}</ul>
  <button id="tun" class="link" ${T.undo.length?'':'disabled'}>Undo last points</button>
  <h2>Ranking</h2><ol class="board">${ranked.map(({p,k},r)=>`<li><span class="rk">${r+1}</span>${tAv(k,p.name)}<span class="n">${esc(p.name)}</span><span class="barw"><span style="width:${Math.max(4,Math.max(0,p.score)/max*100)}%"></span></span><b>${p.score}</b></li>`).join('')}</ol>
  <button id="tagain" class="wide">Play again with this card</button><p class="muted center small">For a new news story, scan the QR code of another card.</p>`);
  app.querySelectorAll('.tp').forEach(b=>b.onclick=()=>{const k=+b.dataset.k,v=+b.dataset.p;T.players[k].score+=v;T.undo.push([k,v]);buzz(15);
    popMsg(`${T.players[k].name} ${v>0?'+':'−'}${Math.abs(v)}`,v>0?'good small':'bad small');tScoreKeep()});
  $('tun').onclick=()=>{const u=T.undo.pop();if(u){T.players[u[0]].score-=u[1];tScoreKeep()}};
  $('tagain').onclick=()=>{if(confirm('Start a new game with this card? Names and points are reset.'))tableMode(T.theme)};
}
// Réaffiche l'écran des points sans rejouer les animations d'entrée
function tScoreKeep(){const y=scrollY;tScore();scrollTo(0,y)}

// ----- Démarrage : reprend la partie en cours après un rechargement -----
(async()=>{
  // QR code d'une carte (?card=01 … ?card=15) : mode Table pour le jeu physique
  const card=parseInt(new URLSearchParams(location.search).get('card'),10);
  if(card>=1&&card<=THEMES.length)return tableMode(card-1);
  cleanup();
  const sv=JSON.parse(store.get('fof')||'null'),q=(new URLSearchParams(location.search).get('room')||'').toUpperCase();
  if(sv&&(!q||q===sv.code)){
    try{const s=await db.ref(`rooms/${sv.code}/players/${sv.pid}`).get();if(s.exists()){pid=sv.pid;return enter(sv.code)}}catch(e){}
  }
  home();
})();