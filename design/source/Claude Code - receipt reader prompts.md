# Claude Code: receipt reader work order (WP47–WP52), repo parts

The app side is built in `Meal Prep App Mobile v6.3.dc.html`, with the shared rules in `tools/receipt-core.js` (window.ReceiptCore). The parts below need the repository. Ship them as separate commits in this order. The repo is public, so never commit a receipt image.

## Prompt 1: confirm the reader, vendor it, ignore test photos

Read `index.html` (the bundled 6.3 build) and find `loadOcr()`. It loads `./vendor/tesseract/tesseract.min.js` and falls back to the jsDelivr CDN at `tesseract.js@5`.

1. Check whether `vendor/tesseract/` exists in the repo with `tesseract.min.js`, `worker.min.js`, the core wasm files and `eng.traineddata.gz`. If any are missing, add tesseract.js 5.1.x from npm (dist files plus tesseract.js-core and the `eng` 4.0.0_best_int traineddata). Write the version in `vendor/tesseract/VERSION`.
2. Add `sw.js` precache entries for those files, so a second scan works offline.
3. Add `test-images/` and `*.jpg`, `*.jpeg`, `*.png` under `test-images/` to `.gitignore`. Add `test-images/README.md`: "Receipt photos for local testing only. Never commit them: they show card digits, a cashier name and a store address."
4. Run `git log --all -- '*.jpg' '*.jpeg' '*.png'` and report any receipt photo already in history. Don't rewrite history without asking.

Done when: the vendor files load from the same origin (check the Network tab on the installed app), and `git status` shows no image after copying a photo into `test-images/`.

## Prompt 2: share target (WP47 item 4)

The app reads shared photos from the Cache API on open. Here is the contract:
- The app opens with `?share=1`.
- It reads every entry in the cache named `meal-prep-share`, turns each response body into an image File, deletes the entry, and loads the files into Add receipt.

Build the other half:
1. In `manifest.webmanifest`, add:
   ```json
   "share_target": {"action": "./share", "method": "POST", "enctype": "multipart/form-data",
     "params": {"files": [{"name": "receipt", "accept": ["image/*"]}]}}
   ```
2. In `sw.js`, handle `POST` to `./share`:
   - read `formData().getAll('receipt')`;
   - put each file in `caches.open('meal-prep-share')` under `./shared/<timestamp>-<i>`;
   - respond with `Response.redirect('./?share=1', 303)`.
   Keep the rule that off-site requests bypass the worker.
3. Bump the cache version in `sw.js`.

Done when: on Android, sharing a photo from Google Photos to the installed Meal Prep opens Log receipt with the photo shown as a thumbnail and **Read 1 photo** ready. Test it from the home-screen icon, not a browser tab.

## Prompt 3: receipts.js parity (WP48, WP49)

`receipts.js` (window.ReceiptParsers) is still used for stores other than Aldi. For Aldi, the app now uses `ReceiptCore.parseLines` first.
1. Read `tools/receipt-core.js` and keep `receipts.js` in step with it for Aldi:
   - footer facts (subtotal, each `X-Taxable` line, TOTAL with spaced letters, `N ITEMS`, the date and time on the card line);
   - weight lines `(N) 1.54 lb x 0.85/lb` attached to the line above;
   - discount lines attached to the line above;
   - no stop at payment lines, because the Aldi footer comes after the card details.
2. Add a `node --test` file that loads both scripts in a fake `window` and checks the 10/10 ground truth from `ReceiptCore.F1010` (via `fixtureText`): 49 items, $137.25 + $0.14 = $137.39, yogurt ×6, tomatoes 1.54 lb at $0.85.

Done when: both parsers give the same items for the fixture text, and the test runs in CI.

## Prompt 4: sheet script, variants and receipt names (WP51, WP52)

The phone now keeps these new layer keys:
- `variants` `{itemId: [{vid, brand, flavor, nums: {store: [num]}, last: {price, date, store}}]}`
- `numVar` `{"store:num" or bare Aldi num: vid}`
- `nameDict` (learned name expansions)

Receipt rows now carry `text` and `vid`. Items created from a receipt are own items (`u_…`) with `src:'receipt'`, a size taken from the printed text, and `unsorted:true` if the person chose **Decide later**.

1. Extend the Apps Script to accept `variant.add {item, vid, brand, flavor}` and `variant.number {vid, store, num}`. Store them in a new Variants sheet (item_id, variant_id, brand, flavor, store, numbers, last_price, last_date). The phone doesn't queue these yet. Add the outbox calls in `import63()` after the script is live, the same way `number.link` is queued.
2. Add a Brand and a Flavor column to the builder's Items sheet export, and have `CatalogLib.additions` export variants as rows.
3. Check that `item.add` from a receipt carries pack, unit and pkg from the size parser (for example "12 oz", "12-count", "1 L" stored as 33.81 fl oz).

Done when: logging the 10/10 receipt on the phone with the three ice creams named sends three variant rows under one item, and the next catalog load keeps them.

## Prompt 5: design export (WP53)

Run the bundled app at 360×800 and 412×915, in light and dark, with the 10/10 fixture. In the console: `__mp.openReceipt()`, then set the draft's `pasteText` to `ReceiptCore.fixtureText(ReceiptCore.F1010)` and call `__mp.readText63(...)`. Save each state in WP53 to `design/handoff/receipt/<state>-<theme>.png`. For the crop strip and the doubtful-digit states, you need a real photo from `test-images/`. List any state you couldn't reach.
