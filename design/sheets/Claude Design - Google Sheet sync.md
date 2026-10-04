# Meal Prep 5.3: read the catalog from Google Sheets and send phone changes back

Paste everything under "Instructions for Claude Design" into Claude Design, with the project open on `Meal Prep App Mobile v5.dc.html`. The test plan and limits at the end are for you.

---

## Instructions for Claude Design

Work in `Meal Prep App Mobile v5.dc.html` (version 5.2). Set `APP_VERSION` to `'5.3'`. Bundle to `export/index.html` when done. Do not change `sw.js` (it is already updated in the repository) or `tools/meal-core.js` unless a step says so.

### Background

The catalog now lives in a Google Sheet. An Apps Script web app attached to the sheet serves it and accepts changes. The script is finished and deployed; this work is only the app side.

- **Read:** `GET <address>?key=<key>&have=<catalogVersion>` returns JSON:
  - `{ok:true, version, catalog, problems:{errors:[], warnings:[], stale:false}}`. `catalog` has the same shape as `catalog.json`, plus `changed` (ISO time or null) on each item and recipe, and `nums` on items.
  - `{ok:true, notModified:true, version, problems}` when `have` equals the current version.
  - `{ok:false, error:'refused'}` for a wrong key, `{ok:false, error:'sheet-errors', problems}` when the sheet has errors and there is no earlier good copy.
  - When `problems.stale` is true, the sheet has errors and `catalog` is the last good one.
  - `&ping=1` returns `{ok:true, app:'meal-prep-sheet'}` (for the connection test).
- **Write:** `POST <address>` with body `{key, device, changes:[…]}` returns `{ok:true, results:[{id, status, message, sheet?}], idMap:{…}, version}`. `status` is one of `applied`, `duplicate` (already applied earlier: treat as success), `conflict` (the sheet kept its own value; `message` says so, `sheet` holds the sheet's value), `rejected` (can never apply; `message` says why), `error` (temporary; try again later). `{ok:false, error:'refused'|'busy'|'bad-json'}` for the whole request.

### 1. Settings › Google Sheet (new sub-screen)

Add a seventh row to Settings, "Google Sheet", using the same sub-screen pattern as the other six (state `sub:'sheet'`, back arrow). Row subtitle: "Not connected", "Connected · up to date", or "Connected · N waiting to send". When N > 0 also show a small count badge on the Settings tab, like the Kitchen badge.

The screen has:

- **App address** (text input, `type=url`, placeholder `https://script.google.com/macros/s/…/exec`) and **App key** (text input, shown as dots with a Show toggle).
- **Test and save** button. It calls `?key=…&ping=1`. On `ok:true` it saves both and says "Connected. Loading the catalog from your sheet…", then loads the catalog (step 2). On `refused` it says "The sheet refused this key. Check it in the sheet under Meal Prep › Show the app address and key." On a network failure it says "Couldn't reach that address. Check it and your connection." Nothing is saved unless the test passes.
- **Disconnect** (dialog to confirm). Clears address and key; the app goes back to `./catalog.json` from GitHub. The outbox is kept.
- Status lines:
  - "Catalog from the sheet: version V, loaded at TIME" (or "Using the copy saved on this phone" when offline).
  - "N changes waiting to send" with a **Send now** button (disabled while sending or when N = 0). While sending: "Sending…".
  - When the last read had `problems.errors`: a warning note, "Your sheet has N problems, so the app is using the last good copy. In the sheet, use Meal Prep › Check data." with the first 3 errors listed.
- **Recent sync results**: the last 20 results that were not plain `applied`/`duplicate` (conflicts, rejections), newest first, each with time and `message`. A **Clear** link.

Store the settings in a new layer key `sheetLink: {url, key, connectedAt}` and add it to `UNDO_KEYS_SKIP` (no undo history). Store recent results in `syncLog` (array, max 20, also in `UNDO_KEYS_SKIP`).

### 2. Loading the catalog

Change `loadCatalog()`:

1. If `sheetLink.url` is set: `fetch(url + '?key=' + encodeURIComponent(key) + '&have=' + encodeURIComponent(lastVersion||''), {cache:'no-store', redirect:'follow'})` with a 20-second timeout (`AbortController`). **No custom headers** (they would make the browser send a preflight request that Apps Script cannot answer).
   - `ok && catalog`: run `checkCat`; if it passes, use it as `fresh` exactly like a new `catalog.json` today (save to IndexedDB `catalog`, catalog summary sheet, etc.).
   - `ok && notModified`: no new catalog; use the saved one.
   - Save `problems` and the read time in state (`sheetStatus`, not in the layer) for the Settings screen.
   - `refused`: keep the saved catalog and show the "refused" note on the Settings screen and in the Settings row subtitle.
   - Network failure or timeout: keep the saved catalog quietly; Settings shows "Using the copy saved on this phone".
2. If `sheetLink.url` is not set, keep today's behaviour (`./catalog.json`).
3. Order of fallbacks: sheet → last saved catalog in IndexedDB → `./catalog.json` (only if nothing is saved) → built-in `MASTER`.

"Check for a new catalog now" uses the same path. Load the catalog at app start, after a successful send (step 4), and when the app comes back to the foreground after more than 10 minutes.

### 3. The outbox: what each change looks like

Add layer key `outbox` (array). Keep it **in the undo history** (do not add it to `UNDO_KEYS_SKIP`): undoing an action that has not been sent yet removes its change, and undoing past a send re-adds changes that the script then answers as `duplicate`, which is harmless.

Each change:

```json
{ "id": "c_lq3x9k_a8f2", "type": "price.set", "at": "2026-10-04T18:20:00.000Z", "data": { }, "base": { } }
```

- `id`: made once when the change is created (`'c_' + Date.now().toString(36) + '_' + uid()`), never changed. The script uses it to skip repeats.
- `base`: what the phone last saw **from the sheet catalog** (`this.cat`, not the phone's own edits), so the script can tell whether the sheet changed since.

Create changes in these places (only when `sheetLink.url` is set, or when building the first sync in step 6):

| Phone action | type | data | base |
| --- | --- | --- | --- |
| New item (`saveNewItem` / `makeUserItem`) | `item.add` | the whole own item: `{id:'u_…', name, cat, pack, unit, pkg, price, src, priceDate, staple, storage, fridge, freezer, pantry, soldBy, family, tracking, aldi, nums:[numbers linked to it]}` | `{}` |
| Edit an own item that is still `u_` (`saveUserItem`) | none | if its `item.add` is still in the outbox, replace that change's `data` with the edited item; otherwise do nothing | |
| Hand price fix (`savePrice`) | `price.set` | `{item, price, date:'yyyy-mm-dd', via:'edited'}` | `{price, priceDate}` of that item in `this.cat` |
| Receipt saved (`importDraft`), each item at a regular price (not `sale`) | `price.set` | `{item, price:paid per package, date:receipt date, via:'receipt'}` | as above |
| Receipt saved, each new number link | `number.link` | `{num, item}` | `{}` |
| Receipt saved, each new receipt name | `alias.add` | `{text, item}` (`item` may be `'__ignore'`) | `{}` |
| New recipe (`saveRec`, mode `new`) | `recipe.add` | the own recipe `{id:'u_…', meal, name, tags, serv, ing, total, hands, keeps, reheats, link, notes}` (`ing` per serving, as stored) | `{}` |
| Edit an own recipe still `u_` | none | replace the queued `recipe.add` data | |
| Edit a catalog recipe whose `source` is "My recipe" or "My version" (it came from the phone earlier) | `recipe.update` | the full recipe with its sheet `id` | `{changed}` of that recipe in `this.cat` |
| Edit any other catalog recipe (`recipeEdits`) | `recipe.edit` | `{orig:id, recipe:{…the edited recipe}}` | `{changed}` of `id + '_mine'` in `this.cat` if it exists, else `{}` |
| Link an own item to a catalog item (`mergeItem`) | `item.merge` | `{from:'u_…', to:catalogId}` | `{}` |

For items that are still `u_` (not yet in the sheet), do not queue `price.set` or `number.link`: update the queued `item.add` instead (its `price`, `priceDate`, `nums`).

Not sent (the sheet stays in charge): "Use the original", deleting an own recipe or item, resetting a price. After these, show "Change it in the sheet too if you want it gone there." only when the item or recipe is already in the sheet.

### 4. Sending

- Send when: the app starts (after the catalog loads), 5 seconds after any commit that added changes, on the `online` event, when the app returns to the foreground, every 15 minutes while open, and on **Send now**.
- One send at a time. Up to 50 changes per request, oldest first. If more remain, send the next batch right after.
- Request: `fetch(url, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({key, device:'phone', changes}), redirect:'follow'})` with a 30-second timeout. The `text/plain` type is what avoids the preflight; the script reads the body as text. Apps Script answers through a redirect to `script.googleusercontent.com`; `redirect:'follow'` (the default) handles it and the JSON is readable.
- Results, per change id:
  - `applied`, `duplicate`: remove from the outbox.
  - `conflict`: remove from the outbox, add `message` to `syncLog`, and show it as a toast ("Lemon: the sheet's price $3.29 was kept."). Then drop the phone's competing value so the sheet's value shows: for `price.set` delete `priceEdits[item]`; for `number.link` delete `numLinks[num]`; for `alias.add` set the local alias to `sheet.item`.
  - `rejected`: remove, add to `syncLog`, toast the message.
  - `error` or a change missing from `results`: keep; after 5 failed tries for the same change, stop retrying it and list it in `syncLog` as "Couldn't send: …" with a **Try again** link.
- Whole-request failures: network error, timeout, HTTP error or `busy`: keep everything and retry after 1, 5, 15, then 60 minutes. `refused`: stop sending and show "The sheet refused the key" in Settings and the Settings row.
- After a send that changed anything, apply `idMap` (step 5), then reload the catalog (step 2).
- Write these state changes with `relayer`/`save`, not `commit`, so they don't create undo entries.

### 5. Swapping phone ids for sheet ids

`idMap` maps phone ids to sheet ids, for example `{"u_brie":"brie", "u_herring_toast":"l_herring_toast", "edit:d_tacos":"d_tacos_mine"}`. Keep pending swaps in layer key `idSwaps` (in `UNDO_KEYS_SKIP`) until the catalog contains the new id; then apply them and remove them. If the catalog doesn't have the id yet, try again after the next catalog load.

- **Items (`u_x` → `x`):** do what `mergeItem(u_x, x)` already does (move kitchen batches, recipes, aliases, cart, price history, usage log, item settings, cooked snapshots), with no unit conversion, plus: update `numLinks` values, `skipTrip` and `staples` keys, and any `outbox` changes that still mention `u_x`. Remove the item from `ownItems`. No toast, no undo entry, and do not record it in `itemMerges`.
- **Recipes (`u_r` → `l_r`):** replace `rid` in `menu`, `slots`, `leftovers`, `cookedSnapshots`, `optOn` and `libMult`, and in queued changes; remove it from `ownRecipes`.
- **My versions (`edit:orig` → `orig_mine`):** replace `orig` with `orig_mine` in `menu`, `slots`, `leftovers`, `optOn` (the phone was showing the edited version under `orig`), then delete `recipeEdits[orig]`.

### 6. First connection: send what the phone already knows

The first time Test and save succeeds (no `sheetLink.connectedAt` before), build changes from what is already on the phone and add them to the outbox. Before sending, show a dialog: "Send N things this phone learned to your sheet? Items: a, recipes: b, my versions: c, Aldi numbers: d, receipt names: e, prices: f. Anything already in the sheet is skipped." with **Send** and **Not now** (Not now keeps them queued).

- `ownItems` → `item.add` each (with their numbers).
- `ownRecipes` → `recipe.add` each, after all items.
- `recipeEdits` → `recipe.edit` each.
- `itemMerges` → `item.merge` each.
- `aliases` → `alias.add` each.
- `numLinks` for catalog items → `number.link` each.
- `priceEdits` → `price.set` each, only where the edit is newer than the catalog's `priceDate` and differs from the catalog price; `via` is `'receipt'` if `priceEdits[id].via === 'receipt'`, else `'edited'`.

### 7. Smaller changes

- Settings › Prices and catalog: when connected, replace the GitHub explanation with "Prices and recipes come from your Google Sheet. Edit them there; the app picks up changes when it opens." Keep "Advanced: send phone changes to the spreadsheet" (the export file) as a fallback.
- Diagnostics: add the sheet address (without the key), last read time and version, outbox length and the last send result.
- Help: add a question "How does the Google Sheet work?" with: the sheet is the master copy; changes made on the phone are sent to it (and wait when offline); if the same thing was changed in both places, the sheet wins and the app says so.
- Self test (`Self Test.dc.html`): no changes needed.

---

## Test plan (for you, after the new app is uploaded)

Before each test, open the sheet's **Change log** tab so you can watch rows arrive.

### 0. Connect
1. On the phone: **Settings › Google Sheet**, paste the address and key, tap **Test and save**.
   - See: "Connected. Loading the catalog from your sheet…", then Settings shows "Catalog from the sheet: version 2026.10.…".
2. If the phone already has items or recipes you added, the "Send N things…" dialog appears. Tap **Send**.
   - See in the sheet: new rows in Change log with `result` = applied, and your phone items as new rows at the bottom of **Items** with `changed_by` = phone.

### 1. The receipt with Aldi numbers
1. Groceries › **Log receipt** › **Paste receipt**. Paste the receipt from your request (every line, repeated lines repeated, ending with `TOTAL,,126.51`). Tap **Read receipt**.
2. Choose the item for any line the app can't match. Tap **Add N items**.
3. Settings › Google Sheet should show the changes being sent, then "up to date".
4. In the sheet, **Items**:
   - `flour` has `382147` in `aldi_numbers`; `potatoes` has `356408`; `onion` has `341878`; `cilantro` has `356537`; `lemon` has `356410`; `sesame_oil` has `385901`; `dill_pickles` has `382302`; `garlic` has `356371`; `american_cheese` has `382722`; `sourdough` has `382589`.
   - `beef_stew_meat` has `382845` **once**, even though it appeared on two lines with two prices.
   - The yogurt drink (`733566`, 6 lines), herring (`262678`, 6 lines) and Belle Vie (`575097`, 2 lines) each have their number once, on whichever item you chose for them.
   - Each regular-price line updated `price`, `price_source` = receipt and `price_date` = the receipt date.
5. **Receipt aliases** has one row per receipt wording you matched, e.g. `BLK ANGS STEW MEAT`.
6. **Change log**: one row per change, all `applied`.

### 2. Add an item in airplane mode
1. Turn on airplane mode. Kitchen › Add what you have › search a new name, e.g. `Test pickled beets` › **Add as a new item**, price 1.99, save.
2. Settings › Google Sheet shows "1 waiting to send".
3. Turn airplane mode off and open the app (or tap **Send now**).
4. See: Items has exactly **one** new row `test_pickled_beets`. Change log has one `item.add` row. On the phone the item still works (now under the sheet id).
5. Tap **Send now** again: nothing new appears in the sheet.

### 3. A price edited in the sheet reaches the phone
1. In the sheet, change `eggs` price to `1.99`. (`last_changed` fills in, `changed_by` = sheet.)
2. Close the app fully and open it again with a connection.
3. See: the "New catalog loaded" summary (1 price changed), and eggs at $1.99 on the shopping list.

### 4. Same price changed in both places: the sheet wins
1. Turn on airplane mode. On the phone, change the price of `milk` to $3.10.
2. In the sheet (on the computer), change `milk` to $2.99.
3. Turn airplane mode off and open the app.
4. See: a message "Whole milk: the sheet's price $2.99 was kept.", the phone shows $2.99, Settings › Google Sheet › Recent sync results lists it, and the Change log row says `conflict`.

### 5. A wrong key is refused
1. In a browser: open `ADDRESS?key=wrong`.
   - See: `{"ok":false,"error":"refused","message":"Wrong or missing key."}`
2. On the phone: Settings › Google Sheet, change one character of the key, **Test and save**.
   - See: "The sheet refused this key…" and nothing saved. Put the right key back.

---

## Limits and what can go wrong

- **Google's limits.** Apps Script on a free Google account allows 6 minutes per run and about 30 runs at the same time. Reading the catalog takes a few seconds; a send of 50 changes takes under a minute. A phone that reads a few times a day and sends after shopping is far below every limit. Current numbers: developers.google.com/apps-script/guides/services/quotas.
- **The first request after a quiet period** can take 5–10 seconds while Google starts the script. The app shows the saved catalog meanwhile.
- **If the script is down, or the address or key is wrong:** the app keeps working with the last catalog it saved, and phone changes wait in the outbox. Nothing is lost.
- **If you make a mistake in the sheet** (a bad category, a duplicate number): the phone keeps getting the last good catalog, and the app tells you the sheet has problems. Use **Meal Prep › Check data** to find them.
- **Backing up the sheet:**
  - Google keeps every version: **File › Version history › See version history** (restore any earlier version).
  - Once a month, **File › Download › Microsoft Excel (.xlsx)** and keep the file somewhere else.
  - The phone still has its own backup in Settings › Backup and restore.
- **The key:** anyone with the address *and* the key can read and change your catalog. To change it: **Meal Prep › Set the app key** in the sheet, then type the new key on the phone. The old key stops working immediately.
- **Going back to catalog.json on GitHub:**
  1. On the phone: Settings › Google Sheet › **Disconnect**. The app reads `catalog.json` from GitHub again.
  2. To update `catalog.json` from the sheet: **File › Download › Microsoft Excel (.xlsx)**, drop it into `tools/catalog-builder.html` with the current `catalog.json`, download the new one and upload it to GitHub. The builder reads columns by name, so the extra `last_changed` and `changed_by` columns are fine.
  3. To stop the script entirely: Apps Script › **Deploy › Manage deployments › Archive**.
