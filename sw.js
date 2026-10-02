// Meal Prep service worker. Change VERSION on every app upload so phones get the update prompt.
const VERSION='4.5.0';
const CACHE='aldi-meal-prep-'+VERSION;
const SHELL=['./','./index.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/maskable-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('aldi-meal-prep-')&&k!==CACHE&&k!=='aldi-meal-prep-data').map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('message',e=>{if(e.data==='skipWaiting')self.skipWaiting();});
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;const url=new URL(req.url);
  if(url.origin===location.origin&&url.pathname.endsWith('/catalog.json')){
    e.respondWith(fetch(req).then(r=>{if(r.ok){const cp=r.clone();caches.open('aldi-meal-prep-data').then(c=>c.put('./catalog.json',cp));}return r;}).catch(()=>caches.open('aldi-meal-prep-data').then(c=>c.match('./catalog.json'))));return;}
  if(req.mode==='navigate'){e.respondWith(caches.match('./index.html').then(r=>r||fetch(req)).catch(()=>new Response('<!doctype html><meta name=viewport content="width=device-width"><body style="font:17px system-ui;padding:24px;line-height:1.5"><h1>Meal Prep needs a connection once</h1><p>Open the app with internet the first time so it can save itself on this phone. After that it works offline.</p>',{headers:{'Content-Type':'text/html'}})));return;}
  e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(r=>{if(r.ok&&(url.origin===location.origin||r.type==='opaque'||r.type==='cors')){const cp=r.clone();caches.open(CACHE).then(c=>c.put(req,cp));}return r;})));
});
