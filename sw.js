// Meal Prep service worker. index.html, catalog.json and receipts.js are network-first, so a new upload reaches
// phones without changing this file. Icons and the manifest are cache-first. vendor/ (the receipt text reader,
// about 11 MB) is cache-first and downloaded only the first time the app asks for it, not at install.
// Photos shared to the installed app (Android share sheet) arrive as a POST to ./share; see receiveShare below.
const SHELL='aldi-meal-prep-shell-v2',DATA='aldi-meal-prep-data',VENDOR='aldi-meal-prep-vendor';
const PRE=['./index.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/maskable-512.png'];
// Everything the text reader needs offline, saved on the first scan so the next one works with no connection.
// Both cores: phones without SIMD load the plain one. Versions are pinned in vendor/tesseract/VERSION.
const VENDOR_FILES=['tesseract.min.js','worker.min.js','tesseract-core-simd-lstm.wasm.js','tesseract-core-lstm.wasm.js','eng.traineddata.gz'];
const hash=async t=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const timeout=(p,ms)=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),ms))]);
self.addEventListener('install',e=>{e.waitUntil(caches.open(SHELL).then(c=>c.addAll(PRE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('aldi-meal-prep-')&&![SHELL,DATA,VENDOR].includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
async function servePage(){const c=await caches.open(SHELL);
  try{const r=await timeout(fetch('./index.html',{cache:'no-store'}),5000);if(r.ok){const t=await r.clone().text();const h=await hash(t);
      await c.put('./index.html',r.clone());await c.put('./__cached-hash',new Response(h));await c.put('./__served-hash',new Response(h));return r;}}catch(e){}
  const hit=await c.match('./index.html');
  if(hit){const ch=await c.match('./__cached-hash');if(ch)await c.put('./__served-hash',new Response(await ch.text()));return hit;}
  return new Response('<!doctype html><meta name=viewport content="width=device-width"><body style="font:17px system-ui;padding:24px;line-height:1.5"><h1>Meal Prep needs a connection once</h1><p>Open the app with internet the first time so it can save itself on this phone. After that it works offline.</p>',{headers:{'Content-Type':'text/html'}});}
// Network first, then the saved copy (catalog.json, catalog-v1.json, receipts.js).
function networkFirst(req,key){return fetch(req).then(r=>{if(r.ok){const cp=r.clone();caches.open(DATA).then(c=>c.put(key,cp));}return r;}).catch(()=>caches.open(DATA).then(c=>c.match(key)).then(hit=>hit||Response.error()));}
// vendor/: cache first. The first request for any vendor file also saves the rest in the background,
// so the reader works offline after one scan.
let vendorFill=null;
function fillVendor(base){if(vendorFill)return vendorFill;
  vendorFill=caches.open(VENDOR).then(c=>Promise.all(VENDOR_FILES.map(f=>{const u=base+f;return c.match(u).then(hit=>hit||fetch(u).then(r=>r.ok?c.put(u,r):null).catch(()=>null));}))).catch(()=>null);
  return vendorFill;}
function serveVendor(e,req,url){
  const base=url.href.slice(0,url.href.indexOf('/vendor/tesseract/')+'/vendor/tesseract/'.length);
  e.waitUntil(fillVendor(base));
  return caches.open(VENDOR).then(c=>c.match(req,{ignoreSearch:true}).then(hit=>hit||fetch(req).then(r=>{if(r.ok){const cp=r.clone();c.put(req,cp);}return r;})));}
// Share target (manifest share_target). Android posts the shared photos here; save them in the meal-prep-share
// cache and open the app with ?share=1, which reads that cache, loads the photos into Add receipt and empties it.
const SHARE='meal-prep-share';
async function receiveShare(req){const scope=self.registration.scope;
  try{const files=(await req.formData()).getAll('receipt').filter(f=>f&&typeof f!=='string'&&f.size);
    if(files.length){const c=await caches.open(SHARE);const t=Date.now();
      await Promise.all(files.map((f,i)=>c.put(new URL(`./shared/${t}-${i}`,scope).href,new Response(f,{headers:{'Content-Type':f.type||'image/jpeg','X-File-Name':encodeURIComponent(f.name||`receipt-${i+1}.jpg`)}}))));}
  }catch(e){}
  return Response.redirect(new URL('./?share=1',scope).href,303);}
self.addEventListener('fetch',e=>{
  const req=e.request;const url=new URL(req.url);const same=url.origin===location.origin;
  if(!same)return; // the Google Sheet script and anything else off-site always go straight to the network
  if(req.method==='POST'&&url.pathname===new URL('./share',self.registration.scope).pathname){e.respondWith(receiveShare(req));return;}
  if(req.method!=='GET')return;
  if(req.mode==='navigate'){ // only the app page itself; tools/*.html go straight to the network
    const root=new URL(self.registration.scope).pathname;
    if(same&&(url.pathname===root||url.pathname===root+'index.html'))e.respondWith(servePage());return;}
  if(url.pathname.endsWith('/index.html'))return; // build checks go straight to the network
  if(url.pathname.endsWith('/catalog.json')){e.respondWith(networkFirst(req,'./catalog.json'));return;}
  if(url.pathname.endsWith('/catalog-v1.json')){e.respondWith(networkFirst(req,'./catalog-v1.json'));return;}
  if(url.pathname.endsWith('/receipts.js')){e.respondWith(networkFirst(req,'./receipts.js'));return;}
  if(url.pathname.includes('/vendor/tesseract/')){e.respondWith(serveVendor(e,req,url));return;}
  if(url.pathname.includes('/tools/')||url.pathname.includes('/data/'))return; // test pages and fixtures: always fresh
  e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(r=>{if(r.ok||r.type==='opaque'){const cp=r.clone();caches.open(SHELL).then(c=>c.put(req,cp));}return r;})));
});
