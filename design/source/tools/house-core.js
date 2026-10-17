// Meal Prep 6.1 household rules: members, portions, preferences, essentials, calendar.
// Pure functions only. The app, tools/selftest.html and Self Test.dc.html all load this file.
(function(){
const r2=n=>Math.round(n*100)/100,q4=n=>Math.round(n*4)/4;
const kdate=k=>{const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d);};
const dkey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const addD=(k,n)=>{const d=kdate(k);d.setDate(d.getDate()+n);return dkey(d);};
const diffD=(a,b)=>Math.round((kdate(a)-kdate(b))/864e5);

const MEALS=['breakfast','lunch','snack','dinner'];
const AGE={adult:1,teen:1.25,child:.5,toddler:.35};
const AGE_LABEL={adult:'Adult',teen:'Teen',child:'Child',toddler:'Toddler'};
// Eight avatar colors. White initials hold at least 4.5:1 on each.
const COLORS=['#1D5FA8','#B03A2E','#2D6A3E','#7442A0','#8A5300','#0E6A70','#A2306B','#4A5566'];
const FLAGS=['pork','beef','poultry','fish','shellfish','dairy','egg','gluten','peanut','tree_nut','soy','sesame'];
const FLAG_LABEL={pork:'Pork',beef:'Beef',poultry:'Poultry',fish:'Fish',shellfish:'Shellfish',dairy:'Dairy',egg:'Egg',gluten:'Gluten',peanut:'Peanut',tree_nut:'Tree nuts',soy:'Soy',sesame:'Sesame',meat:'All meat',animal:'All animal foods'};
const GROUPS={meat:['pork','beef','poultry'],animal:['pork','beef','poultry','fish','shellfish','dairy','egg']};
const LIKE_W=2,DISLIKE_W=-3;

function appetiteLabel(a){return a<1?'Small':a===1?'Average':a<=1.5?'Big':'Extra big';}
function newMember(id,name,ageGroup,colorIx){const sched={};for(let d=0;d<7;d++)sched[d]={breakfast:true,lunch:true,snack:true,dinner:true};
  return {id,name,color:COLORS[(colorIx||0)%COLORS.length],ageGroup:ageGroup||'adult',appetite:AGE[ageGroup||'adult'],mealFactor:{breakfast:1,lunch:1,snack:1,dinner:1},schedule:sched,cantEat:[],dislikes:[],likes:[],notes:''};}
function flagParse(v){if(Array.isArray(v))return v;return String(v||'').split(/[;,]/).map(s=>s.trim().toLowerCase()).filter(Boolean);}
function expand(f){return GROUPS[f]||[f];}

// Who is at a meal. A day override wins over the weekly grid.
function present(m,ov,wd,meal){const o=ov&&ov.present&&ov.present[m.id];if(o&&meal in o)return !!o[meal];const s=m.schedule&&m.schedule[wd];return s?s[meal]!==false:true;}
function PE(members,ov,wd,meal){let s=0;for(const m of members||[])if(present(m,ov,wd,meal))s+=(m.appetite??1)*((m.mealFactor||{})[meal]??1);return s+((ov&&ov.guests)||0);}
function servings(pe,dbl){return q4(pe*(dbl?2:1));}
function dayPE(members,ov,wd){return (PE(members,ov,wd,'breakfast')+PE(members,ov,wd,'lunch')+PE(members,ov,wd,'dinner'))/3;}
function typicalPE(members,meal){let s=0;for(let wd=0;wd<7;wd++)s+=meal?PE(members,null,wd,meal):dayPE(members,null,wd);return q4(s/7);}
function portionsPerMeal(members){return q4((members||[]).reduce((a,m)=>a+(m.appetite??1),0));}
// Trip person-days: start up to, but not including, end.
function PED(members,overrides,start,end){let s=0;for(let k=start;k<end;k=addD(k,1))s+=dayPE(members,(overrides||{})[k],kdate(k).getDay());return s;}
// trips: [{spend, ped}] oldest first. Uses the last three with a receipt.
function budgetHint(trips,ped){const t=(trips||[]).filter(x=>x.ped>0&&x.spend>0).slice(-3);if(!t.length)return null;const per=t.reduce((a,x)=>a+x.spend/x.ped,0)/t.length;return {per:r2(per),value:r2(per*ped),n:t.length};}
function scaleBudget(weekly,oldPE,newPE){return oldPE>0?r2(weekly*newPE/oldPE):weekly;}

// Preferences.
function recipeFlags(itemFlagLists){const s=new Set();for(const l of itemFlagLists)for(const f of flagParse(l))s.add(f);return s;}
function suits(flags){const has=f=>flags.has(f);const meat=GROUPS.meat.some(has);const out=[];
  if(!meat&&!has('fish')&&!has('shellfish'))out.push('vegetarian');if(!GROUPS.animal.some(has))out.push('vegan');if(!meat)out.push('pescatarian');return out;}
function entryHits(e,flags,itemIds,tags){if(e.kind==='flag')return expand(e.id).some(f=>flags.has(f));if(e.kind==='item')return itemIds.has(e.id);if(e.kind==='tag')return (tags||[]).includes(e.id);return false;}
// Members who can't eat a recipe. eaters: members to check.
function conflicts(eaters,flags,itemIds){const out=[];for(const m of eaters){const hit=(m.cantEat||[]).find(e=>entryHits(e,flags,itemIds));if(hit)out.push({member:m,entry:hit});}return out;}
function prefScore(eaters,flags,itemIds,tags){let s=0;for(const m of eaters){for(const e of m.likes||[])if(entryHits(e,flags,itemIds,tags))s+=LIKE_W;for(const e of m.dislikes||[])if(entryHits(e,flags,itemIds,tags))s+=DISLIKE_W;}return s;}
// Members who usually eat this meal on at least one day.
function usualEaters(members,meal){return (members||[]).filter(m=>{for(let d=0;d<7;d++)if(present(m,null,d,meal))return true;return false;});}

// Household essentials.
function essStatus(e){const sp=e.spares||0,par=e.par??1;if(sp<=0)return e.inUse?'last':'out';if(sp<par)return 'low';return 'fine';}
const ESS_LABEL={fine:'Fine',low:'Low',last:'Last one',out:'Out'};
function cycleInfo(e,typical,scales,avgPE){const done=(e.cycles||[]).filter(c=>c.openedOn&&c.endedOn);
  if(done.length>=2){const l=done.slice(-4);const d=l.reduce((a,c)=>a+Math.max(1,diffD(c.endedOn,c.openedOn)),0)/l.length;return {days:r2(d),learned:true,n:done.length};}
  const t=(typical||14)*(scales&&avgPE>0?2/avgPE:1);return {days:r2(t),learned:false,n:done.length};}
function runOut(e,today,cd){if(e.inUse&&e.inUse.openedOn)return addD(e.inUse.openedOn,Math.round(cd));return (e.spares||0)>0?addD(today,Math.round(cd)):today;}
function buyPlan(e,{today,tripEnd,cd,upp}){const ro=runOut(e,today,cd);const after=Math.max(0,diffD(tripEnd,ro));const unitsNeeded=Math.ceil(after/cd-1e-9);
  const buyUnits=Math.max(0,unitsNeeded+(e.par??1)-(e.spares||0));const buyPackages=Math.ceil(buyUnits/Math.max(1,upp||1)-1e-9);
  return {runOut:ro,unitsNeeded,buyUnits,buyPackages,urgent:buyPackages>0&&ro<tripEnd&&(e.spares||0)<=0};}

// Waste. paid is the price of one package; q and pkg share a unit.
function wasteCost(paidPerPkg,q,pkg){return r2((paidPerPkg||0)*q/Math.max(1e-9,pkg||1));}

// Calendar map. Each source is a list of {date, key, ...}. Spoil items count once per key per day.
function dayMap(src){const M={};const at=k=>M[k]=M[k]||{spoil:new Map(),ess:[],receipts:[],meals:[]};
  for(const x of src.spoil||[])if(x.date){const d=at(x.date);if(!d.spoil.has(x.key))d.spoil.set(x.key,x);else d.spoil.get(x.key).more=(d.spoil.get(x.key).more||0)+1;}
  for(const x of src.ess||[])if(x.date)at(x.date).ess.push(x);for(const x of src.receipts||[])if(x.date)at(x.date).receipts.push(x);for(const x of src.meals||[])if(x.date)at(x.date).meals.push(x);return M;}
function badgeText(n){return n>9?'9+':String(n);}

// Calendar file. Stable UIDs, so exporting again replaces the same events.
function ics(events,stamp){const f=k=>k.replace(/-/g,'');const esc=s=>String(s).replace(/[\\,;]/g,m=>'\\'+m).replace(/\n/g,'\\n');
  const L=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Meal Prep//Household//EN','METHOD:PUBLISH'];
  for(const e of events)L.push('BEGIN:VEVENT',`UID:${e.uid}`,`DTSTAMP:${stamp}`,...(e.seq!=null?[`SEQUENCE:${e.seq}`]:[]),`DTSTART;VALUE=DATE:${f(e.date)}`,`DTEND;VALUE=DATE:${f(addD(e.date,1))}`,`SUMMARY:${esc(e.summary)}`,...(e.desc?[`DESCRIPTION:${esc(e.desc)}`]:[]),'BEGIN:VALARM','TRIGGER:-PT15H','ACTION:DISPLAY',`DESCRIPTION:${esc(e.summary)}`,'END:VALARM','END:VEVENT');
  L.push('END:VCALENDAR');return L.join('\r\n');}

// Cost split. meals: [{cost, shares:{memberId:pe}}]; rest is split by each member's person-days.
function costSplit(members,meals,rest,pedBy){const out={};for(const m of members)out[m.id]=0;let guests=0;
  for(const x of meals){const tot=Object.values(x.shares).reduce((a,b)=>a+b,0)+(x.guests||0);if(tot<=0)continue;for(const id in x.shares)if(id in out)out[id]+=x.cost*x.shares[id]/tot;guests+=x.cost*(x.guests||0)/tot;}
  const pt=Object.values(pedBy).reduce((a,b)=>a+b,0);if(pt>0)for(const id in out)out[id]+=rest*(pedBy[id]||0)/pt;
  for(const id in out)out[id]=r2(out[id]);return {byMember:out,guests:r2(guests)};}

// Starter list for "What do you keep around?". Prices are estimates except bath tissue.
const STARTER=[
 ['kitchen','Kitchen trash bags','bag',40,4,5.49],['kitchen','Large trash bags','bag',20,10,6.99],['kitchen','Parchment paper','roll',1,45,3.49],['kitchen','Aluminum foil','roll',1,40,3.99],['kitchen','Plastic wrap','roll',1,60,2.99],
 ['kitchen','Sandwich bags','bag',100,30,2.49],['kitchen','Gallon bags','bag',30,30,2.99],['kitchen','Dish soap','bottle',1,30,2.29],['kitchen','Dishwasher pods','pod',40,1,8.99],['kitchen','Sponges','sponge',6,14,2.99],
 ['paper','Paper towels','roll',6,9,7.99,true],['paper','Toilet paper','roll',12,4,8.49,true,'actual'],['paper','Facial tissues','box',4,10,4.99,true],['paper','Napkins','pack',1,30,2.49,true],
 ['cleaning','Laundry detergent','bottle',1,40,8.99,true],['cleaning','Dryer sheets','box',1,60,3.49,true],['cleaning','All-purpose cleaner','bottle',1,45,2.99],['cleaning','Hand soap','bottle',1,21,1.99,true],
 ['personal','Toothpaste','tube',1,40,2.49,true],['personal','Toothbrushes','brush',2,90,2.99,true],['personal','Floss','pack',1,60,1.99,true],['personal','Mouthwash','bottle',1,30,3.99,true],['personal','Shampoo','bottle',1,45,3.99,true],
 ['personal','Conditioner','bottle',1,50,3.99,true],['personal','Body wash','bottle',1,30,3.99,true],['personal','Deodorant','stick',1,45,2.99,false],['personal','Razors','razor',4,28,6.99,false]
].map(([group,name,unit,upp,typical,price,scales,src])=>({key:'h_'+name.toLowerCase().replace(/[^a-z]+/g,'_'),group,name,unit,upp,typical,price,scales:!!scales,src:src||'estimate',owner:group==='personal'&&scales===false?'personal':'shared'}));
const ESS_GROUPS=[['kitchen','Kitchen supplies'],['paper','Paper'],['cleaning','Cleaning'],['personal','Personal care']];

// 6.2: portions in words, rounded to the nearest quarter.
const FR={0:'',.25:'¼',.5:'½',.75:'¾'};
function fracText(x){const q=Math.round((+x||0)*4)/4;const w=Math.floor(q+1e-9),f=Math.round((q-w)*100)/100;if(!w&&!f)return '0';return (w?String(w):'')+(FR[f]||'');}
function portionWords(x,exact){const t=fracText(x);const q=Math.round((+x||0)*4)/4;return `${exact||Math.abs(q-(+x||0))<1e-6?'':'about '}${t} portion${q===1?'':'s'}`;}
// 6.2 WP35: pull past the last day card. Finger travel → card travel, threshold.
const PULL_AT=96;function pullOffset(dx){return dx>0?Math.round(dx*.4):0;}function pullReady(dx){return dx>=PULL_AT;}
// 6.2 WP37: evening-check chips. c: [{id,wd:[weekdays logged],lastWd:'YYYY-MM-DD'|null,stocked,opened,dueIn}]
function rankChips(c,wd,today,max){const sc=x=>{const sameWd=(x.wd||[]).includes(wd);const fresh=x.lastWd&&diffD(today,x.lastWd)<=14;return (sameWd&&fresh?100:sameWd?25:0)+(x.stocked||x.opened?30:0)+(x.dueIn!=null&&x.dueIn<=3?20-x.dueIn:0);};
  return c.map(x=>({...x,score:sc(x)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,max||8);}
window.HouseCore={fracText,portionWords,PULL_AT,pullOffset,pullReady,rankChips,MEALS,AGE,AGE_LABEL,COLORS,FLAGS,FLAG_LABEL,GROUPS,LIKE_W,DISLIKE_W,appetiteLabel,newMember,flagParse,expand,present,PE,servings,dayPE,typicalPE,portionsPerMeal,PED,budgetHint,scaleBudget,
  recipeFlags,suits,entryHits,conflicts,prefScore,usualEaters,essStatus,ESS_LABEL,cycleInfo,runOut,buyPlan,wasteCost,dayMap,badgeText,ics,costSplit,STARTER,ESS_GROUPS,q4,addD,diffD};
})();
