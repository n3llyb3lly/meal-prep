// Meal Prep shared rules. Loaded by the app (index.html), tools/selftest.html and tools/components.html.
// Pure functions only: no DOM, no storage. Change a rule here and the self-test checks it.
(function(){
const r2=n=>Math.round(n*100)/100,r3=n=>Math.round(n*1000)/1000;
const kdate=k=>{const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d);};
const diffD=(a,b)=>Math.round((kdate(a)-kdate(b))/864e5);

// Trip length: from the start date up to, but not including, the next shopping day.
function tripDays(start,end){return Math.max(1,diffD(end,start));}

// Budget for a trip. Rounded once, from the totals.
function tripBudget({weekly,days,carry,override}){
  const share=r2(weekly*days/7);const c=r2(carry||0);const usual=Math.max(0,r2(weekly*days/7+(carry||0)));
  return {share,carry:c,usual,budget:override!=null?r2(override):usual,overridden:override!=null};}

// What a finished trip carries into the next one. A trip with no receipts carries nothing.
// Capped at one week's budget either way.
function carryOver({budget,spent,weekly,hadReceipts}){
  if(!hadReceipts)return 0;const v=r2(budget-spent);return Math.max(-weekly,Math.min(weekly,v));}

// Staple states: none (not checked), have, low, out, skip (don't buy).
const STAPLE_STATES=['none','have','low','out','skip'];
const STAPLE_LABEL={none:'Not checked',have:'Have',low:'Low',out:'Out',skip:"Don't buy"};
function stapleState(stored,answered){if(stored==='skip')return 'skip';if(answered)return stored||'out';return (stored==='low'||stored==='out')?stored:'none';}
// Does a staple go on the list, and is it counted in the total?
function stapleOnList(state,neededByMenu){
  if(state==='out')return {list:!!neededByMenu,total:!!neededByMenu,low:false};
  if(state==='low')return {list:false,total:false,low:true};
  return {list:false,total:false,low:false};}

// Whole packages to buy for a shortfall.
function packsFor(short,pkg){return short>1e-9?Math.max(1,Math.ceil(short/pkg-1e-9)):0;}

// Take an amount from batches, oldest use-by first. Returns {left, used}.
function takeOldest(batches,amt){const bs=batches.map(b=>({...b})).sort((a,b)=>a.use<b.use?-1:a.use>b.use?1:0);const used=[];let left=amt;
  for(const b of bs){if(left<=1e-9)break;const tk=Math.min(b.q,left);if(tk<=0)continue;used.push({bid:b.bid,q:r3(tk)});b.q=r3(b.q-tk);left-=tk;}
  return {left:bs.filter(b=>b.q>1e-6),used,short:r3(Math.max(0,left))};}

// Receipt price check: 8% or more away from the usual price asks "sale or new regular price?"
const SALE_RULE=.08;
function priceAsk(paid,usual){if(!(usual>0)||!(paid>0))return false;return Math.abs(paid-usual)/usual>=SALE_RULE-1e-9;}

// Design tokens: mirrored in the app's <helmet> CSS variables. tools/components.html checks contrast from here.
const TOKENS={
  light:{page:'#EDF1F3',surface:'#FFFFFF',tint:'#E3EAF0',ink:'#15202B',muted:'#586878',faint:'#647381',line:'#D9E1E6',lineStrong:'#B9C6CF',
    primary:'#17375E',primaryInk:'#17375E',onAccent:'#FFFFFF',onAccentMuted:'#DDE6EE',good:'#16734C',goodInk:'#16734C',goodTint:'#DCF1E7',goodLine:'#BFE3D0',
    warnInk:'#8F5200',warnTint:'#FCEBCB',warnLine:'#F2D49B',warnSoft:'#FDF4E3',bad:'#A9231B',badInk:'#A9231B',badTint:'#FADFDC',badLine:'#F2BDB7',alert:'#C24A0A'},
  dark:{page:'#0F151A',surface:'#1A2229',tint:'#24313B',ink:'#E6ECF0',muted:'#A3B1BD',faint:'#93A1AD',line:'#2C3943',lineStrong:'#4A5A66',
    primary:'#2F6299',primaryInk:'#9CC0E8',onAccent:'#FFFFFF',onAccentMuted:'#DDE6EE',good:'#237A52',goodInk:'#7FD3A8',goodTint:'#17352A',goodLine:'#23523D',
    warnInk:'#F0B65A',warnTint:'#3A2C12',warnLine:'#6A5020',warnSoft:'#2E2614',bad:'#B53A31',badInk:'#FF9A90',badTint:'#3D1C1A',badLine:'#6B2E29',alert:'#F08A4B'}};
// Text/background pairs the UI actually uses.
const PAIRS=[['ink','surface'],['ink','page'],['muted','surface'],['muted','page'],['muted','tint'],['faint','surface'],['primaryInk','surface'],['onAccent','primary'],['onAccent','good'],['onAccent','bad'],
  ['goodInk','goodTint'],['warnInk','warnTint'],['badInk','badTint'],['ink','tint'],['primaryInk','tint'],['warnInk','warnSoft']];
function lum(hex){const c=hex.replace('#','');const v=[0,2,4].map(i=>parseInt(c.slice(i,i+2),16)/255).map(x=>x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4));return .2126*v[0]+.7152*v[1]+.0722*v[2];}
function contrast(a,b){const l1=lum(a),l2=lum(b);return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);}

// Units (WP25). Same-kind conversion only. Base factors: volume in tsp, weight in oz.
const VOL={tsp:1,tbsp:3,'fl oz':6,cup:48},WT={oz:1,lb:16};
function kindOf(u){return VOL[u]?'volume':WT[u]?'weight':'count';}
function unitsFor(u){const k=kindOf(u);return k==='volume'?['tsp','tbsp','fl oz','cup']:k==='weight'?['oz','lb']:[u||'each'];}
function convert(q,from,to){if(from===to)return q;const kf=kindOf(from),kt=kindOf(to);if(kf!==kt||kf==='count')return null;const F=kf==='volume'?VOL:WT;return Math.round(q*F[from]/F[to]*10000)/10000;}
const FR=[[0,''],[.125,'⅛'],[.25,'¼'],[1/3,'⅓'],[.5,'½'],[2/3,'⅔'],[.75,'¾'],[1,'']];
function frac(q,steps){const w=Math.floor(q+1e-9);const f=q-w;let best=FR[0],bd=9;for(const x of FR){if(!steps.includes(x[0]))continue;const d=Math.abs(f-x[0]);if(d<bd){bd=d;best=x;}}if(best[0]===1)return {w:w+1,s:'',err:bd};return {w,s:best[1],err:bd};}
function friendlyVol(q,u){const t=convert(q,u,'tsp');if(t==null)return null;const fmt=(v,unit,steps)=>{const r=frac(v,steps);return {txt:`${r.w||''}${r.s}`||'0',unit,err:r.err/Math.max(v,1e-9)};};
  if(t>=12-1e-9){const o=fmt(t/48,'cup',[0,.25,1/3,.5,2/3,.75,1]);if(o.err<=.06)return `${o.txt} cup`;}
  if(t>=3-1e-9){const o=fmt(t/3,'tbsp',[0,.5,1]);if(o.err<=.06)return `${o.txt} tbsp`;}
  const o=fmt(t,'tsp',[0,.125,.25,.5,.75,1]);return `${o.txt} tsp`;}
// Receipt text (WP-numbers). Reads "desc, qty, total, number" lines, paper-style "382147 Desc 1.95 FA" lines,
// and the plain "desc total" form. Weighed items: qty with decimals, or a "(N) 1.82 lb x 0.85/lb" line below.
function parseReceipt(txt){
  const lines=String(txt||'').split(/\r?\n/).map(l=>l.replace(/\t/g,' ').replace(/"/g,'').trim()).filter(Boolean);
  const items=[];let total=null,subtotal=null,tax=0,count=null,date=null,done=false;
  const PAY=/^(AMOUNT DUE|BALANCE|CHANGE|CASH|VISA|MASTERCARD|DEBIT|CREDIT|AMEX|DISCOVER|EBT|TENDER|PAYMENT|AUTH|AID |TVR|IAD|TSI|REF|TRACE|\*)/i;
  const money=s=>Math.round(+s*100)/100;
  for(const raw of lines){const l=raw.replace(/\$\s*/g,'');let m;
    const dm=l.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);if(dm&&!date){let y=+dm[3];if(y<100)y+=2000;date=`${y}-${String(dm[1]).padStart(2,'0')}-${String(dm[2]).padStart(2,'0')}`;}
    if(/^SUB\s*-?\s*TOTAL/i.test(l)){m=l.match(/(-?\d+\.\d{2})\s*$/);if(m)subtotal=+m[1];done=true;continue;}
    if(/^T\s*O\s*T\s*A\s*L\b/i.test(l)){m=l.match(/(-?\d+\.\d{2})\s*$/);if(m)total=+m[1];done=true;continue;}
    if(/taxable|\btax\b/i.test(l)){m=l.match(/(-?\d+\.\d{2})\s*$/);if(m)tax=money(tax+ +m[1]);done=true;continue;}
    if((m=l.match(/^(\d+)\s+ITEMS?\b/i))){count=+m[1];continue;}
    if(PAY.test(l)){done=true;continue;}
    if(done)continue;
    if(/^\((G|T)\)/i.test(l))continue;
    if((m=l.match(/^(?:\(N\)\s*)?(\d+(?:\.\d+)?)\s*lbs?\s*[x@]\s*\$?(\d+\.\d+)/i))){const p=items[items.length-1];if(p){p.qty=+m[1];p.weighed=true;p.perLb=+m[2];}continue;}
    if((m=l.match(/^(\d+)\s*@\s*(\d+\.\d+)/))){const p=items[items.length-1];if(p)p.qty=+m[1];continue;}
    let text,qty=null,amount,num='';
    if((m=l.match(/^(.+?)\s*,\s*(\d+(?:\.\d+)?)?\s*,\s*(-?\d+\.\d{2})\s*(?:,\s*(\d{4,8})?)?\s*$/))){text=m[1];qty=m[2]?+m[2]:null;amount=+m[3];num=m[4]||'';}
    else if((m=l.match(/^(\d{5,8})\s+(.+?)\s+(-?\d+\.\d{2})(?:\s*[A-Z]{1,2})?$/))){num=m[1];text=m[2];amount=+m[3];}
    else if((m=l.match(/^(.+?)[\s,]+(?:(\d+(?:\.\d+)?)[\s,]+)?(-?\d+\.\d{2})(?:\s*[A-Z]{1,2})?$/))){text=m[1];qty=m[2]?+m[2]:null;amount=+m[3];}
    else continue;
    text=String(text).replace(/[,\s]+$/,'').trim();if(!/[a-z]/i.test(text))continue;
    if(amount<0&&items.length){const p=items[items.length-1];p.amount=money(p.amount+amount);p.discount=true;continue;}
    items.push({text,amount,qty,num,weighed:qty!=null&&Math.abs(qty-Math.round(qty))>1e-9});}
  const sum=money(items.reduce((a,x)=>a+x.amount,0));
  return {items,total,subtotal,tax,count,date,sum};}
// Repeated lines of the same product at the same price become one line with a quantity.
function mergeReceipt(items){const out=[],idx={};
  for(const x of items){if(x.weighed||x.discount||x.amount<0){out.push({...x,lines:1});continue;}
    const q=x.qty>0?x.qty:1;const k=(x.num||String(x.text).toUpperCase())+'|'+Math.round(x.amount/q*100);
    if(idx[k]!=null){const o=out[idx[k]];o.qty+=q;o.amount=Math.round((o.amount+x.amount)*100)/100;o.lines++;}
    else{idx[k]=out.length;out.push({...x,qty:q,lines:1});}}
  return out;}
const api={r2,r3,diffD,tripDays,tripBudget,carryOver,STAPLE_STATES,STAPLE_LABEL,stapleState,stapleOnList,packsFor,takeOldest,SALE_RULE,priceAsk,TOKENS,PAIRS,contrast,kindOf,unitsFor,convert,friendlyVol,parseReceipt,mergeReceipt};
if(typeof window!=='undefined')window.MealCore=api;if(typeof module!=='undefined')module.exports=api;
})();
