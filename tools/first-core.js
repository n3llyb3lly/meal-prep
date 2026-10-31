// Meal Prep 6.6 first-use rules (WP54–WP60). Pure functions shared by the app and the Self Test page.
(function(){
const r2=n=>Math.round(n*100)/100;
const FR={0.25:'¼',0.5:'½',0.75:'¾'};
const fracTxt=q=>{const w=Math.floor(q+1e-9),f=Math.round((q-w)*4)/4;return (w?String(w):'')+(FR[f]||'')||'0';};

// WP58: amounts a person can measure. Returns {q, text}. Exact value stays with the caller.
const WHOLE=/\b(eggs?|cloves?|garlic|tortillas?|cans?|bagels?|buns?|rolls?|slices?|links?|breasts?|thighs?|fillets?|chops?|pieces?|bars?|packets?)\b/i;
const PRODUCE=/\b(peppers?|onions?|tomato(es)?|avocados?|potato(es)?|carrots?|cucumbers?|zucchini|apples?|bananas?|lemons?|limes?|oranges?|jalape[nñ]os?|squash|eggplants?|mangos?|mango(es)?|celery|heads?|bunch(es)?)\b/i;
function cookAmt(q,unit,name){const u=String(unit||'each').toLowerCase();const n=String(name||'');
  if(!(q>0))return {q:0,text:'0'};
  if(u==='tsp'){if(q<.25-1e-9)return {q,text:'a pinch',pinch:true};const v=Math.round(q*4)/4;return {q:v,text:fracTxt(v)+' tsp'};}
  if(u==='tbsp'){const v=Math.max(.5,Math.round(q*2)/2);return {q:v,text:fracTxt(v)+' tbsp'};}
  if(u==='cup'||u==='cups'){const v=Math.max(.25,Math.round(q*4)/4);return {q:v,text:fracTxt(v)+(v>1?' cups':' cup')};}
  const cnt=u==='each'||u==='count'||u==='ct'||u==='clove'||u==='cloves'||u==='egg';
  if(cnt&&(WHOLE.test(n)||WHOLE.test(u))){const v=Math.max(1,Math.round(q));return {q:v,text:String(v),whole:true};}
  if(cnt&&PRODUCE.test(n)){const v=Math.max(.5,Math.round(q*2)/2);return {q:v,text:fracTxt(v),half:true};}
  if(cnt){const v=Math.max(.25,Math.round(q*4)/4);return {q:v,text:fracTxt(v)};}
  return {q,text:null};}

// WP55: what a finished trip carries. Overspend capped at half a week, unspent at one week.
function carry({budget,spent,weekly,hadReceipts}){if(!hadReceipts)return {carry:0,over:0,capped:false};const v=r2(budget-spent);
  if(v<0){const cap=r2(weekly/2);const c=Math.max(-cap,v);return {carry:c,over:r2(-v),capped:c!==v};}
  return {carry:Math.min(weekly,v),over:0,capped:v>weekly};}
function carryText(c){if(!c||!c.over)return '';return c.capped?`Overspent ${'$'+c.over.toFixed(2)}, ${'$'+(-c.carry).toFixed(2)} carries forward`:`Overspent ${'$'+c.over.toFixed(2)}, all of it carries forward`;}
// WP55: does a main shop look bigger than the trip it landed on?
function sizeCheck({total,share,days}){const big=share>0&&total>2*share;
  return {big,text:big?`This looks like more than ${days} day${days===1?'':'s'} of groceries ($${Math.round(total)} against a $${Math.round(share)} budget). When's your next trip?`:''};}
// WP55: confirmation text when a date change shortens a trip.
function shortenText({days,budget,fit,wont}){return `The trip becomes ${days} day${days===1?'':'s'} and the budget $${budget.toFixed(2)}. ${fit} meal${fit===1?'':'s'} fit${fit===1?'s':''} and ${wont} won't.`;}

// WP60: shelf life for items created from a receipt line. days null = no date.
const SHELF_RULES=[
  [/yogurt|kefir|(?<!evaporated |condensed |coconut |almond |oat )milk\b|creamer|cottage|sour cream|cream cheese/i,'fridge',14,'dairy'],
  [/\bcheese|brie|mozzarella|cheddar|parmesan/i,'fridge',30,'cheese'],
  [/\beggs?\b/i,'fridge',28,'eggs'],
  [/summer sausage|salami stick|jerky|pepperoni stick/i,'pantry',60,'shelf-stable sausage'],
  [/frozen|ice cream/i,'freezer',180,'frozen'],
  [/\bcanned|\bcan\b|chunk light|tuna|sardines|black beans|kidney beans|chickpeas|garbanzo|refried|soup\b|broth|stock\b|coconut milk|diced tomatoes|tomato paste|evaporated/i,'pantry',365,'canned'],
  [/marinara|pasta sauce|salsa|pickles?|peanut butter|jam\b|jelly|honey|syrup|ketchup|mustard|mayo|hot sauce|soy sauce|dressing|alfredo|pesto jar/i,'pantry',180,'jarred'],
  [/pasta|spaghetti|penne|rotini|macaroni|noodles|\brice\b|oats|oatmeal|quinoa|lentils|flour|sugar|cornmeal|dry beans/i,'pantry',365,'dry'],
  [/sparkling|seltzer|\bwater\b|soda|cola|energy drink|sports drink|flavored beverage|beverage|juice box|tea bottle|cold brew/i,'pantry',180,'bottled drink'],
  [/crackers?|chips|pretzels?|\bbars?\b|cookies?|cereal|granola|popcorn|nuts\b|trail mix|fruit snacks|pops\b/i,'pantry',90,'snack'],
  [/bread|bagels?|tortillas?|buns|rolls|english muffin|pita/i,'pantry',7,'bread'],
  [/spinach|lettuce|salad|greens|arugula|herbs?|cilantro|parsley|basil|berries|strawberr|raspberr|blueberr|mushroom/i,'fridge',5,'tender produce'],
  [/avocado/i,'pantry',4,'produce'],[/roma|tomato/i,'pantry',5,'produce'],[/green onion|scallion/i,'fridge',7,'produce'],
  [/onion|potato|sweet potato|garlic|squash/i,'pantry',30,'produce'],[/apple|orange|lemon|lime|carrot|celery|cabbage/i,'fridge',21,'produce'],
  [/(?<!black |white )\bpeppers?\b(?! flakes)|cucumber|zucchini|broccoli|cauliflower|banana|grape|pear|peach|plum|mango/i,'fridge',7,'produce'],
  [/chicken|beef|pork|turkey|ground (beef|turkey|pork|chicken|lamb)|steak|salmon|tilapia|shrimp|sausage|bacon|ham\b|deli|fish/i,'fridge',4,'meat'],
  [/butter/i,'fridge',60,'butter'],[/hummus|dip\b|tofu/i,'fridge',10,'fridge'],[/coffee|tea\b/i,'pantry',180,'pantry']];
function shelfGuess(name){const n=String(name||'');for(const [re,storage,days,kind] of SHELF_RULES)if(re.test(n))return {storage,days,kind};return {storage:null,days:null,kind:'unknown'};}
const NO_DATE='9999-12-31';

// WP59: the three lines most likely to explain a mismatch. diff = lines - printed.
const CONF={'8':['3','6','0','9','5'],'3':['8','5','9'],'5':['6','3','8','9'],'6':['5','8','0'],'0':['8','6','9'],'1':['7','4'],'7':['1'],'9':['8','0','3','5'],'4':['1']};
function rankCandidates(rows,diff){if(!(Math.abs(diff)>=.005))return [];const out=[];
  rows.forEach((r,i)=>{if(!(r.amount>0))return;const s=r.amount.toFixed(2);let sc=(1-(r.conf==null?.85:r.conf))*4;
    for(const ch of s)if('8356'.includes(ch))sc+=.4;let fix=null;const target=r2(r.amount-diff);const ts=target.toFixed(2);
    if(target>0&&ts.length===s.length){let d=0,ok=true;for(let j=0;j<s.length;j++)if(s[j]!==ts[j]){d++;if(!(CONF[s[j]]||[]).includes(ts[j]))ok=false;}if(d===1){sc+=ok?6:3;fix=target;}}
    if(r.unsure)sc+=2;out.push({i,sc,fix,amount:r.amount});});
  return out.sort((a,b)=>b.sc-a.sc).slice(0,3);}
// WP59: a number counts only when two reads agree.
function twoRead(a,b){const x=String(a||'').replace(/\D/g,''),y=String(b||'').replace(/\D/g,'');return x&&x===y?x:null;}

// WP58: which leftover slots to pre-tick. slots in time order [{key,pe,k,m}], cooked at (k,m).
function leftoverTicks(slots,extra,k,m){const pick=[];let left=extra;const first=slots.find(s=>m!=='dinner'&&s.k===k&&s.m==='dinner')||slots.find(s=>s.k!==k&&s.m==='lunch')||slots[0];
  const order=first?[first,...slots.filter(s=>s!==first)]:slots;for(const s of order){if(left+1e-6>=s.pe){pick.push(s.key);left-=s.pe;}if(left<1e-6)break;}return pick;}

// WP54: appetite slider.
const APPETITE=[['Small',.5],['Light',.75],['Usual',1],['Hearty',1.25],['Big',1.5]];
function appIndex(v){let b=2,bd=9;APPETITE.forEach(([,x],i)=>{const d=Math.abs((v??1)-x);if(d<bd){bd=d;b=i;}});return b;}
function appWords(v){const x=APPETITE[appIndex(v)][1];const t=x===1?'1 portion':x===.5?'½ a portion':x===.75?'¾ of a portion':x===1.25?'1¼ portions':'1½ portions';return 'about '+t;}

// WP54: weekly patterns → mains Fill plans per day and the double flag.
const PATTERNS=[{id:'dinnerLeft',label:'Cook dinner, leftovers for lunch',mains:1,double:true},{id:'both',label:'Cook lunch and dinner',mains:2,double:false},{id:'mix',label:"A mix, I'll decide as I go",mains:1.5,double:false},{id:'out',label:'Mostly eating out',mains:.5,double:false}];
// WP54: meals after the first one you're home for.
const ORDER=['breakfast','lunch','dinner'];
function mealsAfter(firstMeal){const i=ORDER.indexOf(firstMeal);return i<0?ORDER:ORDER.slice(i);}
function passedMeals(hour){return hour>=22?ORDER:hour>=15?['breakfast','lunch']:hour>=10.5?['breakfast']:[];}

// WP57: card titles.
function shortTitle(name){const s=String(name||'');const i=s.indexOf(' (');if(i<0)return s;const p=s.slice(i+2).replace(/\)\s*$/,'');return p.length>20?s.slice(0,i):s;}

// WP56: rails.
function rails(list,keyOf,order){const g={};for(const x of list){const k=keyOf(x);(g[k]=g[k]||[]).push(x);}return [...order.filter(k=>g[k]),...Object.keys(g).filter(k=>!order.includes(k))].map(k=>({key:k,items:g[k]}));}

// WP60: kitchen summary buckets for one batch list.
function useState(daysLeft){if(daysLeft==null)return 'none';if(daysLeft>5000)return 'nodate';if(daysLeft<0)return 'past';if(daysLeft<=2)return 'soon';return 'ok';}

// WP66: backup schedule.
function backupDue({lastAt,now,changes,lastEventAt,event}){const H=36e5;if(!lastAt)return true;if(now-lastAt>24*H)return true;if(changes>=30)return true;if(event&&(!lastEventAt||now-lastEventAt>=.5*H)&&now-lastAt>=.5*H)return true;return false;}
function backupKeep(files,now,daily,weekly){daily=daily||7;weekly=weekly||4;const D=864e5;const s=[...files].sort((a,b)=>b.at-a.at);const keep=new Set();const days=new Set(),weeks=new Set();
  for(const f of s){const dk=Math.floor(f.at/D);if(days.size<daily&&!days.has(dk)){days.add(dk);keep.add(f.name);}}
  for(const f of s){if(now-f.at>weekly*7*D)continue;const wk=Math.floor(f.at/(7*D));if(!weeks.has(wk)){weeks.add(wk);keep.add(f.name);}}
  return s.filter(f=>!keep.has(f.name)).map(f=>f.name);}
function backupStale(lastAt,now){return !lastAt||now-lastAt>=3*864e5;}

const api={cookAmt,carry,carryText,sizeCheck,shortenText,shelfGuess,NO_DATE,rankCandidates,twoRead,leftoverTicks,APPETITE,appIndex,appWords,PATTERNS,mealsAfter,passedMeals,shortTitle,rails,useState,backupDue,backupKeep,backupStale};
if(typeof window!=='undefined')window.FirstCore=api;if(typeof module!=='undefined')module.exports=api;
})();
