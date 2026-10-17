// Shared by tools/catalog-builder and the conversion script. Reads the v4 master workbook by header name.
(function(){
const MEALS=['breakfast','lunch','snack','dinner'];
const STORAGE=['fridge','freezer','pantry','counter'];
const TRACKING=['quantity','staple','stocked'];const SOLD_BY=['pack','weight'];
const SCHEMA=1;
const norm=s=>String(s==null?'':s).trim().toLowerCase().replace(/\s+/g,'_');
function rowsOf(X,wb,name){const key=Object.keys(wb.Sheets).find(n=>norm(n)===norm(name));if(!key)return null;
  return X.utils.sheet_to_json(wb.Sheets[key],{defval:null}).map(r=>{const o={};for(const k in r)o[norm(k)]=r[k];return o;});}
const blank=v=>v==null||String(v).trim()==='';
const num=v=>blank(v)||isNaN(+v)?null:+v;
const yn=v=>blank(v)?null:String(v).trim().toUpperCase();
const str=v=>blank(v)?'':String(v).trim();
function dateStr(v){if(blank(v))return null;if(typeof v==='number'){const d=new Date(Math.round((v-25569)*864e5));return d.toISOString().slice(0,10);}const d=new Date(v);return isNaN(d)?null:d.toISOString().slice(0,10);}

function build(X,wb,prev,today){
  today=today||new Date().toISOString().slice(0,10);
  const errors=[],warnings=[];const E=(m)=>errors.push(m),W=(m)=>warnings.push(m);
  const itemsR=rowsOf(X,wb,'Items'),recR=rowsOf(X,wb,'Recipes'),ingR=rowsOf(X,wb,'Ingredients'),aliasR=rowsOf(X,wb,'Receipt aliases')||[],listR=rowsOf(X,wb,'Lists'),catR=rowsOf(X,wb,'Categories');
  if(!itemsR)E('No "Items" sheet found.');if(!recR)E('No "Recipes" sheet found.');if(!ingR)E('No "Ingredients" sheet found.');
  if(errors.length)return {errors,warnings};
  let TAGS=null;if(listR){const t=listR.map(r=>str(r.tags).toLowerCase()).filter(Boolean);if(t.length)TAGS=new Set(t);}
  // categories
  const categories=[];const CATS={};
  if(catR){catR.forEach((r,i)=>{const name=str(r.category);if(!name)return;const line=`Categories row ${i+2}`;
      if(CATS[name.toLowerCase()]){E(`${line}: category "${name}" is listed twice.`);return;}
      const storage=str(r.storage).toLowerCase()||'pantry';if(!STORAGE.includes(storage))E(`${line} (${name}): storage "${r.storage}" isn't one of ${STORAGE.join(', ')}.`);
      const tr=str(r.tracking_default).toLowerCase()||'quantity';if(!TRACKING.includes(tr))E(`${line} (${name}): tracking_default "${r.tracking_default}" isn't one of ${TRACKING.join(', ')}.`);
      const c={name,section:str(r.store_section)||name,storage,fridge:num(r.fridge_days),freezer:num(r.freezer_days),pantry:num(r.pantry_days),tracking:tr,staple:yn(r.staple_default)==='Y'};
      CATS[name.toLowerCase()]=c;categories.push(c);});}
  else W('No "Categories" sheet. Items you add on the phone will use built-in defaults.');
  // items
  const items=[],iSeen=new Set(),noSold=[];
  itemsR.forEach((r,i)=>{const id=str(r.item_id);const line=`Items row ${i+2}`;if(!id)return;
    if(iSeen.has(id)){E(`${line}: duplicate item_id "${id}".`);return;}iSeen.add(id);
    if(!/^[a-z0-9_]+$/.test(id))E(`${line}: item_id "${id}" should be lowercase letters, numbers and underscores.`);
    const retired=yn(r.retired)==='Y';
    for(const k of ['staple','retired'])if(!blank(r[k])&&!['Y','N'].includes(yn(r[k])))E(`${line} (${id}): ${k} must be Y or N.`);
    const storage=str(r.storage).toLowerCase()||null;if(storage&&!STORAGE.includes(storage))E(`${line} (${id}): storage "${r.storage}" isn't one of ${STORAGE.join(', ')}.`);
    const price=num(r.price);if(!retired&&!(price>0))E(`${line} (${id}): price is missing, zero or not a number.`);
    const pkg=num(r.package_qty);if(!retired&&!(pkg>0))E(`${line} (${id}): package_qty is missing or zero.`);
    const catName=str(r.category)||'Pantry';if(catR&&!CATS[catName.toLowerCase()])E(`${line} (${id}): category "${catName}" isn't on the Categories sheet.`);
    const sb=str(r.sold_by).toLowerCase();if(!retired&&!sb)noSold.push(id);else if(sb&&!SOLD_BY.includes(sb))E(`${line} (${id}): sold_by "${r.sold_by}" must be pack or weight.`);
    const tr=str(r.tracking_default).toLowerCase();if(tr&&!TRACKING.includes(tr))E(`${line} (${id}): tracking_default "${r.tracking_default}" isn't one of ${TRACKING.join(', ')}.`);
    const it={id,name:str(r.name)||id,cat:catName,family:str(r.family).toLowerCase()||null,soldBy:sb||null,altSizes:str(r.alt_sizes).split(/[;,]/).map(s=>+s.trim()).filter(n=>n>0),tracking:tr||null,pack:str(r.package_label),unit:str(r.unit)||'each',pkg:pkg||1,price:price||0,src:str(r.price_source),priceDate:dateStr(r.price_date),
      staple:yn(r.staple)==='Y',storage,fridge:num(r.fridge_days),freezer:num(r.freezer_days),pantry:num(r.pantry_days),aldi:str(r.aldi_product),nums:str(r.aldi_numbers).split(/[;,\s]+/).map(x=>x.trim()).filter(Boolean),retired,replacedBy:str(r.replaced_by)||null};
    if(!retired&&!it.staple&&(storage==='fridge'||storage==='counter')&&it.fridge==null&&it.pantry==null)W(`${id}: perishable with no shelf-life days.`);
    if(!retired&&(!it.priceDate||(new Date(today)-new Date(it.priceDate))/864e5>30))W(`${id}: price_date ${it.priceDate||'missing'} is over 30 days old.`);
    for(const n of it.nums)if(!/^\d{4,8}$/.test(n))W(`${id}: aldi_numbers "${n}" isn't 4 to 8 digits.`);
    items.push(it);});
  {const seen={};for(const it of items)for(const n of it.nums){if(seen[n]&&seen[n]!==it.id)W(`Item number ${n} is on both ${seen[n]} and ${it.id}.`);seen[n]=it.id;}}
  if(catR&&noSold.length)W(`${noSold.length} item${noSold.length===1?'':'s'} have no sold_by (pack or weight): ${noSold.slice(0,12).join(', ')}${noSold.length>12?', …':''}.`);
  const I=Object.fromEntries(items.map(x=>[x.id,x]));
  for(const it of items)if(it.replacedBy&&!I[it.replacedBy])E(`${it.id}: replaced_by "${it.replacedBy}" isn't an item_id.`);
  if(prev&&prev.items)for(const p of prev.items)if(!I[p.id])E(`Item "${p.id}" was in the last catalog and is now gone. Mark it retired instead of deleting it.`);
  // recipes
  const recipes=[],rSeen=new Set();const R={};
  recR.forEach((r,i)=>{const id=str(r.recipe_id);const line=`Recipes row ${i+2}`;if(!id)return;
    if(rSeen.has(id)){E(`${line}: duplicate recipe_id "${id}".`);return;}rSeen.add(id);
    const active=yn(r.active)!=='N';
    for(const k of ['reheats','freezes','active'])if(!blank(r[k])&&!['Y','N'].includes(yn(r[k])))E(`${line} (${id}): ${k} must be Y or N.`);
    const meal=str(r.meal).toLowerCase();const serv=num(r.servings),total=num(r.total_min),hands=num(r.hands_on_min);
    const tags=str(r.tags).split(',').map(t=>t.trim().toLowerCase()).filter(Boolean);
    if(active){if(!MEALS.includes(meal))E(`${line} (${id}): meal "${r.meal||''}" isn't one of ${MEALS.join(', ')}.`);
      if(!(serv>0))E(`${line} (${id}): servings missing.`);if(!(total>0))E(`${line} (${id}): total_min missing.`);
      if(hands!=null&&total!=null&&hands>total)W(`${id}: hands_on_min (${hands}) is more than total_min (${total}).`);
      if(TAGS)for(const t of tags)if(!TAGS.has(t))E(`${line} (${id}): tag "${t}" isn't on the Lists sheet.`);}
    const src=str(r.source);
    const rec={id,meal,name:str(r.name)||id,tags,serv:serv||1,link:str(r.link),source:src.split(' · ')[0],rating:src.split(' · ').slice(1).join(' · '),ing:[],notes:str(r.notes),
      hands:hands??total,total,keeps:num(r.keeps_days)??1,reheats:yn(r.reheats)==='Y',freezes:yn(r.freezes)==='Y',active};
    R[id]=rec;recipes.push(rec);});
  // ingredients
  const seenLine=new Set();
  ingR.forEach((r,i)=>{const rid=str(r.recipe_id),iid=str(r.item_id);const line=`Ingredients row ${i+2}`;if(!rid&&!iid)return;
    const rec=R[rid];if(!rec){E(`${line}: recipe_id "${rid}" isn't on the Recipes sheet.`);return;}
    if(!I[iid]){E(`${line} (${rid}): item_id "${iid}" isn't on the Items sheet.`);return;}
    if(!blank(r.optional)&&!['Y','N'].includes(yn(r.optional)))E(`${line} (${rid}): optional must be Y or N.`);
    const k=rid+'|'+iid;if(seenLine.has(k)){if(rec.active)E(`${line}: ${rid} lists ${iid} twice. Add the amounts into one row.`);}seenLine.add(k);
    let qps=num(r.qty_per_serving);const q=num(r.qty);if(qps==null&&q!=null)qps=q/(rec.serv||1);
    if(qps==null||!(qps>0)){E(`${line} (${rid}, ${iid}): qty missing.`);return;}
    if(rec.active&&qps>3*I[iid].pkg)W(`${rid}: ${iid} uses ${Math.round(qps*100)/100} ${I[iid].unit} per serving, more than 3 packages. Check the unit.`);
    if(rec.active&&I[iid].retired)W(`${rid}: uses retired item ${iid}${I[iid].replacedBy?` (replaced by ${I[iid].replacedBy})`:''}.`);
    const opt=yn(r.optional)==='Y';rec.ing.push(opt?[iid,qps,str(r.as_written),1]:[iid,qps,str(r.as_written)]);});
  for(const rec of recipes)if(rec.active&&!rec.ing.length)E(`${rec.id}: no ingredients.`);
  {const bare=recipes.filter(r=>r.active&&!r.link&&!r.notes).map(r=>r.id);if(bare.length)W(`${bare.length} recipe${bare.length===1?' has':'s have'} no notes and no link: ${bare.slice(0,10).join(', ')}${bare.length>10?', …':''}.`);}
  const used=new Set();for(const rec of recipes)if(rec.active)for(const x of rec.ing)used.add(x[0]);
  const unused=items.filter(it=>!it.retired&&!it.staple&&!used.has(it.id)).map(it=>it.id);if(unused.length)W(`${unused.length} item${unused.length===1?'':'s'} no active recipe uses: ${unused.join(', ')}.`);
  const aliases=aliasR.map(r=>({text:str(r.receipt_text),item:str(r.item_id)})).filter(a=>a.text&&a.item);
  for(const a of aliases)if(a.item!=='ignore'&&!I[a.item])E(`Receipt alias "${a.text}" points to unknown item "${a.item}".`);
  const d=new Date();const pad=n=>String(n).padStart(2,'0');
  const catalog={schemaVersion:SCHEMA,catalogVersion:`${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`,builtAt:d.toISOString(),
    categories,items,recipes:recipes.filter(r=>r.active).map(({active,...r})=>r),aliases};
  return {catalog,errors,warnings,diff:diff(prev,catalog),counts:{items:items.length,recipes:recipes.length,active:catalog.recipes.length,ingredients:ingR.length,aliases:aliases.length}};
}
const sig=r=>JSON.stringify([r.meal,r.name,r.tags,r.serv,r.link,r.ing,r.hands,r.total,r.keeps,r.reheats,r.freezes]);
function diff(prev,next){if(!prev)return null;const pI=Object.fromEntries((prev.items||[]).map(x=>[x.id,x])),pR=Object.fromEntries((prev.recipes||[]).map(x=>[x.id,x]));
  const nR=new Set(next.recipes.map(r=>r.id));
  return {pricesChanged:next.items.filter(x=>pI[x.id]&&Math.abs(pI[x.id].price-x.price)>.001).map(x=>({id:x.id,name:x.name,from:pI[x.id].price,to:x.price})),
    itemsAdded:next.items.filter(x=>!pI[x.id]).map(x=>x.id),itemsRetired:next.items.filter(x=>x.retired&&pI[x.id]&&!pI[x.id].retired).map(x=>x.id),
    recipesAdded:next.recipes.filter(r=>!pR[r.id]).map(r=>r.id),recipesChanged:next.recipes.filter(r=>pR[r.id]&&sig(pR[r.id])!==sig(r)).map(r=>r.id),
    recipesRemoved:(prev.recipes||[]).filter(r=>!nR.has(r.id)).map(r=>r.id)};}
function validateCatalog(c,knownSchema){if(!c||typeof c!=='object')return 'Not a catalog file.';if(!(c.schemaVersion<=knownSchema))return `Catalog format ${c.schemaVersion} is newer than this app understands.`;
  if(!Array.isArray(c.items)||!Array.isArray(c.recipes))return 'Catalog is missing items or recipes.';const I=new Set(c.items.map(x=>x.id));
  for(const r of c.recipes)for(const x of r.ing)if(!I.has(x[0]))return `Recipe ${r.id} uses unknown item ${x[0]}.`;return null;}
// WP15c: phone additions → rows to paste into the spreadsheet
function headersOf(X,wb,name){const key=Object.keys(wb.Sheets).find(n=>norm(n)===norm(name));if(!key)return null;const h=(X.utils.sheet_to_json(wb.Sheets[key],{header:1})[0]||[]).map(norm).filter(Boolean);return h.length?h:null;}
const nname=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const slug=s=>nname(s).replace(/ /g,'_').slice(0,40);
const DEF_H={items:['item_id','name','category','package_label','unit','package_qty','price','price_source','price_date','staple','storage','fridge_days','freezer_days','pantry_days','family','sold_by','alt_sizes','tracking_default','aldi_product','aldi_numbers','retired','replaced_by','notes'],
  recipes:['recipe_id','meal','name','tags','servings','total_min','hands_on_min','keeps_days','reheats','freezes','link','source','notes','active'],ingredients:['recipe_id','item_id','qty','as_written','optional'],aliases:['receipt_text','item_id']};
const rsig=r=>{const m={};for(const x of (r.ing||[])){const k=x[0]+'|'+(x[3]?1:0);m[k]=Math.round(((m[k]||0)+x[1])*1e4)/1e4;}return JSON.stringify([r.meal,r.name,(r.tags||[]).slice().sort(),r.serv,Object.entries(m).sort()]);};
function additions(X,wb,add,built){
  if(!add||add.app!=='aldi-meal-prep-additions')return {error:"That isn't an additions file from the app. In the app, open Settings and tap Export my additions."};
  const cat=built&&built.catalog;if(!cat)return {error:'Fix the spreadsheet errors first. The additions are checked against it.'};
  const flags=[],notes=[];const F=(m)=>flags.push(m);
  const H={items:headersOf(X,wb,'Items')||DEF_H.items,recipes:headersOf(X,wb,'Recipes')||DEF_H.recipes,ingredients:headersOf(X,wb,'Ingredients')||DEF_H.ingredients,aliases:headersOf(X,wb,'Receipt aliases')||DEF_H.aliases};
  const wholeQty=H.ingredients.includes('qty')||!H.ingredients.includes('qty_per_serving');
  const I=Object.fromEntries(cat.items.map(x=>[x.id,x]));const byName={};for(const x of cat.items)byName[nname(x.name)]=x;
  const sheetRecipes={};(rowsOf(X,wb,'Recipes')||[]).forEach(r=>{const id=str(r.recipe_id);if(id)sheetRecipes[id]={id,name:str(r.name)};});
  const RC=Object.fromEntries(cat.recipes.map(r=>[r.id,r]));const recNames=new Set(Object.values(sheetRecipes).map(r=>nname(r.name)));
  const merges=add.itemMerges||{};const idMap={};const taken=new Set(Object.keys(I));const items=[];
  for(const u of (add.ownItems||[])){const hit=byName[nname(u.name)];
    if(hit){idMap[u.id]=hit.id;if(hit.id!==u.id.replace(/^u_/,''))F(`Name collision: your item "${u.name}" matches catalog item "${hit.name}" (${hit.id}). Not added again; your recipes and aliases use ${hit.id}.`);else notes.push(`${u.name} is already in the spreadsheet.`);continue;}
    let id=u.id.replace(/^u_/,'')||slug(u.name);if(!/^[a-z0-9_]+$/.test(id))id=slug(u.name)||'item';let base=id,n=2;while(taken.has(id))id=base+'_'+(n++);taken.add(id);idMap[u.id]=id;
    items.push({item_id:id,name:u.name,category:u.cat||'Other',package_label:u.pack||'',unit:u.unit||'each',package_qty:u.pkg||1,price:u.price,price_source:u.src==='estimate'?'estimate':'phone',price_date:u.priceDate||String(add.exportedAt||'').slice(0,10),
      staple:u.staple?'Y':'N',storage:u.storage||'',fridge_days:u.fridge??'',freezer_days:u.freezer??'',pantry_days:u.pantry??'',family:u.family||'',sold_by:u.soldBy||'pack',alt_sizes:'',tracking_default:u.tracking||'',aldi_product:'',aldi_numbers:(add.numLinks||[]).filter(x=>x.item===u.id).map(x=>x.num).join(';'),retired:'N',replaced_by:'',notes:'Added on the phone'});}
  const known=new Set([...Object.keys(I),...items.map(x=>x.item_id)]);
  const mapId=id=>{let x=merges[id]||id;x=idMap[x]||x;return x;};
  const recipes=[],ings=[];const rTaken=new Set(Object.keys(sheetRecipes));
  const pushRecipe=(r,id,name,source,note)=>{const lines=[];let bad=false;
    for(const x of (r.ing||[])){const iid=mapId(x[0]);if(!known.has(iid)){F(`Unknown item: "${name}" uses ${x[0]}, which isn't in the spreadsheet or your added items. That ingredient was left out.`);bad=true;continue;}
      const q=wholeQty?Math.round(x[1]*(r.serv||1)*1000)/1000:Math.round(x[1]*1e4)/1e4;lines.push({recipe_id:id,item_id:iid,qty:q,qty_per_serving:Math.round(x[1]*1e4)/1e4,as_written:x[2]||'',optional:x[3]?'Y':'N'});}
    rTaken.add(id);recNames.add(nname(name));
    recipes.push({recipe_id:id,meal:r.meal,name,tags:(r.tags||[]).join(', '),servings:r.serv,total_min:r.total,hands_on_min:r.hands,keeps_days:r.keeps,reheats:r.reheats===false?'N':'Y',freezes:'',link:r.link||'',source,notes:note,active:'Y'});ings.push(...lines);return bad;};
  for(const r of (add.ownRecipes||[])){if(recNames.has(nname(r.name))){notes.push(`${r.name} is already in the spreadsheet.`);continue;}
    let id=(r.meal||'x')[0]+'_'+(r.id.replace(/^u_/,'')||slug(r.name));let base=id,n=2;while(rTaken.has(id))id=base+'_'+(n++);pushRecipe(r,id,r.name,'My recipe','Written on the phone');}
  for(const [oid,e] of Object.entries(add.recipeEdits||{})){const orig=RC[oid];const name=`${e.name} (my version)`;
    if(recNames.has(nname(name))||sheetRecipes[oid+'_mine']){notes.push(`${name} is already in the spreadsheet.`);continue;}
    if(!orig&&!sheetRecipes[oid])F(`Edited recipe ${oid} isn't in the spreadsheet any more. Your version was still added.`);
    else if(orig&&e.base&&rsig(orig)!==rsig(e.base))F(`Catalog changed: "${orig.name}" was changed in the spreadsheet after you made your version. Compare the two before keeping both.`);
    let id=oid+'_mine',n=2;while(rTaken.has(id))id=oid+'_mine'+(n++);pushRecipe(e,id,name,'My version',`My version of ${oid}, edited ${String(e.editedAt||'').slice(0,10)}`);}
  const sheetAl=new Set((cat.aliases||[]).map(a=>String(a.text).toUpperCase().trim()));const aliases=[];
  for(const a of (add.aliases||[])){const t=String(a.text||'').toUpperCase().trim();if(!t||sheetAl.has(t))continue;const it=a.item==='__ignore'?'ignore':mapId(a.item);
    if(it!=='ignore'&&!known.has(it)){F(`Unknown item: receipt name "${t}" points to ${a.item}, which isn't in the spreadsheet. Left out.`);continue;}aliases.push({receipt_text:t,item_id:it});}
  const catNum={};for(const x of cat.items)for(const n of (x.nums||[]))catNum[n]=x.id;const byItem={};const newIds=new Set(items.map(x=>x.item_id));
  for(const {num,item} of (add.numLinks||[])){const it=mapId(item);if(!known.has(it)){F(`Unknown item: number ${num} points to ${item}, which isn't in the spreadsheet. Left out.`);continue;}
    if(newIds.has(it)||catNum[num]===it)continue;if(catNum[num])F(`Number collision: ${num} is on ${catNum[num]} in the spreadsheet, but the phone linked it to ${it}. Keep it on one item only.`);(byItem[it]=byItem[it]||[]).push(num);}
  const numRows=Object.entries(byItem).map(([id,ns])=>({item_id:id,name:(I[id]||{}).name||id,aldi_numbers:[...new Set([...((I[id]&&I[id].nums)||[]),...ns])].join(';')}));
  const prices=[];for(const [id,e] of Object.entries(add.priceEdits||{})){const it=I[id];if(!it)continue;const d=String(e.at||'').slice(0,10);if(Math.abs(it.price-e.price)<.005||(it.priceDate&&d<it.priceDate))continue;prices.push({item_id:id,name:it.name,price:e.price,price_date:d,from:it.price});}
  const tsv=(rows,cols)=>rows.map(r=>cols.map(c=>{const v=r[c];return v==null?'':String(v).replace(/[\t\n]/g,' ');}).join('\t')).join('\n');
  const groups=[
    {key:'items',sheet:'Items',title:'Items you added',rows:items,cols:H.items,list:items.map(x=>x.name)},
    {key:'recipes',sheet:'Recipes',title:'Recipes you wrote or edited',rows:recipes,cols:H.recipes,list:recipes.map(x=>x.name)},
    {key:'ingredients',sheet:'Ingredients',title:'Ingredients for those recipes',rows:ings,cols:H.ingredients,list:[],note:wholeQty?'Quantities are for the whole recipe.':'Quantities are per serving.'},
    {key:'aliases',sheet:'Receipt aliases',title:'Receipt names',rows:aliases,cols:H.aliases,list:aliases.map(x=>x.receipt_text)},
    {key:'numbers',sheet:'Items',title:'Aldi item numbers',rows:numRows,cols:['item_id','name','aldi_numbers'],list:numRows.map(x=>`${x.name}: ${x.aldi_numbers}`),note:'Set aldi_numbers on these Items rows to the value shown. It keeps the numbers already there. Not for pasting as new rows.'},
    {key:'prices',sheet:'Items',title:'Price corrections',rows:prices,cols:['item_id','name','price','price_date'],list:prices.map(x=>`${x.name} $${(+x.from).toFixed(2)} → $${(+x.price).toFixed(2)}`),note:'Update price and price_date on these Items rows. Not for pasting as new rows.'}
  ].map(g=>({...g,tsv:tsv(g.rows,g.cols),header:g.cols.join('\t')}));
  return {groups,flags,notes,from:{exportedAt:add.exportedAt,catalogVersion:add.catalogVersion}};}
const api={build,diff,validateCatalog,additions,SCHEMA,MEALS,STORAGE,TRACKING};
if(typeof window!=='undefined')window.CatalogLib=api;if(typeof module!=='undefined')module.exports=api;
})();
