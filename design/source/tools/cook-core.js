// Cooking rules for 6.4: unit conversion with an ingredient density table, scaling recipe text, protein groups.
(function(){
const ML={tsp:4.929,tbsp:14.787,cup:236.59,'fl oz':29.574,ml:1,L:1000};
const G={g:1,kg:1000,oz:28.3495,lb:453.592};
const ALIAS={teaspoon:'tsp',teaspoons:'tsp',t:'tsp',tsp:'tsp',tablespoon:'tbsp',tablespoons:'tbsp',tbsp:'tbsp',tbs:'tbsp',tbl:'tbsp',T:'tbsp',cup:'cup',cups:'cup',c:'cup',
  'fl oz':'fl oz','fluid ounce':'fl oz','fluid ounces':'fl oz',ml:'ml',milliliter:'ml',milliliters:'ml',l:'L',L:'L',liter:'L',liters:'L',litre:'L',litres:'L',
  g:'g',gram:'g',grams:'g',kg:'kg',kilogram:'kg',kilograms:'kg',oz:'oz',ounce:'oz',ounces:'oz',lb:'lb',lbs:'lb',pound:'lb',pounds:'lb',
  stick:'stick',sticks:'stick',each:'count',ct:'count',count:'count',clove:'count',cloves:'count',piece:'count',pieces:'count',whole:'count',large:'count',medium:'count',small:'count'};
// Grams per US cup. Matched by the first pattern that fits the ingredient name.
const DENSITY=[[/flour/,125],[/powdered sugar|icing sugar/,120],[/brown sugar/,213],[/sugar/,200],[/cornstarch|corn starch/,128],[/cocoa/,85],[/baking soda/,220],[/baking powder/,192],[/\bsalt\b/,288],
  [/blueberr|blackberr/,145],[/raspberr/,125],[/strawberr/,150],[/berr/,145],[/cherr/,155],[/grapes?\b/,150],[/mango|pineapple|peach/,165],[/corn\b|peas\b/,145],[/spinach|kale|greens|lettuce|arugula/,30],[/broccoli|cauliflower/,90],[/oats|oatmeal/,90],[/quinoa/,170],[/rice/,185],[/lentil/,192],[/breadcrumb|panko/,108],[/chocolate chip/,170],[/peanut butter|almond butter/,258],[/butter|ghee/,227],
  [/parmesan|grated cheese/,100],[/shredded|cheese|mozzarella|cheddar|paneer/,113],[/honey|maple|syrup|molasses/,340],[/oil/,218],[/yogurt|sour cream|cream cheese/,245],[/cream/,238],
  [/milk|water|broth|stock|juice|vinegar|wine|soy sauce/,240],[/tomato sauce|passata|puree|crushed tomato|marinara/,250],[/cashew|almond|walnut|pecan|peanut|nuts?\b/,140],[/beans|chickpea/,180],
  [/onion/,160],[/tomato/,180],[/pepper|bell/,150],[/carrot/,128],[/spinach/,30],[/cilantro|parsley|basil|herb/,16],[/garlic/,136],[/ginger/,96],[/spice|powder|cumin|paprika|turmeric|masala|chili|cinnamon|seasoning/,100]];
// Grams in one whole piece.
const EACH=[[/garlic/,5],[/egg/,50],[/onion/,170],[/tomato/,123],[/bell pepper|pepper/,150],[/jalapeno|green chil/,15],[/avocado/,150],[/carrot/,61],[/potato/,213],[/lemon/,84],[/lime/,67],[/apple/,182],[/banana/,118],[/cardamom|clove\b/,1],[/chicken breast/,200],[/chicken thigh/,110],[/tortilla/,45]];
const UNITS={liquid:['tsp','tbsp','cup','fl oz','ml','L'],powder:['tsp','tbsp','cup','oz','g'],solid:['oz','lb','g','kg','count'],butter:['tbsp','stick','oz','g'],produce:['count','cup','oz']};
const KIND_LABEL={liquid:'Liquid',powder:'Powder or grain',solid:'Solid',butter:'Butter',produce:'Produce'};
const nm=s=>String(s||'').toLowerCase();
const find=(T,n)=>{for(const [re,v] of T)if(re.test(n))return v;return null;};
function canon(u){if(!u)return '';const k=String(u).trim();return ALIAS[k]||ALIAS[k.toLowerCase()]||ALIAS[k.toLowerCase().replace(/\.$/,'')]||'';}
function kindOf(name,unit){const n=nm(name),u=canon(unit)||unit;
  if(/butter|ghee/.test(n)&&!/peanut|almond|bean/.test(n))return 'butter';
  if(/milk|water|broth|stock|oil|juice|vinegar|wine|cream(?! cheese)|sauce|syrup|honey|extract/.test(n)||u==='fl oz'||u==='ml'||u==='L')return 'liquid';
  if(/flour|sugar|salt|powder|spice|cumin|paprika|turmeric|masala|cinnamon|seasoning|rice|oats|quinoa|lentil|cocoa|cornstarch|breadcrumb|panko|baking/.test(n))return 'powder';
  if(/onion|tomato|pepper|carrot|potato|garlic|lemon|lime|avocado|apple|banana|spinach|herb|cilantro|parsley|basil|ginger|jalapeno|chil|cucumber|zucchini|mushroom/.test(n))return 'produce';
  return 'solid';}
function unitsFor(kind){return UNITS[kind]||UNITS.solid;}
// Convert q from one unit to another for a named ingredient. Returns {q, est} or null.
function convert(q,from,to,name){from=canon(from)||from;to=canon(to)||to;if(!(q>=0))return null;if(from===to)return {q,est:false};const n=nm(name);
  const toG=(x,u)=>{if(G[u])return {g:x*G[u],est:false};if(u==='stick')return {g:x*113.4,est:false};if(ML[u]){const d=find(DENSITY,n);return d?{g:x*ML[u]/ML.cup*d,est:true}:null;}if(u==='count'){const e=find(EACH,n);return e?{g:x*e,est:true}:null;}return null;};
  const fromG=(g,u)=>{if(G[u])return g/G[u];if(u==='stick')return g/113.4;if(ML[u]){const d=find(DENSITY,n);return d?g/d*ML.cup/ML[u]:null;}if(u==='count'){const e=find(EACH,n);return e?g/e:null;}return null;};
  if(ML[from]&&ML[to])return {q:q*ML[from]/ML[to],est:false};
  if(G[from]&&G[to])return {q:q*G[from]/G[to],est:false};
  if(from==='stick'&&ML[to])return {q:q*8*ML.tbsp/ML[to],est:false};if(to==='stick'&&ML[from])return {q:q*ML[from]/ML.tbsp/8,est:false};
  const a=toG(q,from);if(!a)return null;const b=fromG(a.g,to);if(b==null)return null;return {q:b,est:a.est||!G[to]&&to!=='stick'};}
const FR=[[0,''],[.125,'⅛'],[.25,'¼'],[1/3,'⅓'],[.5,'½'],[2/3,'⅔'],[.75,'¾'],[1,'']];
function fmt(q,unit){unit=canon(unit)||unit;if(!(q>0))return `0 ${unit}`;
  if(['tsp','tbsp','cup','stick','count'].includes(unit)){let w=Math.floor(q),f=q-w,best=FR[0];for(const x of FR)if(Math.abs(f-x[0])<Math.abs(f-best[0]))best=x;if(best[0]===1){w++;best=FR[0];}
    const t=(w?String(w):'')+best[1]||'0';const plural=unit==='count'?'':unit==='cup'&&q>1?' cups':unit==='stick'&&q>1?' sticks':` ${unit}`;return unit==='count'?t:`${t||'⅛'}${plural}`;}
  if(unit==='g'||unit==='ml')return `${q>=100?Math.round(q/5)*5:Math.round(q)} ${unit}`;
  if(unit==='kg'||unit==='L')return `${Math.round(q*100)/100} ${unit}`;
  return `${q>=10?Math.round(q):Math.round(q*10)/10} ${unit}`;}
// Read the amount at the start of a recipe line: "1½ cups (130 g) onions" → {q:1.5, unit:'cup'}.
const VF={'¼':.25,'½':.5,'¾':.75,'⅓':1/3,'⅔':2/3,'⅛':.125,'⅜':.375,'⅝':.625,'⅞':.875};
const NUM=String.raw`(\d+(?:\.\d+)?(?:\s*[¼½¾⅓⅔⅛⅜⅝⅞])?|[¼½¾⅓⅔⅛⅜⅝⅞]|\d+\s+\d+\/\d+|\d+\/\d+)`;
function num(s){s=String(s).trim();let m;if((m=s.match(/^(\d+)\s+(\d+)\/(\d+)$/)))return +m[1]+m[2]/m[3];if((m=s.match(/^(\d+)\/(\d+)$/)))return m[1]/m[2];
  if((m=s.match(/^(\d+(?:\.\d+)?)\s*([¼½¾⅓⅔⅛⅜⅝⅞])$/)))return +m[1]+VF[m[2]];if(VF[s]!=null)return VF[s];return parseFloat(s);}
const UNIT_RE=String.raw`(fl\.?\s*oz|fluid ounces?|teaspoons?|tablespoons?|tsp|tbsp|tbs|cups?|ml|milliliters?|liters?|litres?|l|kg|kilograms?|grams?|g|ounces?|oz|pounds?|lbs?|lb|sticks?|cloves?)\b\.?`;
const AMT=new RegExp(String.raw`^\s*`+NUM+String.raw`(?:\s*(?:-|to|–)\s*`+NUM+String.raw`)?\s*(?:`+UNIT_RE+')?','i');
function parseAmt(text){const m=String(text||'').match(AMT);if(!m)return null;const a=num(m[1]),b=m[2]?num(m[2]):null;const u=m[3]?canon(m[3].replace(/\./g,'').replace(/\s+/g,' ').toLowerCase().replace(/^fl oz$/,'fl oz')):'count';
  return {q:a,q2:b,unit:u||'count',rest:String(text).slice(m[0].length).trim()};}
// Scale amounts written inside instructions. Times and temperatures stay as written.
// conv(unit, wordsAfter) may return a unit to convert that amount into.
const STEP=new RegExp(NUM+String.raw`(?:\s*(?:-|to|–)\s*`+NUM+String.raw`)?\s*`+UNIT_RE,'gi');
function scaleText(text,factor,conv){if(!text)return '';return String(text).replace(STEP,(all,a,b,u,off,str)=>{const unit=canon(u.replace(/\./g,'').replace(/\s+/g,' ').toLowerCase());if(!unit)return all;
  const after=str.slice(off+all.length,off+all.length+40).toLowerCase();let qa=num(a)*factor,qb=b!=null?num(b)*factor:null;let to=conv?conv(unit,after):null;
  if(to&&to!==unit){const ca=convert(qa,unit,to,after),cb=qb!=null?convert(qb,unit,to,after):null;if(ca&&(qb==null||cb)){const pre=ca.est?'about ':'';return qb!=null?`${pre}${fmt(ca.q,to).replace(/ .*/,'')} to ${fmt(cb.q,to)}`:`${pre}${fmt(ca.q,to)}`;}}
  return qb!=null?`${fmt(qa,unit).replace(/ .*/,'')} to ${fmt(qb,unit)}`:fmt(qa,unit);});}
// Main protein for browsing.
const PROT=[['Chicken',/chicken|turkey/],['Beef',/beef|steak|ground chuck/],['Pork',/pork|bacon|ham\b|sausage|chorizo|prosciutto/],['Fish and seafood',/fish|salmon|tuna|shrimp|cod|tilapia|crab|prawn|seafood|scallop/]];
function proteinOf(names){const s=names.map(nm).join(' | ');for(const [l,re] of PROT)if(re.test(s))return l;return 'Everything else';}
const PROTEINS=PROT.map(x=>x[0]).concat(['Everything else']);
const TILE={Chicken:'#D9893B',Beef:'#A4473A',Pork:'#C46A7A','Fish and seafood':'#3E7CA6','Everything else':'#5E8C5A'};
window.CookCore={canon,kindOf,unitsFor,convert,fmt,parseAmt,scaleText,proteinOf,PROTEINS,TILE,KIND_LABEL,UNITS};
})();
