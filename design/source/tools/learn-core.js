// What the app learns from receipts and edits (learning prompt). Pure functions over one plain object that stays on the phone.
(function(){
const DAY=864e5,HALF=120;
// Weight of one record by source. Weights halve every 120 days.
const W={'user-edit':3,'catalog':2,'receipt-confirmed':2,'suggestion-accepted':1};
// A built-in guess (store brand, starter dictionary) counts as 1, so anything learned and still fresh beats it.
const BUILTIN=1;
const KINDS=['name','brand','flavor','group','number','word','size','price'];
const day=d=>String(d||'').slice(0,10);
const today=()=>new Date().toISOString().slice(0,10);
const age=(from,to)=>Math.max(0,(Date.parse(day(to))-Date.parse(day(from)))/DAY)||0;
const decay=(w,from,to)=>w*Math.pow(.5,age(from,to)/HALF);
const norm=s=>String(s||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
const two=s=>norm(s).split(' ').slice(0,2).join(' ');

function empty(){return {v:1,mv:0,recs:{}};}
// Copy before a batch of records. Only touched records are copied again.
function clone(L){return L&&L.recs?{...L,recs:{...L.recs}}:empty();}
// One fact: kind, key, value, where it came from, and the date it was seen.
function record(L,kind,key,value,source,at){
  if(!KINDS.includes(kind)||key==null||key===''||value==null||value===''||W[source]==null)return L;
  at=day(at)||today();key=String(key);const v=String(value);const k=kind+'|'+key;const r0=L.recs[k];
  const r=r0?{...r0,vals:{...r0.vals}}:{n:0,first:at,last:at,vals:{}};const e=r.vals[v];const w=W[source];
  r.vals[v]=!e?{w,at,n:1,src:source}:at>=e.at?{w:decay(e.w,e.at,at)+w,at,n:e.n+1,src:source}:{...e,w:e.w+decay(w,at,e.at),n:e.n+1};
  r.n++;if(at<r.first)r.first=at;if(at>=r.last){r.last=at;r.lastValue=v;}
  if(kind==='price'||kind==='size')r.recent=[...(r.recent||[]),[v,at]].slice(-5);
  L.recs[k]=r;return L;}
// Every value seen for a key, strongest first, with its weight today.
function values(L,kind,key,now){const r=L&&L.recs&&L.recs[kind+'|'+key];if(!r)return [];now=day(now)||today();
  return Object.entries(r.vals).map(([value,e])=>({value,weight:decay(e.w,e.at,now),n:e.n,at:e.at,src:e.src})).sort((a,b)=>b.weight-a.weight||(a.at<b.at?1:-1));}
function best(L,kind,key,now){return values(L,kind,key,now)[0]||null;}
const get=(L,kind,key)=>(L&&L.recs&&L.recs[kind+'|'+key])||null;
// The learned value when it outweighs a built-in guess, else the guess.
function prefer(L,kind,key,builtin,now){const b=best(L,kind,key,now);if(b&&b.weight>=BUILTIN)return {value:b.value,from:'learned',weight:b.weight};return {value:builtin,from:builtin?'built-in':'',weight:builtin?BUILTIN:0};}
// A lookup the receipt rules can call without knowing about this file.
function lookup(L,now){return (kind,key)=>{const b=best(L,kind,key,now);return b&&b.weight>=BUILTIN?b.value:null;};}

// Fold the older keys into one store. Runs once per migration level; the old keys stay as they are.
function migrate(L,s,now){L=L&&L.recs?L:empty();s=s||{};now=day(now)||today();if((L.mv||0)>=1)return L;L=clone(L);
  for(const a of s.aliases||[])if(a&&a.text&&a.item&&a.item!=='__ignore')record(L,'name',norm(a.text),'@'+a.item,'receipt-confirmed',now);
  for(const k in s.numLinks||{})record(L,'number',k,'@'+s.numLinks[k],'receipt-confirmed',now);
  for(const k in s.nameDict||{})record(L,'word','abbr:'+k,s.nameDict[k],'user-edit',now);
  for(const k in s.brandDict||{})record(L,'brand',k,s.brandDict[k],'user-edit',now);
  for(const iid in s.variants||{})for(const v of s.variants[iid]||[]){if(v.brand)record(L,'brand','@'+iid,v.brand,'receipt-confirmed',(v.last&&v.last.date)||now);if(v.flavor)record(L,'flavor','@'+iid,v.flavor,'receipt-confirmed',(v.last&&v.last.date)||now);}
  for(const k in s.numVar||{})record(L,'number','var:'+k,s.numVar[k],'receipt-confirmed',now);
  L.mv=1;return L;}
// How many records of each kind, for Diagnostics.
function counts(L){const c={};for(const k in (L&&L.recs)||{}){const kind=k.slice(0,k.indexOf('|'));c[kind]=(c[kind]||0)+1;}return c;}

window.LearnCore={W,BUILTIN,HALF,KINDS,empty,clone,record,values,best,get,prefer,lookup,migrate,counts,decay,norm,two};
})();
