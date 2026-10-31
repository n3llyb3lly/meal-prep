# Claude Code prompt: Meal Prep 6.6 first use (M1 + M2)

Repo: n3llyb3lly/meal-prep. Read `CLAUDE.md` (sections 6.6) and `uploads/first-use-work-order.md` (WP54–WP60, WP66) first. The design side is done in `Meal Prep App Mobile v6.6.dc.html` and bundled to `export/index-v6.6.html`. Rules shared with the app live in `tools/first-core.js` (window.FirstCore). Self Test has a "6.6 first use" group (264 checks pass).

Do the tasks in this order. **Deploy the script (task 1) before the app (task 4).** The 6.5 phone app must keep working with the new script.

## 1. Apps Script: Drive backup actions (WP66)

Add three actions to `Code.gs`. They use the existing request format: a `text/plain` POST whose body is JSON with `key` and `action`. Check the key the same way the existing actions do. Reply with JSON `{ok:true,...}` or `{ok:false,error:"..."}`.

- **`backup.save`**: body `{id, name, part, parts, enc, data, size, meta, keep:{daily,weekly}}`.
  - `data` is one base64 chunk of up to 350,000 characters. `enc` is `"gzip-base64"` or `"base64"`.
  - Write each part as its own file, `<name>.part<N>` in a temp folder. When `part === parts-1`, join the parts in order and write one file named `name` (for example `meal-prep-2026-10-19-0702.json`) to a Drive folder called **Meal Prep backups**, creating the folder if needed. Then delete the temp parts.
  - The file content is JSON: `{id, at:<ms>, enc, size, meta, data:<joined base64>}`.
  - After writing, apply retention: keep the newest file of each of the last **7 days**, plus the newest file of each of the last **4 weeks**. Delete the rest. The user chose 7 daily + 4 weekly, which overrides the 14 + 8 in the work order. Mirror `FirstCore.backupKeep` and test it the same way.
  - Return `{ok:true}` for each part.
- **`backup.list`**: return `{ok:true, files:[{id, name, at, size, enc, meta, parts}]}`, newest first. `parts` is how many 350,000-character chunks `fetch` will return.
- **`backup.fetch`**: body `{id, part}`. Return `{ok:true, data:<chunk>, parts, enc}`.
- An unknown action must return `{ok:false, error:"unknown action"}`. The app shows "Update your Google script…" when an error contains *unknown*, *action* or *unsupported*. Check that the current script already behaves this way, so 6.6 fails cleanly against an old script.
- Never log `data` or the key.
- Add the Drive scope to `appsscript.json`. Deploy a **new version** of the same deployment, so the URL stays the same.
- The app never sends the key inside the backup (it strips `sheetLink.key`, `outbox` and `syncLog`). Add a server-side check anyway: reject a save whose decoded JSON still contains the current key string.

## 2. Catalog: staples and shelf life (WP58, WP60)

- In the Items sheet, mark these cooking basics as `staple = TRUE`: oils (olive, vegetable, canola, avocado, sesame, coconut), cooking spray, vinegars, salt, black pepper, dried spices and seasonings, sugar and brown sugar, flour, baking soda and powder, cornstarch, soy sauce and vanilla extract. Garlic, onions and other perishables stay normal. The app has a fallback regex (`STAPLE_RE` / `NOT_STAPLE` in v6.6), but the sheet should be the source of truth. List the rows you changed.
- Fill `fridge` / `pantry` shelf-life days where they are blank, using the table in `FirstCore.shelfGuess`: canned 365, jarred sauce 180, dry pasta and rice 365, bottled drinks 180, crackers and bars 90, shelf-stable sausage 60. Leave a cell blank when you're unsure. The app then shows the item under "No date" instead of marking it expired.
- Rebuild `catalog.json` (root and `export/`) with the catalog builder, and bump the catalog version.

## 3. Review the 6.6 app code

Read the `// ---------- 6.6 ----------` block in `Meal Prep App Mobile v6.6.dc.html` (useOf … post66) and the edits it relies on: `previewCook`, `acDefault`/`acVals`, `computeDays` (passed and usual meals, pattern factor), `setTripEnd` (shorten confirm, carry cap), `rc63` (summary, check card, old-date switch, auto-applied names) and `setupVals`. Report bugs as file and line with a one-line fix. Pay particular attention to:
- `migrate66` runs once (`mig66`), is undoable, and never shortens a date.
- `carryInfo` uses `FirstCore.carry`. Overspend is capped at half a week. Start fresh (`nextFresh`) sets the carry to 0 at the next trip start.
- `bfastOptFrom` is set to the day after the current trip for existing users, so a trip that is already running keeps its breakfast slots.
- `listAdds` from the cook sheet roll to the next trip when you've already shopped (`rollLists`, `addLists`).
- The backup schedule: on open after 12 s, after 30 changes, and after a receipt or "Cooked" at most once per 30 minutes. It retries after 30 minutes on an error and after 24 hours on an old script.

## 3b. Review the M2 code (WP56, WP61–WP65, WP67)
Read `post66b`, `keepOf`/`keepDefault`, `rateEff`, `dragTo`/`dragEnd`, `fpsStart`, `migrate66b` and the edits to `fillMenu`, `stockPlan`, the shopping-list grouping (stock lines merged into store sections), `calDayVals` and `prefOf`. Check these against the real screens, as the work order asks for WP63–WP67:
- Browse all shows rails per protein, and "See all" opens one group as a list. Cards are 148 px wide with a 100 px photo, and Add is 44 px tall. Breakfasts is now a kind tab. The Filters funnel holds the time, tag and sort options, Group by and Cook double.
- The shopping list has one row per item. Recipe need plus the always-stocked top-up go in its store section with a tag, the reasons sit behind ⋯, and there is no separate Always stocked group. "Already covered" is collapsed. Cart rows say Put back. A ticked row stays for 500 ms. Over-budget is amber everywhere.
- Calendar: Essentials is off by default and there is a legend. The day sheet leads with up to 3 meals that use the spoiling items (Add to menu, Put on [day]'s dinner). Items fold under "Items (N)". A past day shows "N past use-by · Review".
- After a receipt, Days shows one "Keep these stocked?" card: items bought 3 times in 6 weeks or twice in 3, plus essentials to track. "Not this" lasts 60 days. Seeded starters are cleared once (`mig66b`) and the seed list no longer runs. Opened new shows a toast with Undo.
- Settings order is Household, Prices and catalog (the Google Sheet row now sits at the top of that screen with its status), Backup, My items, Calendar, Help. The member editor uses the appetite slider. A stuck change puts a dot on the Settings tab.
- Second week: the keep list lives on the Plan next trip card. Meals whose main (most expensive) ingredient is in the kitchen are pre-ticked, and the rest drop at trip start. Fill scores expiring food (+1.5 per ingredient) and thumbs (±1.5). Thumbs fade after 60 days. Fill skips mains cooked in the last 9 days unless they have a heart, and shows "Uses up: …". Clear my thumbs is under My items. Rails tag uncooked recipes "New this week".
- Drags (Quick plan, Quick check) move through a ref with requestAnimationFrame and never set React state per move. Diagnostics › Show frame rate shows fps and the dropped share. Measure on the phone with 5 s of dragging and report the number.
- Ranges bar → item sheet with meals first (WP63) is not built yet. Add it if the item sheet allows it.

## 4. Ship

1. Confirm that task 1 is deployed and that a manual **Back up now** from a test copy writes a file to Drive.
2. Open `export/tools/selftest.html` and confirm all checks pass.
3. Replace `export/index.html` with `export/index-v6.6.html`, delete the `-v6.6` copy, and bump the cache version in `export/sw.js`.
4. Commit with a message naming WP54–WP60 and WP66 (M1).

## 5. Test on the Galaxy S25 Ultra (Chrome, installed app)

- Settings › Backup shows "Last backed up today at … to Google Drive". The file appears in Drive › Meal Prep backups and contains no app key and no photos. Restore lists counts and takes an automatic copy first.
- A receipt dated in the past with perishables shows the "already past their use-by" switch, off by default.
- Kitchen: canned tuna, marinara, sparkling water and summer sausage aren't flagged. Past items show as one amber line, "N past use-by · Review", and Toss ticked can be undone.
- Quick check: swipe right for Same and left for Gone, and Undo works.
- Cook sheet: missing olive oil offers "I have it" and "Add to my list". 2¾ cloves reads "3". Staples collapse into one line.
- Days: the header stays one line during cooking. Passed meals show in the "Earlier today" row. "+ Breakfast" appears on a new trip.

Also on the phone: Browse rails (2 visible at 360×640), Fill → My menu review bar, the store screen tick delay and Put back, the calendar day sheet, the keep-stocked card after a receipt, and the frame-rate counter while dragging Quick plan.

Report back:
- the script's deployment version
- the staple rows you changed
- any bugs you found in task 3
- the test results
