# Possible ingredients: app change spec (6.6 follow-up)

Paste this into Claude Design with `Meal Prep App Mobile v6.6.dc.html` open. It is written against the 6.6 source that is bundled in the live `index.html` (the one with `possPrep`, `altVals` and `saveRec` using `pz.made`). That source is newer than the `.dc.html` in the repo, so line numbers are left out; each edit names the method and quotes the code it changes.

The sheet side is done in `design/sheets/Code.gs` (script version 7) and `design/source/tools/recipe-core.js`. Rebundle `tools/recipe-core.js` with the app: `RecipeCore.cost` and two helpers changed.

## What the script now does (for reference)

- Every reply carries `script: 7` (`?ping=1`, the catalog GET, and the changes POST). Scripts before 7 send no `script`.
- `item.add` accepts `possible` (true/false) and `where` (text). A possible item gets `possible = Y`, a blank price, date and source, and the note "From a recipe; not sold at Aldi". An `item.add` that already carries a price, or an offer with a price, arrives as an ordinary item.
- New change `item.where` `{id, where}`, base `{changed}` (optional). A store typed in the sheet since the phone last saw the row wins (status `conflict`, `sheet: {where}`).
- `offer.set`, `price.set` (any store) and a priced `item.add` set `possible = N`.
- The catalog (schema 2) has `possible: true` on items that are still possible, and `where` on any item that has one. Both keys are left out otherwise.
- `recipe.add`, `recipe.update` and `recipe.edit` whose only missing items are phone ids (`u_…`) now answer `deferred` (not logged) instead of `rejected`, so a retry applies them once the items arrive.

## RecipeCore changes (already in tools/recipe-core.js)

- `RecipeCore.cost(rows,P,serv,people)` leaves possible items, and items with no price, out of the money. It returns `unpriced` (a count of distinct items) and `unpricedIds` as well as `whole`, `household`, `portions`.
- `RecipeCore.unpriced(p)` is true for a possible item or one whose price is missing or 0.
- `RecipeCore.unpricedText(n)` returns `"+ 1 item not priced"`, `"+ 2 items not priced"`, or `''`.
- `matchLine`: a line ending in juice, pulp, puree, oil, flour, milk, starch or paste no longer matches an item that has that word only after "in" or "with" ("pineapple juice" is not "Pineapple chunks in juice").

---

## 1. Possible items reach the sheet

### 1a. Remember the script version

Add a method next to `linked()`:

```js
scriptV(){return +((this.state.sheetLink||{}).script)||0;}
noteScript(j){if(!j||!j.ok)return;const v=+j.script||0;const l=this.state.sheetLink;if(l&&(+l.script||0)!==v)this.save({sheetLink:{...l,script:v}});}
```

In `loadCatalog`, in the sheet branch, right after
`const j=await this.fetchJson(link.url+'?key='+…&schema=2&have='+…,{cache:'no-store'},20000);`
add `sheet.script` to the `sheet` object it builds:

```js
sheet={at:…,version:j.version||null,problems:j.problems||null,error:…,fromSheet:false,script:j.ok?(+j.script||0):null};
```

In `checkCatalog`, after `if(lc.sheet)this.setState({sheetStatus:lc.sheet});` add:

```js
if(lc.sheet&&lc.sheet.script!=null)this.noteScript({ok:true,script:lc.sheet.script});
```

In `sendOutbox`, after `this._fails=0;this._retryAt=0;` add `this.noteScript(j);`.

`sheetLink` is already saved with the layer, so the number survives a reload. A rolled-back script reports nothing, which reads as 0 and holds the changes again.

### 1b. One way to build an item.add

Add next to `itemData`:

```js
// Possible ingredients need script 7. Older scripts would add them with a $0 price and break the catalog.
itemAddChg(u,nl){const c=this.chg('item.add',this.itemData(u,nl));return u.possible?{...c,needs:7}:c;}
```

`itemData`: add `'possible','where'` to the fixed key list:

```js
for(const k of ['id','name','cat','pack','unit','pkg','price','src','priceDate','staple','storage','fridge','freezer','pantry','soldBy','family','tracking','aldi','possible','where'])o[k]=u[k]??null;
```

`buildInitial`: where it queues `item.add` for each own item, use `this.itemAddChg(u,nl)` instead of `this.chg('item.add',this.itemData(u,nl))`.

### 1c. Hold changes the script can't take yet

`sendOutbox`, replace the `ready` function with:

```js
const ready=()=>{const S=this.state,ob=S.outbox||[];const hold=!!(S.sheetLink&&S.sheetLink.hold);const sv=this.scriptV();
  const wait=c=>(hold&&c.init)||(c.needs||0)>sv;
  const held=new Set(ob.filter(c=>wait(c)&&(c.type==='item.add'||c.type==='recipe.add'||c.type==='item.where')&&c.data&&c.data.id).map(c=>c.data.id));
  const uses=c=>{const d=c.data||{};const ids=[d.item,d.id,d.from,...(d.ing||[]).map(x=>x[0]),...((d.recipe&&d.recipe.ing)||[]).map(x=>x[0])];return ids.some(x=>held.has(x));};
  return ob.filter(c=>!c.stuck&&!wait(c)&&!uses(c));};
```

This keeps the old `hold`/`init` behaviour and adds: a change with `needs` above the script's version waits, and so does anything that uses its id (the recipe.add that lists the possible item, a price for it). When the next catalog check sees `script: 7`, the next send takes them in outbox order.

In the `changes:batch.map(({tries,stuck,init,...c})=>c)` line, also drop `needs`: `({tries,stuck,init,needs,...c})=>c`.

### 1d. An older script that refuses them

`applyResults`, inside `if(st==='conflict'||st==='rejected'){…}`, put this first:

```js
if(st==='rejected'&&/^Unknown change type/.test(x.message||'')){kept++;outbox.push({...c,stuck:true,tries:(c.tries||0)+1});log.push({id:uid(),at,kind:'stuck',cid:c.id,msg:`Update your Google script to send the ${this.chgLabel(c)}.`});continue;}
```

`dropped++` stays for every other refusal. `deferred` already falls through to the keep-and-retry path, so nothing changes there.

`chgLabel`: add `` 'item.where':`store for ${nm(d.id)}` ``.

### 1e. Save a web recipe

`saveRec`, after `const pz=this.possPrep(e.d);…const oi=…;` add:

```js
// Possible items go first, so the sheet knows them (and swaps their ids) before the recipe that uses them.
const obi=this.linked()&&pz.made.length?pz.made.map(it=>this.itemAddChg(it,S.numLinks)):[];
```

Then in each branch put `...obi` in front of the recipe change:

- `web`: `const obp=nr.keeper&&this.linked()?{outbox:[...(S.outbox||[]),...obi,this.chg('recipe.add',this.recData(nr,id))]}:obi.length?{outbox:[...(S.outbox||[]),...obi]}:{};`
- `new`: `const obp=this.linked()?{outbox:[...(S.outbox||[]),...obi,this.chg('recipe.add',this.recData(nr,id))]}:{};`
- `own` (and `cat` / my version, if they call `possPrep`): after `ob` is worked out, `const ob2=obi.length?(ob?[...ob.filter(c=>!(c.type==='recipe.add'&&c.data&&c.data.id===e.id)),...obi,...ob.filter(c=>c.type==='recipe.add'&&c.data&&c.data.id===e.id)]:[...(S.outbox||[]),...obi]):ob;` and commit `ob2` in place of `ob`. That moves an already-queued recipe.add behind the new items.

Possible items are queued even for a web recipe that isn't a keeper: they are items, and the next recipe that needs them will find them by name.

### 1f. Where to buy it

`saveUserItem`: after `const u2=…;const ob=…obPatch(S.outbox,'item.add',id,()=>this.itemData(u2,S.numLinks)):null;` add:

```js
const was=S.ownItems.find(u=>u.id===id)||{};
// Already sent: the item.add is gone from the outbox, so send the new store on its own.
const wq=this.linked()&&u2&&u2.possible&&!ob&&(u2.where||'')!==(was.where||'')?[...(S.outbox||[]),{...this.chg('item.where',{id,where:u2.where||''}),needs:7}]:null;
```

and commit `outbox: ob||wq` (when either is set). `obPatch` already rewrites a queued `item.add` with the new `where`, because `itemData` now copies it.

After the sheet swaps the id, the item is a catalog item and leaves `ownItems`, so it would drop out of Settings › Items. Keep it there:

- In the Settings › Items rows (the `rows=[...(S.ownItems||[])].sort((a,b)=>!!b.possible-!!a.possible).map(u=>…)` line), add the catalog's possible items before the own items: `const catPoss=(this.cat?this.cat.items:[]).filter(c=>c.possible&&!c.retired).map(c=>({...c,...((S.itemEdits||{})[c.id]||{}),fromCat:true}));` and map `[...catPoss,...ownSorted]`. A catalog row shows the same "Possible ingredient · Where: … · added …" line, has Edit (where only, plus name) and no Delete.
- Saving a catalog row: `itemEdits:{...S.itemEdits,[id]:{...(S.itemEdits||{})[id],where:w}}` and, when linked, queue `{...this.chg('item.where',{id,where:w},{changed:c.changed||null}),needs:7}`.
- `effItem`: add `'where'` to the edited keys: `for(const k of ['name','brand','node','where'])`.
- `applyResults`, conflict branch: `else if(c.type==='item.where'&&ie[d.id]){const e={...ie[d.id]};delete e.where;ie[d.id]=e;}` so the sheet's store shows.

### 1g. An item stops being possible once it has a price

In `catalog(L)`, as the last step of the `prices=` chain (after the LearnCore block):

```js
// A possible item with a priced offer (receipt, ticked with a price, edited) is an ordinary item at that store.
prices=prices.map(p=>{if(!p.possible)return p;if(p.price>0)return {...p,possible:false};const o=(p.offers||[]).find(x=>x.price>0);if(!o)return p;
  const f=unitF(o.unit,p.unit)||1;const pkg=Math.round((o.pkg||p.pkg)*f*1000)/1000;return {...p,possible:false,store:o.store,price:o.price,pkg,pack:o.pack||p.pack,priceDate:o.priceDate||p.priceDate,unitCost:pkg>0?o.price/pkg:p.unitCost};});
```

The sheet clears its own flag when the price change arrives, so no extra outbox change is needed.

---

## 2. Cost and the shopping list

Add one constant near `CAT_ORDER`:

```js
// What an unpriced item is assumed to add when ranking recipes: the median Aldi package ($2.49) over 4 servings.
const UNP_PER_SERVING=0.62;
```

### 2a. Recipe cost

`mealCost`: leave unpriced items out, and add a counter beside it:

```js
mealCost(r,s,P){let c=0;for(const [iid,q] of r.ing){const it=P[iid];if(it&&!it.staple&&!window.RecipeCore.unpriced(it))c+=q*s*it.price/it.pkg;}return c;}
// Distinct ingredients with no price yet (possible items), leaving out staples and optional lines.
unpricedOf(r,P){const s=new Set();for(const x of r.ing){const it=P[x[0]];if(it&&!it.staple&&!x[3]&&window.RecipeCore.unpriced(it))s.add(x[0]);}return s.size;}
```

Show the count wherever a cost is shown, with `RecipeCore.unpricedText(n)`:

- Recipe sheet (`sh={…}`): `cost:money(this.mealCost(r,serv,P))` becomes `cost:[money(this.mealCost(r,serv,P)),window.RecipeCore.unpricedText(this.unpricedOf(r,P))].filter(Boolean).join(' ')`.
- `menuVals` `toX`: add `unp:this.unpricedOf(r,P)` next to `per`.
- Library and Suggested cards (`rowOf`): `cAdds` and `extraText` become `'Adds '+money(extra>.005?extra:0)+(x.unp?' '+window.RecipeCore.unpricedText(x.unp):'')`. The `meta` "… a serving" part gets the same suffix.
- My menu rows: `` cost:`adds ${money(adds)}` `` gets `+(this.unpricedOf(r,P)?' '+window.RecipeCore.unpricedText(this.unpricedOf(r,P)):'')`.
- Recipe editor (`recEdVals`): in the ingredient loop, replace `if(q>0&&!p.staple&&!x.o)cost+=q*p.price/p.pkg;` with
  `if(q>0&&!p.staple&&!x.o){if(window.RecipeCore.unpriced(p))unp++;else cost+=q*p.price/p.pkg;}` (declare `let unp=0` beside `cost`). Lines with no item yet that will be saved as possible items (`!x.iid&&x.web&&x.web.item`) also add 1. Append `window.RecipeCore.unpricedText(unp)` to both `reCost` texts, and show the line when `cost>0||unp>0`.

### 2b. The list: "Not at Aldi"

`shopOf`: before the staple check in the first loop, send unpriced items to their own list:

```js
if(window.RecipeCore.unpriced(it)&&!this.isStaple(it)){const short=need[iid]-have;if(short>1e-9)away.push({id:iid,it,need:need[iid],have,packs:Math.max(1,Math.ceil(short/(it.pkg||1)-1e-9)),cost:0});else covered.push({id:iid,it});continue;}
```

Declare `away=[]` with `buy`, and return `{buy,covered,low,away,total:r2(total),useVal}`. `total` never includes them, so the budget meter, "Over by", `menuTotal` and Fill's budget check all leave them out.

In the shop part of `renderVals` (after `shop=this.shopOf(need,P)`), build the section:

```js
const awayG={};for(const l of shop.away){const w=(l.it.where||'').trim()||'Store not noted';(awayG[w]=awayG[w]||[]).push(l);}
const awayGroups=Object.keys(awayG).sort((a,b)=>(a==='Store not noted')-(b==='Store not noted')||a.localeCompare(b)).map(w=>({where:w,lines:awayG[w].sort((a,b)=>a.it.name.localeCompare(b.it.name)).map(l=>({id:l.id,name:l.it.name,detail:`Menu uses ${fmtQ(l.need,l.it.unit)}${l.have>0?`, you have ${fmtQ(l.have,l.it.unit)}`:''}.`,tick:()=>this.setState({awayTick:{id:l.id,price:'',store:this.storeFor(l.it.where)}})}))}));
```

Template: after the last store section and before "Bought", a section titled **Not at Aldi** with the count ("3 items"), no subtotal, then one sub-heading per `awayGroups` entry (`g.where`) and its rows. Each row has the tick circle, the name and `detail`; no price column. The section has no money in it and is not in the meter.

Add a helper that guesses the store from the text in `where`:

```js
storeFor(w){const t=String(w||'').toLowerCase();if(!t)return null;const st=(this.cat&&this.cat.stores)||[];const hit=st.find(s=>t.includes(s.name.toLowerCase())||t.includes(s.id));return hit?hit.id:null;}
```

### 2c. Ticking one asks for the price

A small sheet, open while `S.awayTick` is set (add `awayTick` to `UNDO_KEYS_SKIP`; it is not saved):

- Title: the item's name. Line under it: "Price paid (optional)".
- A money field bound to `awayTick.price`.
- Store chips from `this.cat.stores` (`storeName`), the one in `awayTick.store` selected. If none matched, none is selected; the chips only matter when a price is typed.
- Buttons: **Ticked** (primary) and **Cancel**.

```js
awayDone(){const S=this.state,a=S.awayTick;if(!a)return;const P=this.P();const p=P[a.id];if(!p){this.setState({awayTick:null});return;}
  const v=parseFloat(a.price),paid=v>0?r2(v):0,st=a.store,t=this.today();const pack={store:st,price:paid,pkg:p.pkg,unit:p.unit,pack:p.pack,priceDate:t,src:'edited',at:new Date().toISOString()};
  const patch={awayTick:null};
  if(paid>0&&st){patch.offerEdits={...(S.offerEdits||{}),[a.id]:{...((S.offerEdits||{})[a.id]||{}),[st]:pack}};
    if(this.linked()){const own=String(a.id).startsWith('u_');const ob=own?this.obPatch(S.outbox,'item.add',a.id,d=>({...d,offers:[...(d.offers||[]).filter(o=>o.store!==st),{store:st,price:paid,pkg:p.pkg,unit:p.unit,pack:p.pack,nums:[],priceDate:t,src:'edited'}]})):null;
      patch.outbox=ob||[...(S.outbox||[]),this.chg('offer.set',{item:a.id,store:st,price:paid,pack:p.pack,unit:p.unit,pkg:p.pkg,date:t,via:'edited'},{})];}}
  this.relayer(patch,()=>this.buyLine({id:a.id,it:p,packs:1,cost:paid}));
  if(paid>0&&!st)this.flash('Pick the store to save the price');}
```

With a price and a store, the offer makes the item ordinary (1g) and the sheet clears `possible` when the `offer.set` arrives. Without a price the item is ticked like any other row, at $0, and stays possible. `buyLine` puts it in the kitchen as usual. The `offer.set` for a `u_` id that already left the outbox goes to the sheet under the phone id; the script resolves it through the Id map.

Note for the guard: if **Ticked** is pressed with a price but no store, keep the sheet open and show the flash instead of ticking.

### 2d. Receipts

Possible items are in `S.prices`, so `rowFrom` already offers them by name. Two edits make Add clear them:

- In the receipt save loop (`if(!e.sale){const sp=e.sp;const toOffer=…`), treat a possible own item like a catalog item at another store: change `if(p.own){if(store!==(p.store0||'aldi'))toOffer();}` to `if(p.own){if(p.possible||store!==(p.store0||'aldi'))toOffer();}`.
- In the outbox part below it, for own items: when `obPatch` finds no queued `item.add` (it was already sent), send `this.chg('price.set',{item:iid,price:paid,date,via:'receipt',store},{})` instead of dropping the price. Change `if(o2)outbox=o2;` to `if(o2)outbox=o2;else add.push(this.chg('price.set',{item:iid,price:paid,date,via:'receipt',store},{}));` in the `p.own` branch. This also fixes prices for any own item bought again between sending and the id swap.

For possible items, add `needs:7` to that `price.set` when `p.possible`, so it waits behind a held `item.add`.

### 2e. Fill and Suggested

- Suggested sort (`sugGroups … .sort((a,b)=>(b.pf-a.pf)||(b.can-a.can)||(b.ue-a.ue)||(a.per-b.per))`) and the library "cheap" sort (`so==='cheap'?(a.per-b.per)`): compare `a.per+a.unp*UNP_PER_SERVING` with `b.per+b.unp*UNP_PER_SERVING`.
- `fillMenu` `ev`: the shopping total leaves possible items out, so count them as money in the score only: `obj:sc-over*15-(sh.total+sh.away.length*2.49)*.03+sh.useVal*.3`. The budget check (`res.c<=budget`) keeps using `sh.total`, because unpriced items are not in the budget.

The cards show "+ N items not priced" (2a), so the person sees why a cheap-looking recipe is ranked where it is.

---

## 3. Version gate (summary)

Covered by 1a–1c. Possible `item.add`, `item.where`, and prices for possible items carry `needs:7`. They and the recipes that use them stay in the outbox (not stuck, no tries counted) until a catalog check or a send reports `script` 7 or more. Settings › Google Sheet can show "N changes wait for the new Google script" when `outbox.some(c=>(c.needs||0)>this.scriptV())`.

## 4. Matching

Done in `RecipeCore.matchLine` (see the top). Self Test has 10 new checks under "Recipe substitutions and possible ingredients (6.6)"; Self Test now loads `tools/recipe-core.js`.

---

## Deploy order

1. Apps Script: paste `design/sheets/Code.gs`, then Deploy › Manage deployments › edit the existing deployment › Version: New version › Deploy. That makes deployment version 10 (the script reports `script: 7`). The address stays the same.
2. In the sheet: Meal Prep › Set up sheets and dropdowns. It adds `possible` and `where` at the end of Items (the script also adds them by itself on the phone's first send), a Y/N dropdown on `possible`, and a note on `where`.
3. Claude Design: make the edits above, rebundle with `tools/recipe-core.js`, upload `index.html`.

Items column order after step 2: every existing column unchanged, then `possible`, `where`. The Catalog Builder reads Items by header name, and its default header list (`DEF_H.items` in `design/tools/catalog-lib.js`) now ends with the same two columns.

The order of 1 and 3 doesn't matter: an app built from this spec holds possible items until the script says 7, and the new script works with the 6.6 app on the phone today.

## Test on the Galaxy S25 Ultra

1. **Import.** Menu › + From the web, a recipe with two items Aldi doesn't sell (for example a colada morada page: naranjilla pulp and star anise). The editor says "2 will be saved to your possible ingredients" and the cost line ends "+ 2 items not priced". "Pineapple juice" is not matched to Pineapple chunks in juice.
2. **Save**, then Settings › Items: both are at the top as "Possible ingredient · No store noted yet". Settings › Google Sheet shows the changes sent (or, with the old script, waiting for the new one).
3. **Where to buy it.** Edit one, type "Cub" under Where to buy it, save. The row reads "Where: Cub". In the sheet, its Items row has `where` = Cub (after the next send).
4. **Plan it.** Add the recipe to the menu. Its card reads "Adds $X + 2 items not priced". On Shopping, both items are at the bottom under **Not at Aldi**, under "Cub" and "Store not noted". The budget meter and the menu line didn't move when they were added.
5. **Tick with a price.** Tick the Cub item, type 3.99, keep Cub selected, Ticked. It moves to Bought, the item is no longer under Not at Aldi on the next plan, and Settings › Items shows it with its price. Tick the other one with no price: it is bought at $0 and stays possible.
6. **The sheet.** Items: two new rows with `possible` Y and N (the one you priced), blank `price` on the possible one, `where` filled for the Cub one. Offers: a `cub` row at 3.99 for the priced item. Change log: `item.add` ×2, `recipe.add` (if a keeper), `item.where`, `offer.set`, all applied. Meal Prep › Check data shows no price errors for them.
