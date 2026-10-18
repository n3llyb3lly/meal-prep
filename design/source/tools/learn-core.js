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
function record(L,kind,key,value,source,at,was){
  if(!KINDS.includes(kind)||key==null||key===''||value==null||value===''||W[source]==null)return L;
  at=day(at)||today();key=String(key);const v=String(value);const k=kind+'|'+key;const r0=L.recs[k];
  const r=r0?{...r0,vals:{...r0.vals}}:{n:0,first:at,last:at,vals:{}};const e=r.vals[v];const w=W[source];
  r.vals[v]=!e?{w,at,n:1,src:source}:at>=e.at?{w:decay(e.w,e.at,at)+w,at,n:e.n+1,src:source}:{...e,w:e.w+decay(w,at,e.at),n:e.n+1};
  if(was!=null&&String(was)!==v)r.vals[v].was=String(was);
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

// Fold the older keys into one store, once per migration level. The old keys stay as they are.
// Level 1: aliases, item numbers, abbreviations, brands, variants. Level 2 (step 6): prices from the price history.
function migrate(L,s,now){L=L&&L.recs?L:empty();s=s||{};now=day(now)||today();if((L.mv||0)>=2)return L;L=clone(L);
  if(!(L.mv>=1)){
    for(const a of s.aliases||[])if(a&&a.text&&a.item&&a.item!=='__ignore')record(L,'name',norm(a.text),'@'+a.item,'receipt-confirmed',now);
    for(const k in s.numLinks||{})record(L,'number',k,'@'+s.numLinks[k],'receipt-confirmed',now);
    for(const k in s.nameDict||{})record(L,'word','abbr:'+k,s.nameDict[k],'user-edit',now);
    for(const k in s.brandDict||{})record(L,'brand','n:'+k,s.brandDict[k],'user-edit',now);
    for(const iid in s.variants||{})for(const v of s.variants[iid]||[]){if(v.brand)record(L,'brand','@'+iid,v.brand,'receipt-confirmed',(v.last&&v.last.date)||now);if(v.flavor)record(L,'flavor','@'+iid,v.flavor,'receipt-confirmed',(v.last&&v.last.date)||now);}
    for(const k in s.numVar||{})record(L,'number','var:'+k,s.numVar[k],'receipt-confirmed',now);
    L.mv=1;}
  for(const iid in s.priceHistory||{})for(const h of [...(s.priceHistory[iid]||[])].sort((a,b)=>a.date<b.date?-1:1))if(!h.sale&&!h.discount&&h.paid>0)record(L,'price',(h.store||'aldi')+'|'+iid,(+h.paid).toFixed(2),'receipt-confirmed',h.date||now);
  L.mv=2;return L;}
// ---- Step 2: learn from a logged receipt ----
const nk=(store,num)=>{num=String(num||'').trim();return !store||store==='aldi'?num:store+':'+num;};
const isItem=v=>typeof v==='string'&&v[0]==='@';
// One-digit misreads between two strings of the same length, as sorted pairs like "3~8".
function digitPairs(a,b){a=String(a||'');b=String(b||'');if(a.length!==b.length)return [];const d=[];for(let i=0;i<a.length;i++)if(a[i]!==b[i])d.push(i);
  if(d.length!==1||!/\d/.test(a[d[0]])||!/\d/.test(b[d[0]]))return [];return [[a[d[0]],b[d[0]]].sort().join('~')];}
const same=(a,b)=>norm(a)===norm(b);
// What the person changed on a review row, against what the reader gave them: [field, was, now].
function editsOf(r){const e=[];if(!r||r.gap)return e;
  const n0=String(r.num0??r.num??''),n1=String(r.num||'');if(n0!==n1)e.push(['number',n0,n1]);
  if(r.total0!=null&&r.total!=null&&(+r.total0).toFixed(2)!==(+r.total||0).toFixed(2))e.push(['price',(+r.total0).toFixed(2),(+r.total||0).toFixed(2)]);
  if(r.iid0&&r.iid&&r.iid0!==r.iid)e.push(['item',r.iid0,r.iid]);else if(!r.iid0&&r.how==='picked')e.push(['item','',r.iid]);
  if(r.how==='named'){const nv=r.vNew||r.nv||{brand:r.brand0||'',flavor:r.flavor0||''};
    if(r.nName!=null&&!same(r.nName,r.name0))e.push(['name',r.name0||'',r.nName]);
    if(r.nCat!=null&&r.nCat!==r.nCat0)e.push(['group',r.nCat0||'',r.nCat]);
    if(!same(nv.brand,r.brand0))e.push(['brand',r.brand0||'',nv.brand||'']);
    if(!same(nv.flavor,r.flavor0))e.push(['flavor',r.flavor0||'',nv.flavor||'']);}
  return e;}
// Record what a finished receipt taught. rows: review rows after import (iid set). ctx: {store, date, names: iid → item name}.
// '-' stands for "no brand" or "no flavor" when the person cleared a suggestion.
function fromReceipt(L0,rows,ctx){ctx=ctx||{};const L=clone(L0);const st=ctx.store||'aldi',at=day(ctx.date)||today();const RC=(typeof window!=='undefined'&&window.ReceiptCore)||null;
  const nameOf=id=>typeof ctx.names==='function'?ctx.names(id):(ctx.names||{})[id];const seen={};
  for(const r of rows||[]){if(!r||r.gap||!r.iid)continue;const ed=editsOf(r);const has=k=>ed.find(x=>x[0]===k);const t=norm(r.text),ft=norm(r.fixedText||r.text);
    const linkSrc=has('item')||r.how==='picked'?'user-edit':r.how==='guess'?'suggestion-accepted':'receipt-confirmed';
    if(t){record(L,'name',t,'@'+r.iid,linkSrc,at,r.iid0?'@'+r.iid0:null);if(ft&&ft!==t)record(L,'name',ft,'@'+r.iid,linkSrc,at);}
    if(r.iid==='__ignore')continue;
    const hn=has('number');
    if(r.num)record(L,'number',nk(st,r.num),'@'+r.iid,hn?'user-edit':'receipt-confirmed',at);
    const raw=hn?(r.from||r.rawNum||r.num0):(r.corrected?r.from:'');
    if(raw&&r.num&&raw!==r.num){record(L,'number','fix:'+nk(st,raw),r.num,hn?'user-edit':'receipt-confirmed',at,hn?r.num0:null);for(const p of digitPairs(raw,r.num))record(L,'number','pair',p,hn?'user-edit':'receipt-confirmed',at);}
    const hp=has('price');if(hp)for(const p of digitPairs(hp[1],hp[2]))record(L,'price','pair',p,'user-edit',at);
    const fin=String(r.how==='named'?(r.nName??r.name0??''):(nameOf(r.iid)||'')).toLowerCase();const undo=new Set((r.fixUndo||[]).map(w=>String(w).toLowerCase()));
    for(const [w,f] of r.fixes||[]){const lw=String(w).toLowerCase(),lf=String(f).toLowerCase();
      if(undo.has(lw)||(!fin.includes(lf)&&fin.includes(lw)))record(L,'word','ocr:'+lw,lw,'user-edit',at,lf);
      else if(fin.includes(lf))record(L,'word','ocr:'+lw,lf,'receipt-confirmed',at);}
    if(!seen[r.iid]){seen[r.iid]=1;const q=Math.max(1,+r.count||1);const paid=r.wt?+r.unitP:(+r.total||0)/q;
      const sameSize=r.size0==null||String(r.size)===String(r.size0);if(paid>0&&!r.sale&&!r.disc&&sameSize)record(L,'price',st+'|'+r.iid,paid.toFixed(2),'receipt-confirmed',at);
      const sz=r.how==='named'?(r.nSize?r.nSize.amt:null):r.wt?null:r.size;if(sz!=null&&sz!==''&&sz!=='other')record(L,'size',st+'|'+r.iid,String(sz),r.size0!=null&&String(r.size)!==String(r.size0)?'user-edit':'receipt-confirmed',at);}
    if(r.how!=='named')continue;
    const name=String(r.nName??r.name0??'').trim();const keys=[...new Set(['t:'+t,'n:'+norm(name),'w2:'+two(name),'n:'+norm(r.name0)])].filter(k=>k.length>2);
    const src=k=>has(k)?'user-edit':'suggestion-accepted';
    if(name&&t)record(L,'name','as:'+t,name,src('name'),at,r.name0);
    if(has('name')&&RC){const ab=RC.learnNames(r.text,name);for(const k in ab)record(L,'word','abbr:'+k,ab[k],'user-edit',at);}
    if(!r.later){const g0=(r.nCat0||'Other')+'›'+(r.nSub||''),g1=r.nCat!=null&&r.nCat!==r.nCat0?r.nCat+'›':g0;for(const k of keys)record(L,'group',k,g1,src('group'),at,g0);}
    const nv=r.vNew||r.nv||{brand:r.brand0||'',flavor:r.flavor0||''};
    for(const [kind,v0,v1] of [['brand',r.brand0,nv.brand],['flavor',r.flavor0,nv.flavor]]){const v=String(v1||'').trim()||'-';if(v==='-'&&!v0)continue;
      for(const k of keys)record(L,kind,k,v,src(kind),at,v0||'-');record(L,kind,'@'+r.iid,v,src(kind),at);}}
  return L;}
// Item numbers this store store knows from earlier receipts. Map num → [item name].
function knownNums(L,store,nameOf){const K=new Map();store=store||'aldi';for(const k in (L&&L.recs)||{}){if(!k.startsWith('number|'))continue;const key=k.slice(7);if(/^(fix|var|pair)\b/.test(key))continue;
  const i=key.indexOf(':');const s=i<0?'aldi':key.slice(0,i),n=i<0?key:key.slice(i+1);if(s!==store||!/^\d{6}$/.test(n))continue;const b=best(L,'number',key);if(!b||!isItem(b.value)||b.weight<BUILTIN)continue;
  const nm=nameOf?nameOf(b.value.slice(1)):'';K.set(n,nm?[nm]:[]);}return K;}
// Misreads to fix before guessing: a raw number the person corrected before, and digit pairs they confused.
function pairs(L,kind,now){const out=new Set();for(const v of values(L,kind,'pair',now))if(v.weight>=BUILTIN)out.add(v.value);return out;}
function numLearn(L,store,now){return {fix:raw=>{const b=best(L,'number','fix:'+nk(store,raw),now);return b&&b.weight>=BUILTIN?b.value:null;},pairs:pairs(L,'number',now)};}
// The item a receipt line was linked to before: by item number, then by the printed text.
function itemFor(L,x,store,now){if(!L)return null;if(x.num){const b=best(L,'number',nk(store,x.num),now);if(b&&isItem(b.value)&&b.weight>=BUILTIN)return {iid:b.value.slice(1),how:'number'};}
  for(const t of [x.text,x.fixedText]){const b=t&&best(L,'name',norm(t),now);if(b&&isItem(b.value)&&b.weight>=BUILTIN)return {iid:b.value.slice(1),how:'learned'};}return null;}

// Words learned from receipts, for the OCR repair vocabulary.
function words(L,now){const V=new Set();for(const k in (L&&L.recs)||{}){if(!(k.startsWith('word|')||k.startsWith('name|as:')))continue;const b=best(L,k.slice(0,k.indexOf('|')),k.slice(k.indexOf('|')+1),now);
  if(b&&b.weight>=BUILTIN)for(const w of String(b.value).toLowerCase().split(/[^a-z]+/))if(w.length>=3)V.add(w);}return V;}
// How many printed texts point at each item. Fuzzy matching adds 0.1 for each.
function aliasCount(L,now){const c={};for(const k in (L&&L.recs)||{}){if(!k.startsWith('name|')||k.startsWith('name|as:'))continue;const b=best(L,'name',k.slice(5),now);if(b&&isItem(b.value)&&b.weight>=BUILTIN){const id=b.value.slice(1);c[id]=(c[id]||0)+1;}}return c;}

// ---- Step 5: how well the reader did on one receipt (kept in aldi-meal-prep:learnstats, outside undo) ----
const SUG=['name','group','brand','flavor'];
function statsOf(rows,o){o=o||{};const R=(rows||[]).filter(r=>r&&!r.gap);const st={at:o.date||today(),items:0,byNum:0,byAlias:0,byFuzzy:0,shown:0,accepted:0,edited:0,edits:0,ocr:0,undos:0,priceDigits:0,secs:null};
  for(const r of R){st.items+=r.wt?1:Math.max(1,+r.count||1);if(r.how==='number')st.byNum++;else if(r.how==='alias'||r.how==='learned')st.byAlias++;else if(r.how==='guess')st.byFuzzy++;
    const ed=editsOf(r);st.edits+=ed.length;if(r.how==='named'){st.shown++;if(ed.some(e=>SUG.includes(e[0])))st.edited++;else st.accepted++;}
    st.ocr+=(r.fixes||[]).length;st.undos+=(r.fixUndo||[]).length;
    for(const e of ed)if(e[0]==='price'){const a=e[1],b=e[2];if(a.length===b.length){for(let i=0;i<a.length;i++)if(a[i]!==b[i])st.priceDigits++;}else st.priceDigits+=Math.max(a.length,b.length);}}
  if(o.readAt&&o.addAt){const s=(Date.parse(o.addAt)-Date.parse(o.readAt))/1000;if(s>=0)st.secs=Math.round(s);}
  return st;}
const md=d=>{const x=String(d||'').slice(5,10).split('-');return x.length===2?`${+x[0]}/${+x[1]}`:'';};
function statsLine(s){return `${md(s.at)} · ${s.items} items · ${s.byNum} by number, ${s.byAlias} by name, ${s.byFuzzy} guessed · ${s.shown} suggestions: ${s.accepted} used, ${s.edited} changed · ${s.ocr} word repairs, ${s.undos} put back · ${s.priceDigits} price digits edited · ${s.edits} edits${s.secs!=null?` · ${s.secs} s from Read to Add`:''}`;}
// The last five receipts, oldest first: "Edits per receipt 27 → 9 → 3".
function trend(list,n){const L=(list||[]).slice(-(n||5));return L.length?`Edits per receipt ${L.map(s=>s.edits).join(' → ')}`:'Edits per receipt: no receipts yet';}

// ---- Step 6: habits, package sizes and usual prices ----
const median=a=>{const b=[...a].sort((x,y)=>x-y);const m=b.length>>1;return b.length%2?b[m]:(b[m-1]+b[m])/2;};
// Usual price: the median of the last 5 receipts at this store, once there are 3 or more.
function usual(L,iid,store){const r=get(L,'price',(store||'aldi')+'|'+iid);if(!r||!r.recent||r.recent.length<3)return null;
  return {price:Math.round(median(r.recent.map(x=>+x[0]))*100)/100,n:r.recent.length,last:r.last};}
// The package size, once the same size was seen on the last two receipts. Then the app stops asking.
function sizeSeen(L,iid,store){const r=get(L,'size',(store||'aldi')+'|'+iid);const a=r&&r.recent||[];if(a.length<2||a[a.length-1][0]!==a[a.length-2][0])return null;return a[a.length-1][0];}
// How often something is bought, from the dates it was bought: {n, every (median days between), last, due, dueIn}.
function habit(dates,now){const d=[...new Set((dates||[]).map(day).filter(Boolean))].sort();if(d.length<2)return {n:d.length,every:null,last:d[d.length-1]||null,due:null,dueIn:null};
  const gaps=[];for(let i=1;i<d.length;i++)gaps.push(age(d[i-1],d[i]));const every=Math.max(1,Math.round(median(gaps)));const last=d[d.length-1];
  const due=new Date(Date.parse(last)+every*DAY).toISOString().slice(0,10);return {n:d.length,every,last,due,dueIn:Math.round((Date.parse(due)-Date.parse(day(now)||today()))/DAY)};}
// Items worth keeping stocked: bought at least 3 times, about every 3 weeks or more often. hist: iid → [dates or {date}].
function stockIdeas(hist,now,skip){const out=[];for(const iid in hist||{}){if(skip&&skip(iid))continue;const h=habit((hist[iid]||[]).map(x=>x&&x.date||x),now);if(h.n>=3&&h.every&&h.every<=21)out.push({iid,...h});}
  return out.sort((a,b)=>a.every-b.every||b.n-a.n);}

// ---- Step 4: share words, names, brands, groups and numbers with the sheet (Learned tab) ----
// Never prices, sizes, dates or quantities: only these kinds leave the phone, and only kind, key, value and a count.
const SHARE=['word','name','brand','group','number'];
// A run of 4+ digits outside item numbers could be card digits or a phone number from a misread line: it stays on the phone.
const LONGNUM=/\d{4,}/;
// What is new since the last send: [kind, key, value, count added]. L.sent remembers counts already sent.
function toSend(L){const out=[];const sent=(L&&L.sent)||{};for(const k in (L&&L.recs)||{}){const i=k.indexOf('|'),kind=k.slice(0,i),key=k.slice(i+1);if(!SHARE.includes(kind))continue;
  if(key.length>200||(kind!=='number'&&LONGNUM.test(key)))continue;for(const v in L.recs[k].vals){if(v.length>200||(kind!=='number'&&LONGNUM.test(v)))continue;const id=k+'|'+v,n=L.recs[k].vals[v].n-(sent[id]||0);if(n>0)out.push([kind,key,v,n]);}}return out;}
function markSent(L,recs){L={...L,sent:{...(L.sent||{})}};for(const [kind,key,v,n] of recs){const id=kind+'|'+key+'|'+v;L.sent[id]=(L.sent[id]||0)+n;}return L;}
// Up to 50 records per learn.batch change.
const batches=(recs,n)=>{const out=[];for(let i=0;i<recs.length;i+=(n||50))out.push(recs.slice(i,i+(n||50)));return out;};
// The phone's own store plus what the sheet's Learned tab knows (catalog.learned: [kind,key,value,count,last_seen]).
// Sheet rows count as source 'catalog' and only add values this phone hasn't seen itself, so its own facts aren't counted twice.
function withCatalog(L,rows,now){if(!rows||!rows.length)return L||empty();const V=clone(L);for(const r of rows){if(!Array.isArray(r))continue;const [kind,key,value,count,seen]=r;
  if(!SHARE.includes(kind)||key==null||value==null)continue;const rec=V.recs[kind+'|'+key];if(rec&&rec.vals[String(value)])continue;
  record(V,kind,key,value,'catalog',day(seen)||day(now)||today());}return V;}

// How many records of each kind, for Diagnostics.
function counts(L){const c={};for(const k in (L&&L.recs)||{}){const kind=k.slice(0,k.indexOf('|'));c[kind]=(c[kind]||0)+1;}return c;}

window.LearnCore={W,BUILTIN,HALF,KINDS,empty,clone,record,values,best,get,prefer,lookup,migrate,counts,decay,norm,two,nk,digitPairs,editsOf,fromReceipt,knownNums,pairs,numLearn,itemFor,words,aliasCount,statsOf,statsLine,trend,median,usual,sizeSeen,habit,stockIdeas,SHARE,toSend,markSent,batches,withCatalog};
})();
