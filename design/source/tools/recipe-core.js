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
  ['slice',/^(slices?)$/],['head',/^(heads?)$/],['sprig',/^(sprigs?)$/],['stalk',/^(stalks?|ribs?)$/],['handful',/^(handfuls?)$/],['piece',/^(pieces?)$/],['inch',/^(inch(es)?|in\.)$/],['each',/^(whole|each)$/]];
function unitOf(w){const k=String(w||'').toLowerCase();for(const [u,re] of UNIT_WORDS)if(re.test(k))return u;return null;}
// Metric and large sizes become units MealCore converts: weight in oz, volume in cups/tsp.
const TO_MC={g:[1/28.3495,'oz'],kg:[35.274,'oz'],ml:[1/4.92892,'tsp'],l:[202.884,'tsp'],pint:[2,'cup'],quart:[4,'cup'],gallon:[16,'cup'],pinch:[1/16,'tsp'],dash:[1/8,'tsp'],stick:null};
function toMC(q,u){const t=TO_MC[u];return t?{q:q*t[0],unit:t[1]}:{q,unit:u};}
const EACH=new Set(['each','piece','head']);
// A piece measured in inches (ginger, cinnamon) is one piece.
const INCHY=new Set(['inch']);
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
// Parentheses, nested or not closed ("((tej patta, optional))", "( (or ¼ tsp ground"), come out whole: the text
// without them, and each top-level group's inside with any inner parentheses dropped.
function pullParens(s){let out='',cur='',depth=0;const groups=[];
  for(const ch of String(s)){if(ch==='('){if(depth===0)cur='';else cur+=' ';depth++;continue;}
    if(ch===')'){if(depth===0)continue;depth--;if(depth===0){groups.push(cur);out+=' ';}else cur+=' ';continue;}
    if(depth>0)cur+=ch;else out+=ch;}
  if(depth>0&&cur.trim())groups.push(cur);
  return {rest:out.replace(/\s+/g,' ').trim(),groups:groups.map(g=>g.replace(/\s+/g,' ').replace(/^[\s,;]+|[\s,;]+$/g,'').trim()).filter(Boolean)};}
// "130 grams", "about 4 oz", "≈1 clove", "9 to 10 oz": an amount and nothing else.
function amountOnly(seg){const s=String(seg||'').replace(/^(?:about|approx\.?|approximately|roughly|around|~|≈)\s*/i,'').trim();const rq=readQty(s);if(!rq||rq.word)return null;
  const rest=s.slice(rq.len).trim();const m=rest.match(/^(fl\.?\s?oz\.?|fluid ounces?|[a-z]+\.?)\s*(?:each)?$/i);const u=m&&unitOf(m[1].replace(/\s+/g,' '));return u?{q:rq.q,unit:u}:null;}
// The pieces of a parenthesis: amount-only pieces are other ways of saying the amount; "or ..." pieces are
// alternatives and never count; anything else is a note.
function readGroup(g){const amts=[],notes=[];for(const seg of g.split(/\s*[,;]\s*/)){const x=seg.trim();if(!x)continue;
    if(/^or\b|^use\b|^skip\b|^read\b/i.test(x)){notes.push(x);continue;}const a=amountOnly(x);if(a)amts.push(a);else notes.push(x);}
  return {amts,notes};}
// A count word at the end of the item ("garlic cloves", "cinnamon piece") is the unit when the line had none.
const TAIL_UNIT=/\s+(cloves?|pieces?|sprigs?|stalks?|inch(?:es)?)$/i;

function parseLine(raw){
  // Recipe plugins often wrap a note that already has parentheses in a second pair: "((tej patta, optional))".
  let t=decode(raw).replace(/^[\s•●▪▢☐□*·–—-]+/,'').replace(/\(\s*\(/g,'(').replace(/\)\s*\)/g,')').replace(/\s+/g,' ').trim();const text=t;const notes=[];let optional=false;
  if(/\boptional\b/i.test(t)){optional=true;t=t.replace(/^optional\s*:\s*/i,'').replace(/[,;]?\s*\boptional\b\s*:?/ig,' ').replace(/\s+/g,' ').trim();}
  let q=null,range=false;const rq=readQty(t);if(rq){q=rq.q;range=rq.range;t=t.slice(rq.len).trim();}
  let size=null;const alts=[];
  // A size right after the amount: "1 (15 oz) can", "1 (15-ounce) can", "2 15-oz cans".
  let m=t.match(/^\(([^()]*)\)\s*/);if(m){const a=amountOnly(m[1].replace(/-/g,' '));if(a){size=a;t=t.slice(m[0].length);}}
  if(!size&&(m=t.match(new RegExp(`^(${N1})\\s*-?\\s*(ounces?|oz|pounds?|lbs?|grams?|g|ml|fl\\.? ?oz)\\.?\\s+(?=[a-z])`,'i')))){const u=unitOf(m[2].replace(/\s+/g,' '));if(u&&COUNTY.has(unitOf(t.slice(m[0].length).split(/\s+/)[0])||'')){size={q:num1(m[1]),unit:u};t=t.slice(m[0].length);}}
  // Every other parenthesis, wherever it is: second amounts, sizes for count units, or notes.
  const pp=pullParens(t);t=pp.rest;const pamts=[];for(const g of pp.groups){const r=readGroup(g);pamts.push(...r.amts);notes.push(...r.notes);}
  let unit=null;if(q!=null||rq==null){m=t.match(/^(fl\.?\s?oz\.?|fluid ounces?|[a-z]+\.?)(?=\s|$|,)/i);if(m){const u=unitOf(m[1].replace(/\s+/g,' '));if(u){unit=u;t=t.slice(m[0].length).trim();}}}
  if(q==null&&unit){q=1;}
  t=t.replace(/^of\s+/i,'');
  let sa;while((sa=t.match(SIZE_ADJ))){notes.push(sa[1].toLowerCase());t=t.slice(sa[0].length);}
  // For a can or package the parenthesis is its size ("1 can (15 oz)"); otherwise it is the same amount said another way.
  for(const a of pamts){if(!size&&unit&&COUNTY.has(unit)&&!COUNTY.has(a.unit))size=a;else alts.push(a);}
  // Everything after the first comma is notes.
  let item=t,rest='';const ci=t.indexOf(',');if(ci>=0){item=t.slice(0,ci);rest=t.slice(ci+1).trim();}
  item=item.replace(/\s+/g,' ').replace(/^[\s,;:-]+|[\s,;:.-]+$/g,'').trim();
  // "3 cloves" (the spice) leaves no item: the unit word was the item.
  if(!item&&unit==='clove'){item='cloves';unit=null;}
  if(unit==null&&(m=item.match(TAIL_UNIT))&&item.length>m[0].length){unit=unitOf(m[1])||(/^inch/i.test(m[1])?'inch':null);if(unit!=='piece')item=item.slice(0,m.index).trim();}
  const full=item;
  item=item.replace(PREP_RE,x=>{notes.push(x.toLowerCase());return ' ';}).replace(/\s+(or|and|&)\s*$/i,'').replace(/\s+/g,' ').replace(/^[\s,;:&-]+|[\s,;:.&-]+$/g,'').trim();
  if(rest)notes.push(rest.replace(/\s+/g,' ').trim());
  if(/\bto taste\b/i.test(text)&&q==null&&!notes.includes('to taste'))notes.push('to taste');
  const note=[...new Set(notes.filter(Boolean))].join(', ');
  // "jaggery or sugar": each choice is tried in turn when matching.
  const ors=/\s+or\s+/i.test(item)?item.split(/\s+or\s+/i).map(s=>s.trim()).filter(Boolean):[];
  return {text,q:q==null?null:r3(q),range,unit,size,alts,item,full:full!==item?full:'',ors,notes:note,optional,basic:isBasic(item)||(q==null&&isBasic(item.replace(/\s+to taste$/i,'')))};}

// ---------- matching ----------
const FORMS=new Set(['ground','powder','paste','flake','sauce','juice','seed','oil','extract','dried','salt','stick','chip','spread','soup','mix','seasoning','syrup','jam','puree','vinegar','sprout']);
// The key a pick is learned under: lower case, singular ("red bell peppers" and "red bell pepper" are one).
const learnKey=t=>sing(t);
const KINDS=new Set(['green','diced','crushed','whipped','grape','cherry','sun','frozen','canned','smoked','roasted','sweetened','condensed','evaporated','dark','light','instant','baby','red','white','purple','powdered','brown','block']);
const sing=s=>norm(s).split(' ').map(w=>w.length>3&&/(oes|ches|shes|sses|xes)$/.test(w)?w.slice(0,-2):w.length>3&&/[^s]s$/.test(w)?w.slice(0,-1):w).join(' ');
// Recipe words for things the catalog names differently. The synonym is tried before the line's own words.
const SYN=[[/^(?:ceylon\s+)?cinnamon\s+(?:piece|stick|bark|quill)s?$|^cinnamon\s+sticks?$/,'cinnamon sticks'],[/^(?:fresh\s+)?coriander\s+(?:leaves|leaf)$|^(?:fresh\s+)?coriander\s+cilantro$|^cilantro\s+leaves$/,'fresh cilantro'],
  [/^cloves?$|^whole\s+cloves?$/,'whole cloves'],[/^(?:dried\s+)?bay\s+lea(?:f|ves)$/,'dried bay leaves'],[/^(?:green\s+)?cardamoms?(?:\s+pods?)?$/,'green cardamom pods'],
  [/^scallions?$|^spring\s+onions?$/,'green onions'],[/^kashmiri\s+(?:red\s+)?chil(?:l)?i\s+powder$/,'paprika'],[/^(?:cooking|vegetable|neutral|canola)\s+oil$|^oil$/,'cooking oil'],
  [/^(?:all[- ]purpose|plain)\s+flour$/,'all purpose flour'],[/^(?:heavy|whipping|double)\s+cream$/,'heavy whipping cream'],[/^unsalted\s+butter$|^salted\s+butter$/,'butter'],[/^(?:raw\s+|whole\s+)?cashews?(?:\s+nuts?)?$/,'raw cashews']];
function synonym(t){const n=norm(t);for(const [re,v] of SYN)if(re.test(n))return v;
  // "coriander powder" is what the catalog calls ground coriander; chili and garlic powder keep their names.
  const m=n.match(/^(coriander|cumin|turmeric|cinnamon|cardamom|clove|nutmeg|ginger|fennel|mustard)\s+powder$/);return m?'ground '+m[1]:'';}
// opts.fuzzy(text) -> [{p,sc}] sorted best first: the app passes its receipt matcher (fuzzy over name and Aldi name).
// opts.learned: {learnKey(item text): item id} from earlier picks; opts.alias(text) -> item id or null.
// Same acceptance rule as receipts: score .7 or more and .08 clear of the next.
function matchLine(p,opts){opts=opts||{};const key=norm(p.item);if(!key)return {iid:null,how:'none',sc:0,cands:[]};
  const L=opts.learned||{},lk=learnKey(p.item);if(L[lk])return {iid:L[lk],how:'learned',sc:1,cands:[]};
  const a=opts.alias?opts.alias(p.item):null;if(a)return {iid:a,how:'alias',sc:1,cands:[]};
  // Recipe-side ranking on top of the shared matcher: an item named exactly like the line wins, and an item whose
  // name adds a form or kind the line doesn't ask for (powder, paste; green, diced) drops back ("1 onion" is not onion powder).
  // An item whose unit the line's amount converts to gets a small lift ("1 tsp cinnamon" is ground, not sticks).
  const rank=(fz,t)=>{const tw=new Set(sing(t).split(' '));return fz.map(x=>{const nm=sing(x.p.name);let sc=x.sc;if(nm===sing(t))sc+=.2;
    for(const w of nm.split(' '))if(!tw.has(w))sc-=FORMS.has(w)?.3:KINDS.has(w)?.15:0;if(p.q!=null&&amountFor(p,x.p).q!=null)sc+=.1;return {...x,sc};}).sort((a,b)=>b.sc-a.sc);};
  // The words before prep notes come first ("diced tomatoes" is the canned item, "tomatoes" the fresh one).
  const ok=fz=>fz[0]&&fz[0].sc>=.7&&(!fz[1]||fz[0].sc-fz[1].sc>=.08||fz[1].p.id===fz[0].p.id);let last=[];
  const tries=[...new Set([synonym(p.full),synonym(p.item),p.full,p.item,...(p.ors||[]).flatMap(o=>[synonym(o),o])].filter(Boolean))];
  for(const t of tries){const fz=rank((opts.fuzzy?opts.fuzzy(t):[])||[],t);if(!last.length)last=fz;
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
    if(INCHY.has(cu)&&(EACH.has(u)||u==='stick'))return {q:1,from:cu};
    // Fresh herbs are sold by the bunch; a bunch is about a cup chopped.
    if(u==='bunch'&&M&&M.convert){const n=toMC(c.q,cu);const cups=M.convert(n.q,n.unit,'cup');if(cups!=null)return {q:r3(cups),from:cu};}
    const n=toMC(c.q,cu);if(n.unit===u)return {q:r3(n.q),from:cu};
    if(M&&M.convert){const v=M.convert(n.q,n.unit,u);if(v!=null)return {q:r3(v),from:cu};}}
  return {q:null,why:`${fmtAmt(p)} can't be turned into ${u}`};}
// How the editor shows an amount: in the item's unit or a smaller one of the same kind, rounded to what a
// person measures (4.5 oz, not 0.287 lb; 3½ tbsp, not 0.219 cup). Returns {q, u} with q as a string.
function display(q,item){const u=item&&item.unit,M=MC();if(!(q>0)||!u||!M||!M.kindOf)return {q:q>0?String(+(+q).toFixed(2)):'',u:u||''};
  const step=(v,s)=>Math.max(s,Math.round(v/s)*s),out=(v,unit)=>({q:String(+v.toFixed(3)),u:unit});const kind=M.kindOf(u),ok=M.unitsFor(u);
  if(kind==='weight'){const oz=M.convert(q,u,'oz');if(u==='lb'&&q>=1)return out(Math.round(q*100)/100,'lb');return out(oz<10?step(oz,.5):Math.round(oz),'oz');}
  if(kind==='volume'){const tsp=M.convert(q,u,'tsp');
    if(ok.includes('cup')&&tsp>=12-1e-9)return out(step(tsp/48,.125),'cup');
    if(ok.includes('tbsp')&&tsp>=3-1e-9)return out(step(tsp/3,.5),'tbsp');
    return out(step(tsp,tsp<.5?.125:.25),'tsp');}
  return out(Math.round(q*100)/100,u);}
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
// ---------- photo and steps ----------
// The photo is kept as a link (https only); steps are kept as the site wrote them. The app scales amounts in steps
// when it shows them, so nothing is rewritten here. Code.gs (recipeSteps_) has the same rules for the catalog fetch.
// The app puts the photo in an inline style, which is split on ";" (support.js), so characters that would end the
// declaration or the url('…') are percent-encoded. Hearst sites (Delish) use "?crop=…;center,top" in image links.
function cssSafeUrl(s){return String(s||'').trim().replace(/[;'"()\\\s]/g,c=>'%'+('0'+c.charCodeAt(0).toString(16).toUpperCase()).slice(-2));}
function photoOf(n,url){let v=n&&n.image;for(let i=0;i<3&&v&&typeof v==='object';i++)v=Array.isArray(v)?v[0]:(v.url||v.contentUrl||v['@id']||'');
  let s=String(v||'').trim();if(/^\/\//.test(s))s='https:'+s;else if(/^\/[^/]/.test(s)){const h=String(url||'').match(/^https:\/\/[^/]+/i);s=h?h[0]+s:'';}
  s=cssSafeUrl(s);return /^https:\/\/[^\s"<>]+$/i.test(s)&&s.length<=2000?s:'';}
const STEP_AD=/jump to (?:the )?recipe|print (?:the )?recipe|pin (?:it|this|for later)|advertisement|sponsored|subscribe|newsletter|sign up|click here|affiliate|watch the video|rate this recipe|leave a (?:comment|review|rating)|tag @|follow (?:me|us) on|tried this recipe|share (?:a|your) photo|this post may contain|as an amazon associate/i;
const STEP_HEAD=/^(?:for (?:the )?.{1,40}|to (?:make|serve|assemble|finish) .{1,40}|instructions|directions|method|steps|preparation|notes?|assembly|garnish|to serve)$/i;
function cleanStep(raw){let s=decode(decode(raw)).replace(/\s+([.,;:!?)])/g,'$1').replace(/\(\s+/g,'(').trim();
  s=s.replace(/^(?:step\s*)?\d{1,2}\s*[.):-]\s+(?=\S)/i,'').replace(/^step\s*\d{1,2}\s*$/i,'');
  s=s.replace(/\s*\b(?:jump to (?:the )?recipe|print (?:the )?recipe|jump to video)\b[\s:!.]*/gi,' ').trim();
  if(STEP_AD.test(s))s=(s.match(/[^.!?]+(?:[.!?]+|$)/g)||[]).map(x=>x.trim()).filter(x=>x&&!STEP_AD.test(x)).join(' ');
  if(!s||!/[a-z]/i.test(s))return '';
  if(s.length<=60&&/:$/.test(s))return '';
  // A heading on its own ("For the sauce", "TO SERVE") is not a step.
  const bare=s.replace(/[:!]+$/,'').trim();
  if(bare.length<=50&&!/[.,;]/.test(bare)&&(STEP_HEAD.test(bare)||(bare===bare.toUpperCase()&&/[A-Z]{3}/.test(bare)&&bare.split(' ').length<=6)))return '';
  return s.slice(0,1200);}
// A string with several steps in it: split on line breaks and list or paragraph tags, then on "1." / "Step 2" markers.
function splitSteps(t){t=String(t||'');let parts=t.split(/<\/?(?:li|p|br|ol|ul|h[1-6]|div)\b[^>]*>|\r?\n+/i).map(x=>x.trim()).filter(Boolean);
  if(parts.length===1){const n=decode(parts[0]).split(/\s+(?=(?:step\s*)?\d{1,2}[.)]\s+[A-Z])/i);if(n.length>1)parts=n;}return parts;}
function stepsOf(n){const out=[];const add=t=>{for(const p of splitSteps(t)){const c=cleanStep(p);if(c&&c!==out[out.length-1])out.push(c);}};
  const walk=(v,d)=>{if(v==null||d>6||out.length>=80)return;if(typeof v==='string'){add(v);return;}if(Array.isArray(v)){v.forEach(x=>walk(x,d+1));return;}if(typeof v!=='object')return;
    const kids=v.itemListElement||v.steps||v.step;
    if(kids&&(typeof kids==='object'))walk(kids,d+1);else walk(v.text!=null?v.text:v.name!=null?v.name:v.description,d+1);};
  walk(n&&n.recipeInstructions,0);return out.slice(0,80);}
function fromSchema(n,url){if(!n)return null;const tot=minutes(n.totalTime)||((minutes(n.prepTime)||0)+(minutes(n.cookTime)||0))||null;const g=guessMeta(n);
  // The photo is a link, not the image, so backups stay small.
  const link=String(url||n.url||'').trim(),photo=photoOf(n,link),steps=stepsOf(n);
  return {name:decode(txt(n.name)).slice(0,120),serv:servings(n.recipeYield||n.yield),total:tot,hands:minutes(n.prepTime),ings:ingList(n),link,meal:g.meal,tags:g.tags,...(photo?{photo}:{}),...(steps.length?{steps}:{})};}

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

// Substitutions a line offers: "jaggery or sugar", "(can use corn starch as a replacement)", "use passion fruit or pineapple juice if…".
const ADJ1=/^(purple|black|white|red|green|yellow|orange|blue|brown|golden|light|dark|fresh|frozen|dried|sweet|hot|mild|large|small|whole|raw|plain|unsalted|salted|smoked|ground)$/i;
const TAILW=/^(juice|pulp|puree|purée|powder|paste|sauce|oil|flour|milk|extract|seeds?|leaves|leaf|flakes|syrup|starch|broth|stock|vinegar|cream|cheese)$/i;
function shareTail(parts){if(parts.length<2)return parts;const last=parts[parts.length-1].split(' ');const lw=last[last.length-1];
  return parts.map((p,i)=>{if(i===parts.length-1)return p;const w=p.split(' ');if(w.length===1&&ADJ1.test(w[0])&&last.length>1)return [w[0],...last.slice(1)].join(' ');
    if(TAILW.test(lw)&&last.length>1&&!w.some(x=>x.toLowerCase()===lw.toLowerCase()))return p+' '+lw;return p;});}
function subsOf(text){const raw=decode(String(text||''));const out=[];const add=s=>{s=String(s||'').replace(/^(?:a|an|some|the|more)\s+/i,'').replace(/[\s,;:.]+$/,'').trim().toLowerCase();if(s.length>1&&s.split(' ').length<=5&&!/can'?t|cannot|find|taste/.test(s)&&!out.includes(s))out.push(s);};
  const p=parseLine(raw);if(p.ors&&p.ors.length>1)shareTail(p.ors.map(s=>s.trim())).forEach(add);
  const t=raw.replace(/[–—-]?\s*\baka\b[^–—)]*[–—]?/gi,' ').replace(/\s+/g,' ');
  const RE=/(?:\b(?:or\s+)?(?:can\s+)?use|\bsubstitute(?:\s+with)?|\bsub(?:\s+with|\s+in)?|\bswap(?:\s+in|\s+for)?|\breplace\s+with|\bor\s+try)\s+([^().;:–—]+?)(?=\s+(?:if|as|instead|when|for|in\s+place|works?)\b|[().;:,–—]|$)/gi;let m;
  while((m=RE.exec(t)))shareTail(m[1].split(/\s*,\s*|\s+or\s+/i).map(s=>s.trim()).filter(Boolean)).forEach(add);
  const RO=/\(\s*or\s+([^)]+)\)/gi;while((m=RO.exec(t)))add(m[1]);
  return out.slice(0,6);}

const api={subsOf,display,learnKey,decode,readQty,unitOf,parseLine,isBasic,matchLine,amountFor,findRecipe,fromSchema,photoOf,cssSafeUrl,stepsOf,cleanStep,minutes,servings,guessMeta,pageLines,pasteLines,looksLikeIngredient,build,cost,norm};
if(typeof window!=='undefined')window.RecipeCore=api;if(typeof module!=='undefined')module.exports=api;
})();
