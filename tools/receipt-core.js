// Receipt reading rules (WP47–WP52). Pure functions shared by the app and the self-test.
(function(){
const r2=x=>Math.round((+x||0)*100)/100;
const CONF=[['8','3'],['8','6'],['8','5'],['8','2'],['8','0'],['1','7'],['5','6'],['9','4']];
const confusable=(a,b)=>CONF.some(([x,y])=>(x===a&&y===b)||(x===b&&y===a));
const norm=s=>String(s||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
function bigrams(s){s=norm(s).replace(/ /g,'');const o=[];for(let i=0;i<s.length-1;i++)o.push(s.slice(i,i+2));return o;}
function sim(a,b){const A=bigrams(a),B=bigrams(b);if(!A.length||!B.length)return 0;const m={};for(const x of B)m[x]=(m[x]||0)+1;let n=0;for(const x of A)if(m[x]){n++;m[x]--;}return 2*n/(A.length+B.length);}

// Name cleaning. Learned entries (user dict) win over the starter dictionary.
const DICT={chkn:'chicken',ckn:'chicken',amer:'american',sngles:'singles',sngls:'singles',glbl:'global',ssnng:'seasoning',blds:'blends',org:'organic',
  sauc:'sauce',bnls:'boneless',sknls:'skinless',wht:'white',whl:'whole',grnd:'ground',chs:'cheese',shrd:'shredded',shreds:'shreds',frz:'frozen',veg:'vegetable',
  btr:'butter',crm:'cream',pnt:'pint',ontheg:'on the go',onthego:'on the go',fp:'',lrw:'',hp:'halves and pieces','h&p':'halves & pieces',bev:'beverage',bkd:'baked',
  pck:'pack',asst:'assorted',choc:'chocolate',strwb:'strawberry',van:'vanilla',mozz:'mozzarella',parm:'parmesan',tom:'tomato',tomatoe:'tomato',pot:'potato'};
const SIZE_RE=/(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|oz|lbs?|kg|g|ml|l|ltr|ct|count|pk|pack)\.?(?=\s|$|[^a-z])/i;
function parseSize(text){const s=String(text||'');let m=s.match(SIZE_RE);let out=null;
  if(m){const v=+m[1];const u=m[2].toLowerCase().replace(/[\s.]/g,'');
    const U={floz:['fl oz',v,'fl oz'],oz:['oz',v,'oz'],lb:['lb',v,'lb'],lbs:['lb',v,'lb'],kg:['kg',v*35.274,'oz'],g:['g',v/28.35,'oz'],ml:['ml',v/29.574,'fl oz'],l:['L',v*33.814,'fl oz'],ltr:['L',v*33.814,'fl oz'],ct:['ct',v,'ct'],count:['ct',v,'ct'],pk:['ct',v,'ct'],pack:['ct',v,'ct']}[u];
    if(U)out={amt:v,unit:U[0],label:U[0]==='ct'?`${v}-count`:`${v} ${U[0]}`,base:{amt:Math.round(U[1]*100)/100,unit:U[2]},rest:(s.slice(0,m.index)+' '+s.slice(m.index+m[0].length)).replace(/\s+/g,' ').trim()};}
  if(!out&&/\bpint\b/i.test(s))out={amt:1,unit:'pint',label:'1 pint',base:{amt:16,unit:'fl oz'},rest:s.replace(/\bpint\b/i,'').replace(/\s+/g,' ').trim()};
  return out;}
function cleanName(text,learned){const L={...DICT,...(learned||{})};const sz=parseSize(text);let s=sz?sz.rest:String(text||'');
  const toks=s.replace(/\s+/g,' ').trim().split(' ').filter(Boolean);const out=[];
  for(const t of toks){const k=t.toLowerCase().replace(/[.,]+$/,'');if(k in L){if(L[k])out.push(L[k]);continue;}
    if(/^[A-Z][a-z]*'[a-z]+$/.test(t)||/^&$/.test(t)){out.push(t);continue;}out.push(/[a-z]/.test(t)||t.length<=2?t.toLowerCase():t.toLowerCase());}
  let n=out.join(' ').replace(/\s+/g,' ').trim();
  n=n.replace(/\bben and jerry's\b/i,"Ben & Jerry's").replace(/\bla croix\b/i,'La Croix').replace(/\bbelle vie\b/i,'Belle Vie');
  return n?n.charAt(0).toUpperCase()+n.slice(1):String(text||'').trim();}
// Learn abbreviation expansions from a printed name and the name a person typed.
function learnNames(printed,typed){const a=String(printed||'').toLowerCase().replace(/[.,]/g,'').split(/\s+/).filter(Boolean),b=String(typed||'').toLowerCase().split(/\s+/).filter(Boolean);const L={};
  if(a.length===b.length)a.forEach((x,i)=>{if(x!==b[i]&&x.length<=6&&b[i].startsWith(x[0]))L[x]=b[i];});return L;}

// Category guess. App categories: Produce, Meat, Dairy & eggs, Bakery & frozen, Pantry, Drinks, Other.
const KW=[['Bakery & frozen','Ice cream',/ice cream|pint|fruit bars|popsicle/],['Drinks','',/la croix|belle vie|seltzer|water|beverage|soda|juice|coffee|cold foam|drink|tea\b/],
  ['Dairy & eggs','',/cheese|cheddar|colby|mozz|yogurt|milk|egg|butter|sour cream|cream cheese|shreds|singles|hummus/],
  ['Meat','',/chicken breast|chicken thigh|sausage|beef|pork|turkey|bacon|ham\b|steak/],
  ['Produce','',/tomato|onion|carrot|potato|avocado|pepper|lettuce|apple|banana|berr|lemon|lime|spinach|harvest|cucumber|broccoli|garlic/],
  ['Pantry','Snacks',/trail mix|cashew|nut|crackers|chips|pretzel|popcorn/],['Pantry','Spices',/seasoning|spice|salt|pepper blend|blends/],
  ['Bakery & frozen','',/bread|bagel|sourdough|tortilla|waffle|bun\b|roll\b|frozen|peas\/corn|peas|muffin/],
  ['Pantry','',/spaghetti|pasta|sauce|oatmeal|oats|rice|syrup|soy|broth|tuna|beans|flour|sugar|oil|vinegar|cereal/]];
function guessGroup(name,known){const n=norm(name);let best=null;for(const k of known||[]){const s=sim(k.name,name);if(s>=.62&&(!best||s>best.s))best={s,cat:k.cat};}
  if(best)return {cat:best.cat,sub:'',from:'similar item'};for(const [cat,sub,re] of KW)if(re.test(n))return {cat,sub,from:'words'};return {cat:'Other',sub:'',from:'none'};}

// Item-number correction against numbers the app already knows. known: Map num → [names].
function fixNum(raw,known,text){const d=String(raw||'').replace(/[^0-9]/g,'');const K=known||new Map();
  if(d.length===6&&K.has(d))return {num:d,ok:true};
  const nameSim=n=>Math.max(0,...(K.get(n)||[]).map(x=>sim(x,text)));const cands=[];
  const oneDiff=s=>{for(const k of K.keys()){if(k.length!==6)continue;let diff=-1,cnt=0;for(let i=0;i<6;i++)if(k[i]!==s[i]){cnt++;diff=i;if(cnt>1)break;}if(cnt===1)cands.push({n:k,conf:confusable(k[diff],s[diff])});}};
  if(d.length===6)oneDiff(d);
  else if(d.length===7){for(let i=0;i<7;i++){const s=d.slice(0,i)+d.slice(i+1);if(K.has(s))cands.push({n:s,conf:true});else oneDiff(s);}}
  else if(d.length===5){for(const k of K.keys())for(let i=0;i<6;i++)if(k.slice(0,i)+k.slice(i+1)===d){cands.push({n:k,conf:true});break;}}
  const seen={};const scored=cands.filter(c=>!seen[c.n]&&(seen[c.n]=1)).map(c=>({...c,s:text?nameSim(c.n):(c.conf?.5:0)})).filter(c=>c.s>=.8||(c.conf&&c.s>=.45)).sort((a,b)=>b.s-a.s);
  if(scored.length&&(scored.length===1||scored[0].s-scored[1].s>=.2))return {num:scored[0].n,ok:true,corrected:true,from:d};
  return {num:d.length===6?d:'',ok:d.length===6,unclear:d.length!==6,raw:d};}

// Find the single price-digit change that makes the lines add up. amounts: printed line totals.
function solveTotal(amounts,target,conf){const sum=r2(amounts.reduce((a,b)=>a+b,0));if(target==null||Math.abs(sum-target)<.005)return null;const hits=[];
  amounts.forEach((a,i)=>{const s=Math.abs(a).toFixed(2);for(let p=0;p<s.length;p++){if(s[p]==='.')continue;for(let dg=0;dg<10;dg++){const c=String(dg);if(c===s[p])continue;
    const ns=s.slice(0,p)+c+s.slice(p+1);const nv=(a<0?-1:1)*+ns;if(Math.abs(r2(sum-a+nv)-target)<.005)hits.push({i,from:a,to:r2(nv),conf:confusable(c,s[p])});}}});
  let list=hits;if(conf){const low=list.filter(h=>(conf[h.i]??100)<70);if(low.length)list=low;}const pick=list.filter(h=>h.conf);if(pick.length)list=pick;return list.length===1?list[0]:null;}

// Line parsing (pasted text or OCR lines). lines: strings or {text, ...meta}.
const ITEM=/^\s*[\(\[]?(\d{5,8})[\)\]]?\s+(.+?)\s+(-?\d{1,4}[.,]\d{2})\s*(-)?\s*([A-Z]{1,2})?\s*$/;
const WEIGHT=/\(N\)\s*([\d.,]+)\s*(lb|oz)\s*[x×@*]\s*\$?([\d.,]+)\s*\/?\s*(lb|oz)?/i;
const DISC=/^(INST\s*SV|INSTANT SAVINGS|SAVINGS|DISCOUNT|COUPON|PRICE REDUCTION)\b.*?(\d+[.,]\d{2})\s*-?/i;
function parseLines(lines,opts){opts=opts||{};const L=(lines||[]).map((x,i)=>typeof x==='string'?{text:x,i}:{...x,i});
  const out={store:null,storeNo:null,date:null,time:null,items:[],subtotal:null,taxes:[],tax:null,total:null,count:null};let inItems=true;
  const head=L.slice(0,8).map(l=>l.text).join(' ');if(/\bALDI\b/i.test(head))out.store='aldi';const sn=head.match(/Store\s*#\s*(\d+)/i);if(sn)out.storeNo=sn[1];
  for(const l of L){const t=String(l.text||'').replace(/\s+/g,' ').trim();if(!t)continue;let m;
    const dm=t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b(?:\s+(\d{1,2}:\d{2}))?/);if(dm&&!out.date){let y=+dm[3];if(y<100)y+=2000;out.date=`${y}-${String(dm[1]).padStart(2,'0')}-${String(dm[2]).padStart(2,'0')}`;if(dm[4])out.time=dm[4];}
    if(/^SUB\s*-?\s*TOTAL/i.test(t)){m=t.match(/(\d+[.,]\d{2})\s*$/);if(m)out.subtotal=+m[1].replace(',','.');inItems=false;continue;}
    if((m=t.match(/^([A-Z8])\s*-?\s*Tax\w*\b(.*?)(\d+[.,]\d{2})\s*$/i))){const rt=(m[2].match(/([\d.,]+)\s*%/)||[])[1];out.taxes.push({code:m[1].toUpperCase(),rate:rt?+rt.replace(',','.'):null,amount:+m[3].replace(',','.')});continue;}
    if(/^T\s*O\s*T\s*A\s*L\b/i.test(t)||/^TOTAL\b/i.test(t)){m=t.match(/(\d+[.,]\d{2})\s*$/);if(m)out.total=+m[1].replace(',','.');inItems=false;continue;}
    if(/^AMOUNT\s*DUE/i.test(t)){m=t.match(/(\d+[.,]\d{2})\s*$/);if(m&&out.total==null)out.total=+m[1].replace(',','.');continue;}
    if((m=t.match(/^(\d{1,3})\s+ITEMS?\b/i))){out.count=+m[1];continue;}
    if(!inItems)continue;
    if((m=t.match(WEIGHT))){const p=out.items[out.items.length-1];if(p){p.weighed=true;p.wt=+m[1].replace(',','.');p.wtUnit=m[2].toLowerCase();p.unitP=+m[3].replace(',','.');p.lines.push(l.i);}continue;}
    if(/^\((G|T)\)/i.test(t))continue;
    if((m=t.match(DISC))){const p=out.items[out.items.length-1];if(p){p.disc=r2((p.disc||0)+(+m[2].replace(',','.')));p.lines.push(l.i);}continue;}
    if((m=t.match(ITEM))){const amt=(m[4]?-1:1)*+m[3].replace(',','.');const it={num:m[1],text:m[2].trim(),amount:r2(amt),qty:1,tax:m[5]||'',lines:[l.i],conf:{num:l.numConf??100,name:l.nameConf??100,price:l.priceConf??100},meta:l.meta||null};
      if(opts.known){const f=fixNum(it.num,opts.known,it.text);if(f.corrected){it.from=it.num;it.num=f.num;it.corrected=true;}else if(!f.ok){it.unclear=true;it.raw=it.num;it.num='';}}
      out.items.push(it);continue;}}
  out.tax=out.taxes.length?r2(out.taxes.reduce((a,x)=>a+x.amount,0)):null;if(out.total!=null&&out.subtotal!=null&&(out.tax==null||Math.abs(out.subtotal+out.tax-out.total)>.005)&&out.total>=out.subtotal)out.tax=r2(out.total-out.subtotal);
  return out;}
// Repeated identical lines (same number and price) become one row with a count.
function groupItems(items){const out=[];const at={};for(const x of items){if(x.weighed||x.disc||!x.num){out.push({...x,printed:[x.amount]});continue;}const k=x.num+'|'+x.amount;
  if(k in at){const g=out[at[k]];g.qty+=1;g.amount=r2(g.amount+x.amount);g.printed.push(x.amount);g.lines=[...g.lines,...x.lines];g.conf={num:Math.max(g.conf.num,x.conf.num),name:Math.max(g.conf.name,x.conf.name),price:Math.max(g.conf.price,x.conf.price)};if(x.corrected&&!g.from)g.from=x.from;}
  else{at[k]=out.length;out.push({...x,printed:[x.amount]});}}
  return out.map(x=>({...x,unitP:x.weighed?x.unitP:r2(x.amount/(x.qty||1))}));}
// Items bought: repeated lines count each, weighed lines count once.
const itemCount=items=>items.reduce((a,x)=>a+(x.weighed?1:(x.qty||1)),0);
// Join two photos of one receipt by the lines they share at the seam.
function stitch(a,b){const same=(x,y)=>x.num&&x.num===y.num&&Math.abs(x.amount-y.amount)<.005;
  for(let k=Math.min(a.length,b.length);k>=1;k--){let ok=true;for(let j=0;j<k;j++)if(!same(a[a.length-k+j],b[j])){ok=false;break;}if(ok)return {items:[...a,...b.slice(k)],overlap:true,dropped:k};}
  return {items:[...a,...b],overlap:false,dropped:0};}
// Gaps in OCR line positions where a line may have been lost. ys: [{i,y0,y1}] for item lines in order.
function findGaps(ys){if(ys.length<4)return [];const h=ys.map(y=>y.y1-y.y0).sort((a,b)=>a-b)[Math.floor(ys.length/2)];const steps=[];for(let k=1;k<ys.length;k++)steps.push(ys[k].y0-ys[k-1].y0);
  const med=[...steps].sort((a,b)=>a-b)[Math.floor(steps.length/2)]||h;const out=[];for(let k=1;k<ys.length;k++){const st=ys[k].y0-ys[k-1].y0;if(st>med*1.7)out.push({after:k-1,y0:ys[k-1].y1,y1:ys[k].y0,missing:Math.max(1,Math.round(st/med)-1)});}return out;}
// Price change against the usual price: quiet (within 8%), drop (default sale), rise (default new price).
function classifyPrice(paid,usual,disc){if(disc)return 'sale';if(!(usual>0))return 'new';const d=(paid-usual)/usual;if(Math.abs(d)<.08)return 'quiet';return d<0?'drop':'rise';}

// Ground truth for the 10/10 receipt (no card, cashier or address details).
const F1010={store:'aldi',storeNo:'69',date:'2026-10-10',time:'14:59',subtotal:137.25,tax:0.14,total:137.39,count:49,
  rows:[[382745,'FP Chicken Breasts',1,10.47,'A'],[343566,'Clubhouse Crackers',1,2.99,'A'],[700679,'Sour Fruit Bars',1,3.49,'A'],[399573,'Spaghetti',1,1.89,'A'],[383324,'Flour Tortillas',1,1.95,'A'],
  [401280,'Organic Peas/Corn',2,3.18,'A'],[382352,'OnTheGo Trail Mix',1,3.85,'A'],[343187,'Instant Oatmeal',1,1.85,'A'],[494042,"Ben & Jerry's Pint",1,4.85,'A'],[402246,'Bagel Seasoning',1,1.79,'A'],
  [382221,'Crushed Tomatoes',1,1.55,'A'],[382644,'Soy Sauce',1,1.65,'A'],[405206,'Ice Cream',1,2.95,'A'],[356525,'Carrots',1,1.99,'A'],[356386,'Green Onions',1,1.39,'A'],[683393,'Summer Sausage',1,3.99,'A'],
  [382722,'Amer Cheese Sngles',1,1.85,'A'],[458285,'Cashews H&P 12 oz.',1,4.89,'A'],[713656,'Glbl Ssnng Blds',1,2.69,'A'],[201287,'Chunk Tuna Water',2,1.90,'A'],[383412,'Mild Cheddar',1,1.75,'A'],
  [371471,'Pure Maple Syrup',1,5.29,'A'],[555281,'Organic Rice 32oz',1,4.29,'A'],[656680,'Caramel Waffles',1,2.99,'A'],[382478,'Colby Jack Shreds',1,2.79,'A'],[420772,'Barista Cold Foams',1,3.49,'A'],
  [343827,'Assorted Hummus',1,2.59,'A'],[356408,'Baking Potato',1,3.69,'A'],[356615,'Roma Tomatoes LRW',{wt:1.54,unitP:.85},1.31,'A'],[356490,'Bagged Avocados',1,2.89,'A'],[356427,'Multi-Peppers 3pk.',1,2.69,'A'],
  [760671,'Seasonal Harvest',1,3.99,'A'],[343277,'Organic Chkn Broth',2,3.78,'A'],[384942,'Premium Pasta Sauc',1,3.99,'A'],[733566,'15G Yogurt Drink',6,11.82,'A'],[382589,'Sliced Sourdough',1,3.49,'A'],
  [751918,'Asiago Bagels',1,4.19,'A'],[575034,'La Croix 12pk',1,5.49,'A'],[575097,'Belle Vie 12pk',1,3.99,'A'],[387258,'Flavored Beverage',1,0.79,'B'],[591653,'Flavored Water 1L',1,0.79,'B']],
  misreads:[['401230','401280'],['362589','382589'],['751912','751918'],['357258','387258'],['4384042','494042']]};
// The 10/10 receipt as printed text, in the paper layout.
function fixtureText(F,drop){const L=['ALDI','Store #'+F.storeNo,'Address withheld'];let n=0;
  for(const [num,txt,q,tot,tx] of F.rows){const w=typeof q==='object';const k=w?1:q;for(let i=0;i<k;i++){n++;if(drop&&drop===n)continue;L.push(`${num} ${txt} ${(tot/k).toFixed(2)} F${tx}`);}
    if(w){L.push(`(G) ${(q.wt+.01).toFixed(2)}lb - (T) 0.01lb`);L.push(`(N) ${q.wt} lb x ${q.unitP.toFixed(2)}/lb`);}}
  L.push(F.total.toFixed(2),'Discover','****1425 ONLINE',`10/10/26 ${F.time} Ref/Seq # 000000`,'++APPROVED++',`SUBTOTAL ${F.subtotal.toFixed(2)}`,`B-Taxable @9.025% ${F.tax.toFixed(2)}`,'A-Taxable @0.00% 0.00',`AMOUNT DUE ${F.total.toFixed(2)}`,`T O T A L $ ${F.total.toFixed(2)}`,`${F.count} ITEMS`);
  return L.join('\n');}

window.ReceiptCore={sim,cleanName,learnNames,parseSize,guessGroup,fixNum,solveTotal,parseLines,groupItems,itemCount,stitch,findGaps,classifyPrice,confusable,F1010,fixtureText,r2};
})();
