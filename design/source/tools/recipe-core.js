// Recipe import rules (window.RecipeCore). Pure functions shared by the app and the self-test.
// A web recipe comes in as a schema.org Recipe block (fetched by the sheet script, recipe.fetch), as page text,
// or as pasted lines. Each ingredient line is split into amount, unit, item and notes, matched to a catalog item
// with the same matcher the receipt screen uses (the app passes it in), and turned into that item's unit.
(function(){
const MC=()=>(typeof window!=='undefined'&&window.MealCore)||null;
const r3=n=>Math.round(n*1000)/1000;
const norm=s=>String(s||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();

// ---------- text ----------
const ENT={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',frac12:'½',frac14:'¼',frac34:'¾',frac13:'⅓',frac23:'⅔',frac18:'⅛',deg:'°',ndash:'–',mdash:'—',rsquo:"'",lsquo:"'",rdquo:'"',ldquo:'"',eacute:'é',egrave:'è',ntilde:'ñ',hellip:'…'};
function decode(s){return String(s==null?'':s).replace(/<[^>]*>/g,' ').replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi,(m,e)=>{
  if(e[0]==='#'){const c=e[1]==='x'||e[1]==='X'?parseInt(e.slice(2),16):+e.slice(1);return c?String.fromCodePoint(c):m;}return ENT[e.toLowerCase()]??m;}).replace(/\s+/g,' ').trim();}

// ---------- amounts ----------
const UF={'½':.5,'¼':.25,'¾':.75,'⅓':1/3,'⅔':2/3,'⅛':.125,'⅜':.375,'⅝':.625,'⅞':.875,'⅕':.2,'⅖':.4,'⅗':.6,'⅘':.8,'⅙':1/6,'⅚':5/6};
const UFC=Object.keys(UF).join('');
const WORDN={a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,dozen:12,half:.5};
const N1=`(?:\\d+\\s*[${UFC}]|\\d+\\s+\\d+\\s*\\/\\s*\\d+|\\d+\\s*\\/\\s*\\d+|\\d*\\.\\d+|\\d+|[${UFC}])`;
const QTY_RE=new RegExp(`^(${N1})(?:\\s*(?:-|–|—|to|or)\\s*(${N1}))?`,'i');
function num1(s){s=String(s).replace(/\s+/g,' ').trim();let m;
  if((m=s.match(new RegExp(`^(\\d+)\\s*([${UFC}])$`))))return +m[1]+UF[m[2]];
  if((m=s.match(/^(\d+) (\d+) ?\/ ?(\d+)$/)))return +m[1]+ +m[2]/+m[3];
  if((m=s.match(/^(\d+) ?\/ ?(\d+)$/)))return +m[2]?+m[1]/+m[2]:null;
  if(UF[s]!=null)return UF[s];const v=parseFloat(s);return isNaN(v)?null:v;}
// Reads the amount at the start of s. A range ("1 to 2", "6-8") counts as its middle, like the catalog recipes.
function readQty(s){s=String(s||'');const m=s.match(QTY_RE);
  if(m){const a=num1(m[1]),b=m[2]?num1(m[2]):null;if(a!=null)return {q:b!=null&&b>a?(a+b)/2:a,range:b!=null&&b>a,len:m[0].length};}
  const w=s.match(/^(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half)\b(?:\s+(?:dozen)\b)?/i);
  if(w){let q=WORDN[w[1].toLowerCase()];if(/dozen/i.test(w[0]))q*=12;return {q,range:false,len:w[0].length,word:true};}
  return null;}

// ---------- units ----------
// Recipe spellings -> one name. Weight and volume names are the ones MealCore.convert knows, plus metric.
const UNIT_WORDS=[
  ['tsp',/^(teaspoons?|tsps?\.?)$/],['tbsp',/^(tablespoons?|tbsps?\.?|tbs\.?|tbl\.?)$/],['cup',/^(cups?|c\.)$/],['fl oz',/^(fl\.? ?oz\.?|fluid ounces?)$/],
  ['oz',/^(ounces?|oz\.?)$/],['lb',/^(pounds?|lbs?\.?)$/],['g',/^(grams?|g|gr)$/],['kg',/^(kilograms?|kgs?|kilos?)$/],['ml',/^(milliliters?|millilitres?|ml|mls)$/],
  ['l',/^(liters?|litres?|l)$/],['pint',/^(pints?|pts?\.?)$/],['quart',/^(quarts?|qts?\.?)$/],['gallon',/^(gallons?|gal\.?)$/],
  ['pinch',/^(pinch(es)?)$/],['dash',/^(dash(es)?)$/],['clove',/^(cloves?)$/],['can',/^(cans?|tins?)$/],['jar',/^(jars?)$/],['bottle',/^(bottles?)$/],
  ['pack',/^(packages?|pkgs?\.?|packets?|packs?|boxes|box|bags?|envelopes?|containers?|tubs?|cartons?|blocks?)$/],['bunch',/^(bunch(es)?)$/],['stick',/^(sticks?)$/],
  ['slice',/^(slices?)$/],['head',/^(heads?)$/],['sprig',/^(sprigs?)$/],['stalk',/^(stalks?|ribs?)$/],['handful',/^(handfuls?)$/],['piece',/^(pieces?)$/],['each',/^(whole|each)$/]];
function unitOf(w){const k=String(w||'').toLowerCase();for(const [u,re] of UNIT_WORDS)if(re.test(k))return u;return null;}
// Metric and large sizes become units MealCore converts: weight in oz, volume in cups/tsp.
const TO_MC={g:[1/28.3495,'oz'],kg:[35.274,'oz'],ml:[1/4.92892,'tsp'],l:[202.884,'tsp'],pint:[2,'cup'],quart:[4,'cup'],gallon:[16,'cup'],pinch:[1/16,'tsp'],dash:[1/8,'tsp'],stick:null};
function toMC(q,u){const t=TO_MC[u];return t?{q:q*t[0],unit:t[1]}:{q,unit:u};}
const EACH=new Set(['each','piece','head']);
const COUNTY=new Set(['each','clove','can','jar','bottle','pack','bunch','slice','head','sprig','stalk','piece','stick']);

// ---------- one ingredient line ----------
const PREP=['chopped','finely chopped','roughly chopped','coarsely chopped','diced','finely diced','minced','sliced','thinly sliced','crushed','rinsed','drained','rinsed and drained','drained and rinsed',
  'peeled','seeded','softened','melted','cubed','halved','quartered','trimmed','beaten','lightly beaten','divided','packed','firmly packed','sifted','at room temperature','room temperature','cooked','uncooked',
  'thawed','julienned','torn','cut into chunks','cut into pieces','to taste','for serving','for garnish','or to taste','plus more','plus more to taste','as needed','if needed'];
const PREP_RE=new RegExp(`\\b(${PREP.sort((a,b)=>b.length-a.length).map(p=>p.replace(/ /g,'\\s+')).join('|')})\\b`,'gi');
const SIZE_ADJ=/^(large|medium|small|extra[- ]large|jumbo|heaping|level|scant|generous|big)\s+/i;
// Pantry basics: never bought for a recipe, never matched to an item, never on the list.
const BASIC_RE=/^(?:(?:kosher|sea|table|fine|flaky|coarse)\s+)?salt(?:\s+and\s+(?:freshly\s+)?(?:ground\s+)?(?:black\s+)?pepper)?$|^(?:freshly\s+|fresh\s+)?(?:ground\s+|cracked\s+)?(?:black\s+)?pepper$|^(?:salt|pepper)\s+(?:and|&)\s+(?:salt|pepper)$|^(?:(?:hot|cold|warm|boiling|ice|lukewarm|tap|filtered)\s+)?water$|^ice(?:\s+cubes)?$/i;
function isBasic(item){return BASIC_RE.test(String(item||'').replace(/[.,;:]+$/,'').trim());}
const AMT_PAREN=new RegExp(`(${N1})\\s*(?:-\\s*)?([a-z]+(?:\\s?oz)?)\\.?`,'gi');
function parenAmts(s){const out=[];let m;AMT_PAREN.lastIndex=0;while((m=AMT_PAREN.exec(s))){const u=unitOf(m[2].replace(/\s+/g,' '))||unitOf(m[2]);const q=num1(m[1]);if(u&&q!=null)out.push({q,unit:u});}return out;}

function parseLine(raw){
  let t=decode(raw).replace(/^[\s•●▪▢☐□*·–—-]+/,'').replace(/\s+/g,' ').trim();const text=t;const notes=[];let optional=false;
  if(/^optional\s*:\s*/i.test(t)){optional=true;t=t.replace(/^optional\s*:\s*/i,'');}
  if(/\(\s*optional\s*\)|,?\s*\boptional\b/i.test(t)){optional=true;t=t.replace(/\(\s*optional\s*\)|,?\s*\boptional\b/ig,' ').replace(/\s+/g,' ').trim();}
  let q=null,range=false;const rq=readQty(t);if(rq){q=rq.q;range=rq.range;t=t.slice(rq.len).trim();}
  let size=null;const alts=[];
  // "1 (15 oz) can", "1 (15-ounce) can", "2 15-oz cans"
  let m=t.match(/^\(([^)]*)\)\s*/);if(m){const a=parenAmts(m[1]);if(a.length)size=a[0];else notes.push(m[1].trim());t=t.slice(m[0].length);}
  if(!size&&(m=t.match(new RegExp(`^(${N1})\\s*-?\\s*(ounces?|oz|pounds?|lbs?|grams?|g|ml|fl\\.? ?oz)\\.?\\s+(?=[a-z])`,'i')))){const u=unitOf(m[2].replace(/\s+/g,' '));if(u&&COUNTY.has(unitOf(t.slice(m[0].length).split(/\s+/)[0])||'')){size={q:num1(m[1]),unit:u};t=t.slice(m[0].length);}}
  let unit=null;if(q!=null||rq==null){m=t.match(/^(fl\.?\s?oz\.?|fluid ounces?|[a-z]+\.?)(?=\s|$|,)/i);if(m){const u=unitOf(m[1].replace(/\s+/g,' '));if(u){unit=u;t=t.slice(m[0].length).trim();}}}
  if(q==null&&unit){q=1;}
  t=t.replace(/^of\s+/i,'');
  let sa;while((sa=t.match(SIZE_ADJ))){notes.push(sa[1].toLowerCase());t=t.slice(sa[0].length);}
  // A size after the unit: "1 can (15 oz) black beans"
  // (for a weight or volume, a second way of saying the amount: "½ kg (1.1 lbs) chicken")
  if((m=t.match(/^\(([^)]*)\)\s*/))){const a=parenAmts(m[1]);if(a.length&&!size&&(unit==null||COUNTY.has(unit)))size=a[0];else if(a.length)alts.push(...a);else notes.push(m[1].trim());t=t.slice(m[0].length);}
  // Everything after the first comma is notes; parentheses are notes too, and may hold a second amount.
  let item=t,rest='';const ci=t.indexOf(',');if(ci>=0){item=t.slice(0,ci);rest=t.slice(ci+1).trim();}
  item=item.replace(/\(([^)]*)\)/g,(x,inner)=>{const a=parenAmts(inner);if(a.length)alts.push(...a);else notes.push(inner.trim());return ' ';});
  rest=rest.replace(/\(([^)]*)\)/g,(x,inner)=>{const a=parenAmts(inner);if(a.length)alts.push(...a);return ' '+inner+' ';});
  const full=item.replace(/\s+/g,' ').replace(/^[\s,;-]+|[\s,;.-]+$/g,'').trim();
  item=item.replace(PREP_RE,x=>{notes.push(x.toLowerCase());return ' ';}).replace(/\s+(or|and)\s*$/i,'').replace(/\s+/g,' ').replace(/^[\s,;-]+|[\s,;.-]+$/g,'').trim();
  if(rest)notes.push(rest.replace(/\s+/g,' ').trim());
  const note=notes.filter(Boolean).join(', ');
  if(/\bto taste\b/i.test(text)&&q==null)notes.push('to taste');
  return {text,q:q==null?null:r3(q),range,unit,size,alts,item,full:full!==item?full:'',notes:note,optional,basic:isBasic(item)||(q==null&&isBasic(item.replace(/\s+to taste$/i,'')))};}

// ---------- matching ----------
const FORMS=new Set(['powder','paste','flake','sauce','juice','seed','oil','extract','dried','salt','stick','chip','spread','soup','mix','seasoning','syrup','jam','puree','vinegar','sprout']);
const KINDS=new Set(['green','diced','crushed','whipped','grape','cherry','sun','ground','frozen','canned','smoked','roasted','sweetened','condensed','evaporated','dark','light','instant','baby','red','white','purple','powdered','brown','block']);
const sing=s=>norm(s).split(' ').map(w=>w.length>3&&/(oes|ches|shes|sses|xes)$/.test(w)?w.slice(0,-2):w.length>3&&/[^s]s$/.test(w)?w.slice(0,-1):w).join(' ');
// opts.fuzzy(text) -> [{p,sc}] sorted best first: the app passes its receipt matcher (fuzzy over name and Aldi name).
// opts.learned: {normalized text: item id} from earlier picks; opts.alias(text) -> item id or null.
// Same acceptance rule as receipts: score .7 or more and .08 clear of the next.
function matchLine(p,opts){opts=opts||{};const key=norm(p.item);if(!key)return {iid:null,how:'none',sc:0,cands:[]};
  const L=opts.learned||{};if(L[key])return {iid:L[key],how:'learned',sc:1,cands:[]};
  const a=opts.alias?opts.alias(p.item):null;if(a)return {iid:a,how:'alias',sc:1,cands:[]};
  // Recipe-side ranking on top of the shared matcher: an item named exactly like the line wins, and an item whose
  // name adds a form or kind the line doesn't ask for (powder, paste; green, diced) drops back ("1 onion" is not onion powder).
  const rank=(fz,t)=>{const tw=new Set(sing(t).split(' '));return fz.map(x=>{const nm=sing(x.p.name);let sc=x.sc;if(nm===sing(t))sc+=.2;
    for(const w of nm.split(' '))if(!tw.has(w))sc-=FORMS.has(w)?.3:KINDS.has(w)?.15:0;return {...x,sc};}).sort((a,b)=>b.sc-a.sc);};
  // The words before prep notes come first ("diced tomatoes" is the canned item, "tomatoes" the fresh one).
  const ok=fz=>fz[0]&&fz[0].sc>=.7&&(!fz[1]||fz[0].sc-fz[1].sc>=.08||fz[1].p.id===fz[0].p.id);let last=[];
  for(const t of [p.full,p.item].filter(Boolean)){const fz=rank((opts.fuzzy?opts.fuzzy(t):[])||[],t);if(!last.length)last=fz;
    if(ok(fz))return {iid:fz[0].p.id,how:'guess',sc:fz[0].sc,cands:fz.slice(0,4).map(x=>({iid:x.p.id,sc:x.sc}))};}
  return {iid:null,how:'none',sc:last[0]?last[0].sc:0,cands:last.slice(0,4).map(x=>({iid:x.p.id,sc:x.sc}))};}

// The line's amount in the item's unit, for the whole recipe. Tries the main amount, then any amount in
// parentheses, then count x size ("2 (15 oz) cans" for an item sold by the ounce).
function amountFor(p,item){const u=item&&item.unit;if(!u)return {q:null,why:'no item'};const M=MC();
  if(p.q==null)return {q:null,why:'no amount'};
  const tries=[{q:p.q,unit:p.unit},...(p.alts||[]).map(a=>({q:a.q,unit:a.unit}))];
  if(p.size&&(p.unit==null||COUNTY.has(p.unit)))tries.push({q:p.q*p.size.q,unit:p.size.unit});
  for(const c of tries){const cu=c.unit||'each';
    if(cu===u)return {q:r3(c.q),from:cu};
    if(EACH.has(cu)&&EACH.has(u))return {q:r3(c.q),from:cu};
    const n=toMC(c.q,cu);if(n.unit===u)return {q:r3(n.q),from:cu};
    if(M&&M.convert){const v=M.convert(n.q,n.unit,u);if(v!=null)return {q:r3(v),from:cu};}}
  return {q:null,why:`${fmtAmt(p)} can't be turned into ${u}`};}
function fmtAmt(p){const q=p.q==null?'':String(+p.q.toFixed(2));return [q,p.unit&&p.unit!=='each'?p.unit:''].filter(Boolean).join(' ')||'this amount';}

// ---------- recipe blocks (schema.org) ----------
function isRecipe(n){const t=n&&n['@type'];return Array.isArray(t)?t.some(x=>/^(schema:)?Recipe$/i.test(x)):/^(schema:)?Recipe$/i.test(String(t||''));}
function findRecipe(blocks){const seen=new Set();let hit=null;
  const walk=n=>{if(hit||!n||typeof n!=='object'||seen.has(n))return;seen.add(n);if(Array.isArray(n)){n.forEach(walk);return;}
    if(isRecipe(n)){hit=n;return;}for(const k of ['@graph','mainEntity','mainEntityOfPage','itemListElement','item','hasPart'])if(n[k])walk(n[k]);};
  for(const b of [].concat(blocks||[])){let o=b;if(typeof b==='string'){try{o=JSON.parse(b.replace(/^\s*<!--|-->\s*$/g,''));}catch(e){continue;}}walk(o);if(hit)break;}
  return hit;}
// ISO 8601 durations (PT1H30M, P0DT45M) to minutes.
function minutes(d){const m=String(d||'').match(/^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:\d+(?:\.\d+)?S)?)?$/i);if(!m)return null;
  const v=(+m[1]||0)*1440+(+m[2]||0)*60+(+m[3]||0);return v>0?Math.round(v):null;}
function servings(y){for(const v of [].concat(y==null?[]:y)){const m=String(v).match(/\d+/);if(m&&+m[0]>0)return Math.min(24,+m[0]);}return null;}
const txt=v=>Array.isArray(v)?v.map(txt).join(', '):v&&typeof v==='object'?(v.name||v.text||''):decode(v);
function ingList(n){const v=n.recipeIngredient||n.ingredients||[];return [].concat(v).flatMap(x=>typeof x==='string'?[x]:x&&x.text?[x.text]:[]).map(decode).filter(Boolean);}
const MEAL_WORDS=[['breakfast',/breakfast|brunch/],['lunch',/lunch|sandwich|salad/],['snack',/snack|appetizer|dessert|side|drink|beverage|baking|cookie|bread/],['dinner',/dinner|main|entr[eé]e|supper|soup|stew/]];
const CUISINES=['asian','chinese','japanese','korean','indian','mexican','ecuadorian','southern','mediterranean'];
function guessMeta(n){const cat=norm(txt(n.recipeCategory)),cui=norm(txt(n.recipeCuisine)),kw=norm(txt(n.keywords)+' '+txt(n.name));
  let meal='dinner';for(const [m,re] of MEAL_WORDS)if(re.test(cat)){meal=m;break;}
  const tags=CUISINES.filter(c=>cui.includes(c)||(c==='mexican'&&/tex mex|tex-mex/.test(cui)));
  const noCook=/\bno (cook|bake)\b/.test(kw);if(noCook)tags.push('nocook');
  else if(/\b(bake|baked|roast|roasted|sheet pan|casserole|oven)\b/.test(kw))tags.push('oven');else if(/\b(stir fry|skillet|one pot|one pan|stovetop|saute)\b/.test(kw))tags.push('stovetop');
  if(/\b(spicy|chipotle|jalapeno|sriracha|curry)\b/.test(kw))tags.push('spicy');
  return {meal,tags:[...new Set(tags)]};}
function fromSchema(n,url){if(!n)return null;const tot=minutes(n.totalTime)||((minutes(n.prepTime)||0)+(minutes(n.cookTime)||0))||null;const g=guessMeta(n);
  // Link only: the photo (n.image) is not kept, so backups stay small.
  return {name:decode(txt(n.name)).slice(0,120),serv:servings(n.recipeYield||n.yield),total:tot,hands:minutes(n.prepTime),ings:ingList(n),link:String(url||n.url||'').trim(),meal:g.meal,tags:g.tags};}

// ---------- page text and pasted lines ----------
const LOOKS_ING=new RegExp(`^\\s*(?:[•▢☐*-]\\s*)?(?:${N1}|(?:a|an|one|two|three|four|half)\\s+(?:cups?|tablespoons?|teaspoons?|pinch|handful|can|clove|bunch|pound|lb|large|medium|small)\\b)`,'i');
function looksLikeIngredient(l){const s=String(l||'').trim();return s.length>=3&&s.length<=140&&LOOKS_ING.test(s)&&!/^\d+\s*(?:minutes?|mins?|hours?|hrs?|servings?|calories|kcal|people|reviews?|ratings?|comments?|stars?|photos?)\b/i.test(s)&&!/^\d+[.)]\s/.test(s);}
// Page text (no recipe block): one row per line, with the likely ingredient lines picked.
function pageLines(text){const out=[];const seen=new Set();for(const l of String(text||'').split(/\r?\n/)){const s=decode(l);if(!s||s.length>300||seen.has(s))continue;seen.add(s);out.push({text:s,pick:looksLikeIngredient(s)});}return out.slice(0,400);}
// Pasted ingredients: every line except headings ("Ingredients", "For the sauce:") and blank ones.
function pasteLines(text){return String(text||'').split(/\r?\n/).map(decode).filter(s=>s&&!/^(ingredients?|for the [^:]{1,40}|[a-z ]{1,30}):?$/i.test(s)&&!/:$/.test(s));}

// ---------- the whole import ----------
// Builds editor rows from ingredient lines. Basics (salt, pepper, water) are kept apart.
function build(lines,opts){opts=opts||{};const P=opts.P||{};const rows=[],basics=[];
  for(const l of lines||[]){const p=parseLine(l);if(!p.item&&p.q==null)continue;if(p.basic){basics.push(p.text);continue;}
    const m=matchLine(p,opts);const it=m.iid?P[m.iid]:null;const a=it?amountFor(p,it):{q:null,why:'no item'};
    rows.push({text:p.text,item:p.item,notes:p.notes,optional:p.optional,parsed:p,iid:it?m.iid:null,how:it?m.how:'none',sc:m.sc,cands:m.cands,q:a.q,why:a.q==null?a.why:'',state:!it?'unmatched':a.q==null?'amount':'ok'});}
  return {rows,basics};}
// What the household's portions cost: proportional to the package, staples not counted (as in the editor).
function cost(rows,P,serv,people){serv=Math.max(1,+serv||1);let whole=0;for(const r of rows||[]){const p=r.iid&&P[r.iid];if(!p||!(r.q>0)||p.staple||r.optional)continue;whole+=r.q*(+p.price||0)/(+p.pkg||1);}
  const portions=Math.max(1,Math.round(+people||serv));return {whole:Math.round(whole*100)/100,household:Math.round(whole*portions/serv*100)/100,portions};}

const api={decode,readQty,unitOf,parseLine,isBasic,matchLine,amountFor,findRecipe,fromSchema,minutes,servings,guessMeta,pageLines,pasteLines,looksLikeIngredient,build,cost,norm};
if(typeof window!=='undefined')window.RecipeCore=api;if(typeof module!=='undefined')module.exports=api;
})();
