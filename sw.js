// Meal Prep service worker. index.html and catalog.json are network-first, so a new upload reaches phones
// without changing this file. Icons and the manifest are cache-first.
const SHELL='aldi-meal-prep-shell',DATA='aldi-meal-prep-data';
const PRE=['./index.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/maskable-512.png'];
const hash=async t=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const timeout=(p,ms)=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),ms))]);
self.addEventListener('install',e=>{e.waitUntil(caches.open(SHELL).then(c=>c.addAll(PRE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('aldi-meal-prep-')&&k!==SHELL&&k!==DATA).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
async function servePage(){const c=await caches.open(SHELL);
  try{const r=await timeout(fetch('./index.html',{cache:'no-store'}),5000);if(r.ok){const t=await r.clone().text();const h=await hash(t);
      await c.put('./index.html',r.clone());await c.put('./__cached-hash',new Response(h));await c.put('./__served-hash',new Response(h));return r;}}catch(e){}
  const hit=await c.match('./index.html');
  if(hit){const ch=await c.match('./__cached-hash');if(ch)await c.put('./__served-hash',new Response(await ch.text()));return hit;}
  return new Response('<!doctype html><meta name=viewport content="width=device-width"><body style="font:17px system-ui;padding:24px;line-height:1.5"><h1>Meal Prep needs a connection once</h1><p>Open the app with internet the first time so it can save itself on this phone. After that it works offline.</p>',{headers:{'Content-Type':'text/html'}});}
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;const url=new URL(req.url);const same=url.origin===location.origin;
  if(!same)return; // the Google Sheet script and anything else off-site always go straight to the network
  if(req.mode==='navigate'){ // only the app page itself; tools/*.html go straight to the network
    const root=new URL(self.registration.scope).pathname;
    if(same&&(url.pathname===root||url.pathname===root+'index.html'))e.respondWith(servePage());return;}
  if(same&&url.pathname.endsWith('/index.html'))return; // build checks go straight to the network
  if(same&&url.pathname.endsWith('/catalog.json')){
    e.respondWith(fetch(req).then(r=>{if(r.ok){const cp=r.clone();caches.open(DATA).then(c=>c.put('./catalog.json',cp));}return r;}).catch(()=>caches.open(DATA).then(c=>c.match('./catalog.json'))));return;}
  e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(r=>{if(r.ok||r.type==='opaque'){const cp=r.clone();caches.open(SHELL).then(c=>c.put(req,cp));}return r;})));
});
