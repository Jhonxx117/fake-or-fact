// ===== Service worker de la PWA Fake or Fact =====
// Il rend le site INSTALLABLE (icône sur l'écran d'accueil) et garde une copie des fichiers pour démarrer plus vite.
// Règle importante (anti « vieux code ») : le code (HTML, JS, CSS, JSON) est TOUJOURS pris sur Internet d'abord ;
// la copie gardée ne sert que si le téléphone n'a pas de réseau. Les images et polices viennent de la copie, puis sont rafraîchies.
// Firebase (les salons en ligne) n'est jamais mis en cache : le jeu en ligne a toujours besoin d'Internet.
const CACHE = 'fof-v1';
const CORE = [
  './', 'index.html', 'app.js', 'cards.js', 'CSS/style.css', 'manifest.json',
  'ADDS/logo.png', 'ADDS/SixHandsBrush.woff2', 'ADDS/SixHandsCondensed.woff2', 'ADDS/ShantellSans.woff2',
  'ADDS/icons/icon-192.png', 'ADDS/icons/favicon.png', 'ADDS/jsQR.js', 'theme/back.png',
  ...Array.from({ length: 10 }, (_, k) => 'ADDS/letters/l' + String(k + 1).padStart(2, '0') + '.png'),
  ...Array.from({ length: 15 }, (_, k) => 'theme/theme' + String(k + 1).padStart(2, '0') + '.png')
];
// Bibliothèques externes gardées aussi, pour que le mode Table (QR des cartes) marche même sans réseau
const LIBS = ['www.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Clé de cache sans le « ?t=… » anti-cache de index.html
const key = url => new Request(url.origin + url.pathname);

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (!same && !LIBS.includes(url.hostname)) return; // Firebase, etc. : on ne touche à rien

  const isCode = req.mode === 'navigate' || /\.(html|js|css|json)$/.test(url.pathname) || url.pathname.endsWith('/');
  if (same && isCode) {
    // Réseau d'abord ; copie seulement hors ligne
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req.mode === 'navigate' ? key(new URL('./', self.location)) : key(url), copy)); }
      return res;
    }).catch(() => caches.match(req.mode === 'navigate' ? key(new URL('./', self.location)) : key(url))
      .then(r => r || caches.match(key(url), { ignoreSearch: true }))));
    return;
  }
  // Images, polices, bibliothèques : copie tout de suite, et mise à jour en arrière-plan
  const k = same ? key(url) : req;
  e.respondWith(caches.open(CACHE).then(c => c.match(k).then(hit => {
    const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(k, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  })));
});
