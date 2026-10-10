// Shared by tools/catalog-builder and the conversion script. Reads the v4 master workbook by header name.
(function(){
const MEALS=['breakfast','lunch','snack','dinner'];
const STORAGE=['fridge','freezer','pantry','counter'];
const FOOD_TYPES=['pork','beef','poultry','fish','shellfish','dairy','egg','gluten','peanut','tree_nut','soy','sesame'],HOUSE_GROUPS=['kitchen','paper','cleaning','personal'];
const TRACKING=['quantity','staple','stocked'];const SOLD_BY=['pack','weight'];
const SCHEMA=2;
const DEFAULT_STORES=[['aldi','Aldi','6','before'],['sams',"Sam's Club",'9;10','before'],['walmart','Walmart','12','after'],['cub','Cub','11;12','after'],['target','Target','9','before']];
const numList=v=>str(v).split(/[;,\s]+/).map(x=>x.trim()).filter(Boolean);
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
  const offR=rowsOf(X,wb,'Offers')||[],nodeR=rowsOf(X,wb,'Nodes')||[],storeR=rowsOf(X,wb,'Stores'),favR=rowsOf(X,wb,'Favorites')||[];
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
  // stores
  const stores=[],ST={};
  (storeR||DEFAULT_STORES.map(x=>({id:x[0],name:x[1],num_digits:x[2],num_where:x[3]}))).forEach((r,i)=>{const id=str(r.id).toLowerCase();if(!id)return;
    if(ST[id]){E(`Stores row ${i+2}: store "${id}" is listed twice.`);return;}
    const st={id,name:str(r.name)||id,num:{digits:numList(r.num_digits).map(x=>parseInt(x,10)).filter(n=>n>0),where:str(r.num_where).toLowerCase()==='after'?'after':'before'}};ST[id]=st;stores.push(st);});
  if(!ST.aldi)E('The Stores sheet has no "aldi" row. Older phones need it.');
  // nodes: 1 Category, 2 Type, 3 Form, 4 Variety, 5 Style. A node may skip levels.
  const nodes=[],ND={};
  nodeR.forEach((r,i)=>{const id=str(r.id),line=`Nodes row ${i+2}`;if(!id)return;if(ND[id]){E(`${line}: node "${id}" is listed twice.`);return;}
    if(!/^n_[a-z0-9_]+$/.test(id))E(`${line}: node id "${id}" should start with n_ and use lowercase letters, numbers and _.`);
    const level=num(r.level);if(!(level>=1&&level<=5&&level===Math.round(level)))E(`${line} (${id}): level must be 1 to 5.`);
    const n={id,name:str(r.name)||id,parent:str(r.parent)||null,level:level||1};ND[id]=n;nodes.push(n);});
  for(const n of nodes){if(n.parent&&!ND[n.parent])E(`Node ${n.id}: parent "${n.parent}" isn't on the Nodes sheet.`);else if(n.parent&&ND[n.parent].level>=n.level)E(`Node ${n.id} (level ${n.level}) sits under ${n.parent} (level ${ND[n.parent].level}). A parent must have a lower level.`);
    if(n.level===1&&n.parent)E(`Node ${n.id} is level 1 but has a parent.`);
    const up=new Set();let cur=n,h=0;while(cur&&cur.parent&&h++<10){if(up.has(cur.id))break;up.add(cur.id);cur=ND[cur.parent];if(cur&&cur.id===n.id){E(`Node ${n.id} is its own ancestor (a loop in parent).`);break;}}}
  // offers: one row per item per store. Once the sheet has any Aldi offer row, prices live there (the script's "Move prices to Offers").
  const OF={};const MIG=offR.some(r=>str(r.store).toLowerCase()==='aldi');
  offR.forEach((r,i)=>{const item=str(r.item),store=str(r.store).toLowerCase(),line=`Offers row ${i+2}`;if(!item&&!store)return;
    if(!store||!ST[store]){E(`${line} (${item}): store "${r.store||''}" isn't on the Stores sheet.`);return;}
    const o={store,price:num(r.price),pack:str(r.pack),unit:str(r.unit),pkg:num(r.pkg),nums:numList(r.numbers),priceDate:dateStr(r.price_date),src:str(r.price_source),_line:line};
    const list=OF[item]||(OF[item]=[]);if(list.some(x=>x.store===store)){E(`${line}: ${item} has two rows for ${store}. Keep one.`);return;}list.push(o);});
  // items
  const items=[],iSeen=new Set(),noSold=[];
  itemsR.forEach((r,i)=>{const id=str(r.item_id);const line=`Items row ${i+2}`;if(!id)return;
    if(iSeen.has(id)){E(`${line}: duplicate item_id "${id}".`);return;}iSeen.add(id);
    if(!/^[a-z0-9_]+$/.test(id))E(`${line}: item_id "${id}" should be lowercase letters, numbers and underscores.`);
    const retired=yn(r.retired)==='Y';
    for(const k of ['staple','retired'])if(!blank(r[k])&&!['Y','N'].includes(yn(r[k])))E(`${line} (${id}): ${k} must be Y or N.`);
    const storage=str(r.storage).toLowerCase()||null;if(storage&&!STORAGE.includes(storage))E(`${line} (${id}): storage "${r.storage}" isn't one of ${STORAGE.join(', ')}.`);
    const price=num(r.price),pkg=num(r.package_qty);
    const catName=str(r.category)||'Pantry';if(catR&&!CATS[catName.toLowerCase()])E(`${line} (${id}): category "${catName}" isn't on the Categories sheet.`);
    const sb=str(r.sold_by).toLowerCase();if(!retired&&!sb)noSold.push(id);else if(sb&&!SOLD_BY.includes(sb))E(`${line} (${id}): sold_by "${r.sold_by}" must be pack or weight.`);
    const tr=str(r.tracking_default).toLowerCase();if(tr&&!TRACKING.includes(tr))E(`${line} (${id}): tracking_default "${r.tracking_default}" isn't one of ${TRACKING.join(', ')}.`);
    const it={id,name:str(r.name)||id,cat:catName,family:str(r.family).toLowerCase()||null,soldBy:sb||null,altSizes:str(r.alt_sizes).split(/[;,]/).map(s=>+s.trim()).filter(n=>n>0),tracking:tr||null,pack:str(r.package_label),unit:str(r.unit)||'each',pkg:pkg||1,price:price||0,src:str(r.price_source),priceDate:dateStr(r.price_date),
      staple:yn(r.staple)==='Y',storage,fridge:num(r.fridge_days),freezer:num(r.freezer_days),pantry:num(r.pantry_days),aldi:str(r.aldi_product),nums:numList(r.aldi_numbers),retired,replacedBy:str(r.replaced_by)||null,brand:str(r.brand)||null,node:str(r.node)||null,offers:[]};
    // 6.1: food types and household fields (same rules as the sheet script)
    const ft=str(r.food_types!=null?r.food_types:r.flags).toLowerCase().split(/[;,]/).map(x=>x.trim().replace(/[\s-]+/g,'_')).filter(Boolean);
    for(const f of ft)if(!FOOD_TYPES.includes(f))E(`${line} (${id}): food type "${f}" isn't one of ${FOOD_TYPES.join(', ')}.`);
    if(ft.length)it.flags=[...new Set(ft.filter(f=>FOOD_TYPES.includes(f)))].join(';');
    const grp=str(r.group).toLowerCase();if(grp&&!HOUSE_GROUPS.includes(grp))E(`${line} (${id}): group "${r.group}" isn't one of ${HOUSE_GROUPS.join(', ')} (blank for food).`);
    const upp=num(r.units_per_package),days=num(r.typical_days),sc=yn(r.scales_with_people);
    if(!blank(r.units_per_package)&&!(upp>=1&&upp===Math.round(upp)))E(`${line} (${id}): units_per_package must be a whole number, 1 or more.`);
    if(!blank(r.typical_days)&&!(days>0))E(`${line} (${id}): typical_days must be more than 0.`);
    if(sc&&!['Y','N'].includes(sc))E(`${line} (${id}): scales_with_people must be Y or N.`);
    if(grp&&HOUSE_GROUPS.includes(grp)){Object.assign(it,{group:grp,unit_label:str(r.unit_label)||'unit',units_per_package:upp>=1?Math.round(upp):1,typical_days:days>0?days:14,scales_with_people:sc==='Y'?'Y':'N'});
      if(ft.length)W(`${id}: household item with food types. Food types only matter for food.`);}
    else if(!grp&&['unit_label','units_per_package','typical_days','scales_with_people'].some(k=>!blank(r[k])))W(`${id}: has household columns filled in but no group, so the app treats it as food.`);
    let rows=(OF[id]||[]).map(o=>({store:o.store,price:o.price,pack:o.pack||it.pack,unit:o.unit||it.unit,pkg:o.pkg||it.pkg,nums:o.nums,priceDate:o.priceDate,src:o.src}));
    if(!MIG&&price!=null&&!rows.some(o=>o.store==='aldi'))rows.unshift({store:'aldi',price,pack:it.pack,unit:it.unit,pkg:pkg||1,nums:it.nums,priceDate:it.priceDate,src:it.src});
    rows.sort((a,b)=>a.store==='aldi'?-1:b.store==='aldi'?1:0);it.offers=rows;
    const mirror=rows.find(o=>o.store==='aldi'&&o.price>0)||rows.find(o=>o.price>0);
    if(mirror)Object.assign(it,{price:mirror.price,pack:mirror.pack,unit:mirror.unit,pkg:mirror.pkg,priceDate:mirror.priceDate,src:mirror.src,nums:mirror.nums});
    else it.nums=(rows.find(o=>o.store==='aldi')||{nums:MIG?[]:it.nums}).nums;
    if(!retired&&!(it.price>0))E(`${line} (${id}): price is missing, zero or not a number${MIG?' (add a price on the Offers sheet)':''}.`);
    if(!retired&&!(it.pkg>0))E(`${line} (${id}): package_qty is missing or zero.`);
    if(it.node&&!ND[it.node])E(`${line} (${id}): node "${it.node}" isn't on the Nodes sheet.`);
    if(!retired&&!it.staple&&(storage==='fridge'||storage==='counter')&&it.fridge==null&&it.pantry==null)W(`${id}: perishable with no shelf-life days.`);
    if(!retired&&!it.group&&(!it.priceDate||(new Date(today)-new Date(it.priceDate))/864e5>30))W(`${id}: price_date ${it.priceDate||'missing'} is over 30 days old.`);
    for(const o of it.offers)for(const n of o.nums){if(!/^\d{4,14}$/.test(n))E(`${line} (${id}): ${ST[o.store]?ST[o.store].name:o.store} number "${n}" isn't 4 to 14 digits.`);
      else if(ST[o.store]&&ST[o.store].num.digits.length&&!ST[o.store].num.digits.includes(n.length))W(`${id}: ${ST[o.store].name} number ${n} has ${n.length} digits; that store usually prints ${ST[o.store].num.digits.join(' or ')}.`);}
    items.push(it);});
  for(const item in OF)if(!iSeen.has(item))for(const o of OF[item])E(`${o._line}: item "${item}" isn't on the Items sheet.`);
  {const seen={};for(const it of items)for(const o of it.offers)for(const n of o.nums){const k=o.store+'|'+n;if(seen[k]&&seen[k]!==it.id)E(`${ST[o.store]?ST[o.store].name:o.store} number ${n} is on both ${seen[k]} and ${it.id}. Keep it on one item.`);seen[k]=it.id;}}
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
    if(/^n_/.test(iid)?!ND[iid]:!I[iid]){E(`${line} (${rid}): ${/^n_/.test(iid)?`node "${iid}" isn't on the Nodes sheet.`:`item_id "${iid}" isn't on the Items sheet.`}`);return;}
    if(!blank(r.optional)&&!['Y','N'].includes(yn(r.optional)))E(`${line} (${rid}): optional must be Y or N.`);
    const k=rid+'|'+iid;if(seenLine.has(k)){if(rec.active)E(`${line}: ${rid} lists ${iid} twice. Add the amounts into one row.`);}seenLine.add(k);
    let qps=num(r.qty_per_serving);const q=num(r.qty);if(qps==null&&q!=null)qps=q/(rec.serv||1);
    if(qps==null||!(qps>0)){E(`${line} (${rid}, ${iid}): qty missing.`);return;}
    if(rec.active&&I[iid]&&qps>3*I[iid].pkg)W(`${rid}: ${iid} uses ${Math.round(qps*100)/100} ${I[iid].unit} per serving, more than 3 packages. Check the unit.`);
    if(rec.active&&I[iid]&&I[iid].retired)W(`${rid}: uses retired item ${iid}${I[iid].replacedBy?` (replaced by ${I[iid].replacedBy})`:''}.`);
    const opt=yn(r.optional)==='Y';rec.ing.push(opt?[iid,qps,str(r.as_written),1]:[iid,qps,str(r.as_written)]);});
  for(const rec of recipes)if(rec.active&&!rec.ing.length)E(`${rec.id}: no ingredients.`);
  {const bare=recipes.filter(r=>r.active&&!r.link&&!r.notes).map(r=>r.id);if(bare.length)W(`${bare.length} recipe${bare.length===1?' has':'s have'} no notes and no link: ${bare.slice(0,10).join(', ')}${bare.length>10?', …':''}.`);}
  const used=new Set();for(const rec of recipes)if(rec.active)for(const x of rec.ing)used.add(x[0]);
  const unused=items.filter(it=>!it.retired&&!it.staple&&!it.group&&!used.has(it.id)).map(it=>it.id);if(unused.length)W(`${unused.length} item${unused.length===1?'':'s'} no active recipe uses: ${unused.join(', ')}.`);
  const aliases=aliasR.map(r=>({text:str(r.receipt_text),item:str(r.item_id),store:str(r.store).toLowerCase()})).filter(a=>a.text&&a.item);
  for(const a of aliases){if(a.item!=='ignore'&&!I[a.item])E(`Receipt alias "${a.text}" points to unknown item "${a.item}".`);if(a.store&&!ST[a.store])E(`Receipt alias "${a.text}": store "${a.store}" isn't on the Stores sheet.`);}
  const favorites={};const under=(nid,target)=>{let cur=ND[nid],h=0;while(cur&&h++<10){if(cur.id===target)return true;cur=cur.parent?ND[cur.parent]:null;}return false;};
  favR.forEach((r,i)=>{const node=str(r.node),item=str(r.item);if(!node)return;if(!ND[node]){W(`Favorites row ${i+2}: node "${node}" isn't on the Nodes sheet.`);return;}if(!item)return;
    if(!I[item]){W(`Favorites row ${i+2}: item "${item}" isn't on the Items sheet.`);return;}
    if(!I[item].node||!under(I[item].node,node))W(`Favorites row ${i+2}: ${item} isn't placed under ${node} (its node is ${I[item].node||'blank'}).`);favorites[node]=item;});
  const d=new Date();const pad=n=>String(n).padStart(2,'0');
  const catalog={schemaVersion:SCHEMA,catalogVersion:`${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`,builtAt:d.toISOString(),
    categories,stores,nodes,items,recipes:recipes.filter(r=>r.active).map(({active,...r})=>r),aliases,favorites};
  const offers=items.reduce((n,it)=>n+it.offers.length,0);
  return {catalog,catalogV1:toV1(catalog),errors,warnings,diff:diff(prev&&prev.schemaVersion===1?prev:prev?toV1(prev):null,toV1(catalog)),counts:{items:items.length,offers,stores:stores.length,nodes:nodes.length,recipes:recipes.length,active:catalog.recipes.length,ingredients:ingR.length,aliases:aliases.length}};
}
// The version 1 shape for version 5.3 phones (catalog-v1.json): no stores, nodes, offers or favorites; a recipe
// ingredient that points to a node becomes the favorite product under it, else the cheapest per unit among
// products in the unit most products under that node use. Same rule as the Apps Script.
const V1_ITEM=['id','name','cat','family','soldBy','altSizes','tracking','pack','unit','pkg','price','src','priceDate','staple','storage','fridge','freezer','pantry','aldi','nums','retired','replacedBy','changed'];
function toV1(c){if(!c)return c;if(c.schemaVersion===1&&!c.nodes)return c;
  const I=Object.fromEntries(c.items.map(x=>[x.id,x]));const kids={},depth={};for(const n of (c.nodes||[])){depth[n.id]=n.level;if(n.parent)(kids[n.parent]=kids[n.parent]||[]).push(n.id);}
  const below=id=>{const out=[id],q=[id];let h=0;while(q.length&&h++<500)for(const k of (kids[q.shift()]||[]))if(!out.includes(k)){out.push(k);q.push(k);}return out;};
  const pick=nid=>{const fav=(c.favorites||{})[nid];if(fav&&I[fav]&&!I[fav].retired)return fav;const set=below(nid);
    const cands=c.items.filter(it=>!it.retired&&it.node&&set.includes(it.node)&&it.price>0&&it.pkg>0);if(!cands.length)return null;
    const units={};for(const it of cands){const u=units[it.unit]||(units[it.unit]={n:0,top:9});u.n++;u.top=Math.min(u.top,depth[it.node]||9);}
    const unit=Object.keys(units).sort((a,b)=>units[b].n-units[a].n||units[a].top-units[b].top||(a<b?-1:1))[0];
    let best=null,bp=Infinity;for(const it of cands){if(it.unit!==unit)continue;const per=it.price/it.pkg;if(per<bp-1e-9||(Math.abs(per-bp)<1e-9&&best&&it.name<I[best].name)){best=it.id;bp=per;}}return best;};
  return {schemaVersion:1,catalogVersion:c.catalogVersion,builtAt:c.builtAt,categories:c.categories,
    items:c.items.map(it=>Object.fromEntries(V1_ITEM.filter(k=>k!=='changed'||it.changed!==undefined).map(k=>[k,it[k]===undefined?null:it[k]]))),
    recipes:c.recipes.map(r=>({...r,ing:r.ing.map(x=>{if(!/^n_/.test(x[0]))return x;const id=pick(x[0]);return id?[id,...x.slice(1)]:null;}).filter(Boolean)})),
    aliases:(c.aliases||[]).filter(a=>!a.store||a.store==='aldi').map(a=>({text:a.text,item:a.item}))};}

// A schema 2 catalog back to sheet rows (column name -> value), one array per sheet. Used to check the
// round trip and to rebuild a sheet from a catalog.
function toRows(c){const yn=b=>b?'Y':'N',semi=a=>(a||[]).join('; ');
  const out={Stores:[],Nodes:[],Items:[],Offers:[],Favorites:[],Recipes:[],Ingredients:[],'Receipt aliases':[],Categories:[]};
  for(const k of (c.categories||[]))out.Categories.push({category:k.name,store_section:k.section,storage:k.storage,fridge_days:k.fridge,freezer_days:k.freezer,pantry_days:k.pantry,tracking_default:k.tracking,staple_default:yn(k.staple)});
  for(const s of (c.stores||[]))out.Stores.push({id:s.id,name:s.name,num_digits:(s.num.digits||[]).join(';'),num_where:s.num.where});
  for(const n of (c.nodes||[]))out.Nodes.push({id:n.id,name:n.name,parent:n.parent||'',level:n.level});
  for(const it of c.items){const a=(it.offers||[]).find(o=>o.store==='aldi');
    out.Items.push({item_id:it.id,name:it.name,brand:it.brand||'',node:it.node||'',category:it.cat,package_label:a?a.pack:it.pack,unit:a?a.unit:it.unit,package_qty:a?a.pkg:it.pkg,price:a?a.price:'',price_source:a?a.src:'',price_date:a?a.priceDate:'',
      staple:yn(it.staple),storage:it.storage||'',fridge_days:it.fridge,freezer_days:it.freezer,pantry_days:it.pantry,family:it.family||'',sold_by:it.soldBy||'',alt_sizes:semi(it.altSizes),tracking_default:it.tracking||'',aldi_product:it.aldi||'',aldi_numbers:'',retired:yn(it.retired),replaced_by:it.replacedBy||'',notes:'',
      food_types:it.flags?it.flags.split(';').join('; '):'',group:it.group||'',unit_label:it.group?it.unit_label:'',units_per_package:it.group?it.units_per_package:'',typical_days:it.group?it.typical_days:'',scales_with_people:it.group?it.scales_with_people:''});
    for(const o of (it.offers||[]))out.Offers.push({item:it.id,store:o.store,price:o.price,pack:o.pack,unit:o.unit,pkg:o.pkg,numbers:semi(o.nums),price_date:o.priceDate||'',price_source:o.src||''});}
  for(const n in (c.favorites||{}))out.Favorites.push({node:n,item:c.favorites[n]});
  for(const r of c.recipes){out.Recipes.push({recipe_id:r.id,meal:r.meal,name:r.name,tags:(r.tags||[]).join(', '),servings:r.serv,total_min:r.total,hands_on_min:r.hands,keeps_days:r.keeps,reheats:yn(r.reheats),freezes:yn(r.freezes),link:r.link||'',source:[r.source,r.rating].filter(Boolean).join(' · '),notes:r.notes||'',active:'Y'});
    for(const x of r.ing)out.Ingredients.push({recipe_id:r.id,item_id:x[0],qty:x[1]*(r.serv||1),as_written:x[2]||'',optional:yn(x[3])});}
  for(const a of (c.aliases||[]))out['Receipt aliases'].push({receipt_text:a.text,item_id:a.item,store:a.store||''});
  return out;}
const sig=r=>JSON.stringify([r.meal,r.name,r.tags,r.serv,r.link,r.ing,r.hands,r.total,r.keeps,r.reheats,r.freezes]);
function diff(prev,next){if(!prev)return null;const pI=Object.fromEntries((prev.items||[]).map(x=>[x.id,x])),pR=Object.fromEntries((prev.recipes||[]).map(x=>[x.id,x]));
  const nR=new Set(next.recipes.map(r=>r.id));
  return {pricesChanged:next.items.filter(x=>pI[x.id]&&Math.abs(pI[x.id].price-x.price)>.001).map(x=>({id:x.id,name:x.name,from:pI[x.id].price,to:x.price})),
    itemsAdded:next.items.filter(x=>!pI[x.id]).map(x=>x.id),itemsRetired:next.items.filter(x=>x.retired&&pI[x.id]&&!pI[x.id].retired).map(x=>x.id),
    recipesAdded:next.recipes.filter(r=>!pR[r.id]).map(r=>r.id),recipesChanged:next.recipes.filter(r=>pR[r.id]&&sig(pR[r.id])!==sig(r)).map(r=>r.id),
    recipesRemoved:(prev.recipes||[]).filter(r=>!nR.has(r.id)).map(r=>r.id)};}
function validateCatalog(c,knownSchema){if(!c||typeof c!=='object')return 'Not a catalog file.';if(!(c.schemaVersion<=knownSchema))return `Catalog format ${c.schemaVersion} is newer than this app understands.`;
  if(!Array.isArray(c.items)||!Array.isArray(c.recipes))return 'Catalog is missing items or recipes.';const I=new Set(c.items.map(x=>x.id)),N=new Set((c.nodes||[]).map(x=>x.id));
  for(const r of c.recipes)for(const x of r.ing)if(!I.has(x[0])&&!N.has(x[0]))return `Recipe ${r.id} uses unknown item ${x[0]}.`;return null;}
// WP15c: phone additions → rows to paste into the spreadsheet
function headersOf(X,wb,name){const key=Object.keys(wb.Sheets).find(n=>norm(n)===norm(name));if(!key)return null;const h=(X.utils.sheet_to_json(wb.Sheets[key],{header:1})[0]||[]).map(norm).filter(Boolean);return h.length?h:null;}
const nname=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const slug=s=>nname(s).replace(/ /g,'_').slice(0,40);
const DEF_H={items:['item_id','name','brand','node','category','package_label','unit','package_qty','price','price_source','price_date','staple','storage','fridge_days','freezer_days','pantry_days','family','sold_by','alt_sizes','tracking_default','aldi_product','aldi_numbers','retired','replaced_by','notes','food_types','group','unit_label','units_per_package','typical_days','scales_with_people'],
  offers:['item','store','price','pack','unit','pkg','numbers','price_date','price_source','last_changed','changed_by'],nodes:['id','name','parent','level','last_changed','changed_by'],favorites:['node','item','last_changed'],
  recipes:['recipe_id','meal','name','tags','servings','total_min','hands_on_min','keeps_days','reheats','freezes','link','source','notes','active'],ingredients:['recipe_id','item_id','qty','as_written','optional'],aliases:['receipt_text','item_id','store']};
// Accepts arrays or objects keyed by id for the version 6 export sections.
const asList=(v,key,val)=>Array.isArray(v)?v:v&&typeof v==='object'?Object.entries(v).map(([k,x])=>x&&typeof x==='object'&&!Array.isArray(x)?{[key]:k,...x}:{[key]:k,[val]:x}):[];
const rsig=r=>{const m={};for(const x of (r.ing||[])){const k=x[0]+'|'+(x[3]?1:0);m[k]=Math.round(((m[k]||0)+x[1])*1e4)/1e4;}return JSON.stringify([r.meal,r.name,(r.tags||[]).slice().sort(),r.serv,Object.entries(m).sort()]);};
function additions(X,wb,add,built){
  if(!add||add.app!=='aldi-meal-prep-additions')return {error:"That isn't an additions file from the app. In the app, open Settings and tap Export my additions."};
  const cat=built&&built.catalog;if(!cat)return {error:'Fix the spreadsheet errors first. The additions are checked against it.'};
  const flags=[],notes=[];const F=(m)=>flags.push(m);
  const H={items:headersOf(X,wb,'Items')||DEF_H.items,recipes:headersOf(X,wb,'Recipes')||DEF_H.recipes,ingredients:headersOf(X,wb,'Ingredients')||DEF_H.ingredients,aliases:headersOf(X,wb,'Receipt aliases')||DEF_H.aliases,
    offers:headersOf(X,wb,'Offers')||DEF_H.offers,nodes:headersOf(X,wb,'Nodes')||DEF_H.nodes,favorites:headersOf(X,wb,'Favorites')||DEF_H.favorites};
  const ND=Object.fromEntries((cat.nodes||[]).map(n=>[n.id,n]));const today=String(add.exportedAt||'').slice(0,10);
  // nodes the phone made: u_n_x -> n_x (a node with the same name under the same parent is reused)
  const nodeMap={};const nTaken=new Set(Object.keys(ND));const nodes=[];
  const mapNode=id=>id?(nodeMap[id]||id):'';
  for(const n of asList(add.nodes,'id','name')){if(!n.id)continue;const parent=mapNode(n.parent);
    const same=(cat.nodes||[]).find(x=>nname(x.name)===nname(n.name)&&(x.parent||'')===(parent||''))||nodes.find(x=>nname(x.name)===nname(n.name)&&x.parent===parent);
    if(same){nodeMap[n.id]=same.id;notes.push(`${n.name} is already in the tree as ${same.id}.`);continue;}
    let id='n_'+(String(n.id).replace(/^u_(n_)?/,'').replace(/[^a-z0-9_]/g,'')||slug(n.name));const base=id;let k=2;while(nTaken.has(id))id=base+'_'+(k++);nTaken.add(id);nodeMap[n.id]=id;
    if(parent&&!ND[parent]&&!nodes.some(x=>x.id===parent))F(`Node "${n.name}" has an unknown parent ${n.parent}. Check it after pasting.`);
    nodes.push({id,name:n.name,parent:parent||'',level:n.level,last_changed:today,changed_by:'phone'});}
  const wholeQty=H.ingredients.includes('qty')||!H.ingredients.includes('qty_per_serving');
  const I=Object.fromEntries(cat.items.map(x=>[x.id,x]));const byName={};for(const x of cat.items)byName[nname(x.name)]=x;
  const sheetRecipes={};(rowsOf(X,wb,'Recipes')||[]).forEach(r=>{const id=str(r.recipe_id);if(id)sheetRecipes[id]={id,name:str(r.name)};});
  const RC=Object.fromEntries(cat.recipes.map(r=>[r.id,r]));const recNames=new Set(Object.values(sheetRecipes).map(r=>nname(r.name)));
  const merges=add.itemMerges||{};const idMap={};const taken=new Set(Object.keys(I));const items=[];const newOffers=[];
  const MIG6=(rowsOf(X,wb,'Offers')||[]).some(r=>str(r.store).toLowerCase()==='aldi');   // prices live on the Offers sheet
  const aldiNums=u=>[...new Set([...(u.nums||[]),...asList(add.numLinks,'num','item').filter(x=>x.item===u.id&&(!x.store||x.store==='aldi')).map(x=>String(x.num))])].join(';');
  const offerRow=(o,u,id)=>({item:id,store:o.store,price:o.price,pack:o.pack||u.pack||'',unit:o.unit||u.unit||'',pkg:o.pkg||u.pkg||'',numbers:(o.nums||[]).join('; '),price_date:o.priceDate||'',price_source:o.src==='estimate'?'estimate':o.src==='receipt'?'receipt':'phone',last_changed:today,changed_by:'phone'});
  for(const u of (add.ownItems||[])){const hit=byName[nname(u.name)];
    if(hit){idMap[u.id]=hit.id;if(hit.id!==u.id.replace(/^u_/,''))F(`Name collision: your item "${u.name}" matches catalog item "${hit.name}" (${hit.id}). Not added again; your recipes and aliases use ${hit.id}.`);else notes.push(`${u.name} is already in the spreadsheet.`);continue;}
    let id=u.id.replace(/^u_/,'')||slug(u.name);if(!/^[a-z0-9_]+$/.test(id))id=slug(u.name)||'item';let base=id,n=2;while(taken.has(id))id=base+'_'+(n++);taken.add(id);idMap[u.id]=id;
    items.push({item_id:id,name:u.name,brand:u.brand||'',node:mapNode(u.node),category:u.cat||'Other',package_label:u.pack||'',unit:u.unit||'each',package_qty:u.pkg||1,price:u.price,price_source:u.src==='estimate'?'estimate':'phone',price_date:u.priceDate||String(add.exportedAt||'').slice(0,10),
      staple:u.staple?'Y':'N',storage:u.storage||'',fridge_days:u.fridge??'',freezer_days:u.freezer??'',pantry_days:u.pantry??'',family:u.family||'',sold_by:u.soldBy||'pack',alt_sizes:'',tracking_default:u.tracking||'',aldi_product:'',aldi_numbers:MIG6?'':aldiNums(u),retired:'N',replaced_by:'',notes:'Added on the phone'});
    if(MIG6&&+u.price>0&&!(u.offers||[]).some(o=>(o.store||'aldi')==='aldi'))newOffers.push({item:id,store:'aldi',price:u.price,pack:u.pack||'',unit:u.unit||'each',pkg:u.pkg||1,numbers:aldiNums(u).replace(/;/g,'; '),price_date:u.priceDate||today,price_source:u.src==='estimate'?'estimate':'phone',last_changed:today,changed_by:'phone'});
    for(const o of (u.offers||[]))if((o.store||'aldi')!=='aldi'||MIG6)newOffers.push({...offerRow(o,u,id),store:o.store||'aldi'});}
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
  const sheetAl=new Set((cat.aliases||[]).map(a=>String(a.text).toUpperCase().trim()+'|'+(a.store||'')));const aliases=[];
  for(const a of (add.aliases||[])){const t=String(a.text||'').toUpperCase().trim(),st=String(a.store||'').toLowerCase();if(!t||sheetAl.has(t+'|'+st)||sheetAl.has(t+'|'))continue;const it=a.item==='__ignore'?'ignore':mapId(a.item);
    if(it!=='ignore'&&!known.has(it)){F(`Unknown item: receipt name "${t}" points to ${a.item}, which isn't in the spreadsheet. Left out.`);continue;}aliases.push({receipt_text:t,item_id:it,store:st});}
  // Numbers per store: {num, item, store} (no store means Aldi). Old exports send an object {num: item}.
  const catNum={},offerOf={};for(const x of cat.items){for(const o of (x.offers||[{store:'aldi',nums:x.nums||[]}])){offerOf[x.id+'|'+o.store]=o;for(const n of (o.nums||[]))catNum[o.store+'|'+n]=x.id;}}
  const byOffer={};const newIds=new Set(items.map(x=>x.item_id));
  for(const l of asList(add.numLinks,'num','item')){const num=String(l.num),store=String(l.store||'aldi').toLowerCase(),it=mapId(l.item);
    if(!known.has(it)){F(`Unknown item: number ${num} points to ${l.item}, which isn't in the spreadsheet. Left out.`);continue;}
    if((newIds.has(it)&&store==='aldi')||catNum[store+'|'+num]===it)continue;
    if(catNum[store+'|'+num])F(`Number collision: ${num} is on ${catNum[store+'|'+num]} at ${store} in the spreadsheet, but the phone linked it to ${it}. Keep it on one item only.`);
    (byOffer[it+'|'+store]=byOffer[it+'|'+store]||[]).push(num);}
  const numRows=Object.entries(byOffer).map(([k,ns])=>{const [id,store]=k.split('|');const o=offerOf[k];return {item:id,store,name:(I[id]||{}).name||id,numbers:[...new Set([...((o&&o.nums)||[]),...ns])].join('; '),existing:!!o};});
  const prices=[];for(const [id,e] of Object.entries(add.priceEdits||{})){const it=I[id];if(!it)continue;const store=String(e.store||'aldi').toLowerCase(),o=offerOf[id+'|'+store]||(store==='aldi'?{price:it.price,priceDate:it.priceDate}:null);const d=String(e.at||'').slice(0,10);
    if(o&&(Math.abs((o.price||0)-e.price)<.005||(o.priceDate&&d<o.priceDate)))continue;prices.push({item:id,store,name:it.name,price:e.price,price_date:d,from:o?o.price:null});}
  // offers the phone set (store, price, size)
  const offerUpd=[];for(const o of asList(add.offers,'item','price')){const id=mapId(o.item),store=String(o.store||'aldi').toLowerCase();if(!known.has(id)){F(`Unknown item: an offer points to ${o.item}. Left out.`);continue;}
    const cur=offerOf[id+'|'+store];const row={item:id,store,price:o.price,pack:o.pack||'',unit:o.unit||'',pkg:o.pkg||'',numbers:(o.nums||[]).join('; '),price_date:o.priceDate||o.date||today,price_source:o.src||o.via||'phone',last_changed:today,changed_by:'phone'};
    if(!cur)newOffers.push(row);else if(Math.abs((cur.price||0)-(+o.price||0))>.005||cur.pkg!==o.pkg||cur.unit!==o.unit)offerUpd.push({...row,name:(I[id]||{}).name||id,from:cur.price});}
  // where items sit in the tree, and other item edits
  const cellUpd=[];
  for(const p of asList(add.placements,'item','node')){const id=mapId(p.item),node=mapNode(p.node);if(!known.has(id))continue;if(I[id]&&I[id].node===node)continue;
    if(I[id]&&I[id].node&&I[id].node!==node)F(`Placement: ${id} is under ${I[id].node} in the spreadsheet; the phone put it under ${node}.`);cellUpd.push({item_id:id,name:(I[id]||{}).name||id,node});}
  const F6={name:'name',brand:'brand',pack:'package_label',unit:'unit',pkg:'package_qty',cat:'category',node:'node'};
  for(const u of asList(add.itemUpdates,'id','fields')){const id=mapId(u.id||u.item);if(!known.has(id))continue;const f=u.fields||{};const row={item_id:id,name:(I[id]||{}).name||id};
    for(const k in f)if(F6[k])row[F6[k]]=k==='node'?mapNode(f[k]):f[k];if(Object.keys(row).length>2)cellUpd.push(row);}
  const favRows=[];for(const f of asList(add.favorites,'node','item')){const node=mapNode(f.node);const item=f.item?mapId(f.item):'';if(!node)continue;if((cat.favorites||{})[node]===item)continue;favRows.push({node,item,last_changed:today});}
  const tsv=(rows,cols)=>rows.map(r=>cols.map(c=>{const v=r[c];return v==null?'':String(v).replace(/[\t\n]/g,' ');}).join('\t')).join('\n');
  const groups=[
    {key:'items',sheet:'Items',title:'Items you added',rows:items,cols:H.items,list:items.map(x=>x.name)},
    {key:'recipes',sheet:'Recipes',title:'Recipes you wrote or edited',rows:recipes,cols:H.recipes,list:recipes.map(x=>x.name)},
    {key:'ingredients',sheet:'Ingredients',title:'Ingredients for those recipes',rows:ings,cols:H.ingredients,list:[],note:wholeQty?'Quantities are for the whole recipe.':'Quantities are per serving.'},
    {key:'aliases',sheet:'Receipt aliases',title:'Receipt names',rows:aliases,cols:H.aliases,list:aliases.map(x=>x.receipt_text)},
    {key:'nodes',sheet:'Nodes',title:'New places in the item tree',rows:nodes,cols:H.nodes,list:nodes.map(x=>`${x.name} (${x.id})`)},
    {key:'offers',sheet:'Offers',title:'New store offers',rows:newOffers,cols:H.offers,list:newOffers.map(x=>`${x.item} at ${x.store}`)},
    {key:'favorites',sheet:'Favorites',title:'Favorites',rows:favRows,cols:H.favorites,list:favRows.map(x=>`${x.node}: ${x.item||'(cleared)'}`),note:'A node already on the Favorites sheet: change its item instead of adding a row. A blank item means the favorite was cleared.'},
    {key:'numbers',sheet:'Offers',title:'Store item numbers',rows:numRows,cols:['item','store','name','numbers'],list:numRows.map(x=>`${x.name} at ${x.store}: ${x.numbers}`),note:'Set numbers on these Offers rows (item and store) to the value shown; it keeps the numbers already there. Where an item has no row for that store yet, add one. Not for pasting as new rows.'},
    {key:'prices',sheet:'Offers',title:'Price corrections',rows:prices,cols:['item','store','name','price','price_date'],list:prices.map(x=>`${x.name} at ${x.store} ${x.from!=null?'$'+(+x.from).toFixed(2)+' → ':''}$${(+x.price).toFixed(2)}`),note:'Update price and price_date on these Offers rows. Not for pasting as new rows.'},
    {key:'offerUpdates',sheet:'Offers',title:'Changed store offers',rows:offerUpd,cols:['item','store','name','price','pack','unit','pkg','price_date'],list:offerUpd.map(x=>`${x.name} at ${x.store}`),note:'Update these Offers rows. Not for pasting as new rows.'},
    {key:'itemCells',sheet:'Items',title:'Item edits and placements',rows:cellUpd,cols:['item_id','name','brand','node','package_label','unit','package_qty','category'],list:cellUpd.map(x=>x.name),note:'Change the filled-in cells on these Items rows. Blank cells mean no change. Not for pasting as new rows.'}
  ].map(g=>({...g,tsv:tsv(g.rows,g.cols),header:g.cols.join('\t')}));
  return {groups,flags,notes,from:{exportedAt:add.exportedAt,catalogVersion:add.catalogVersion}};}
const api={build,diff,validateCatalog,additions,toV1,toRows,SCHEMA,MEALS,STORAGE,TRACKING};
if(typeof window!=='undefined')window.CatalogLib=api;if(typeof module!=='undefined')module.exports=api;
})();
