# Claude Code: make the app learn from use

The app is meant to get better the more it's used. Right now most of what it learns stays on one phone, in a few separate stores:
- `aliases` (printed text → item)
- `numLinks` (store:number → item)
- `nameDict` (word expansions)
- `brandDict` (cleaned name → brand)
- `variants` and `numVar`
- `usageLog` and essentials cycles (use rates)

The rules live in `tools/receipt-core.js` (`suggest`, `ocrFix`, `cleanName`, `guessGroup`, `fixNum`) and `tools/house-core.js`. Nothing measures whether the guesses are getting better.

Build the pieces below in this order. Each one is its own commit, with tests under `test/` (`node --test`). Keep everything on the phone unless a step says to send it to the sheet. Never send receipt photos, card digits or store addresses anywhere.

## 1. One place for what the app has learned
Add a single learned-knowledge layer to `tools/learn-core.js` (window.LearnCore) that sits over the existing keys. Don't add more scattered keys.
- `record(kind, key, value, source)`. Kinds: `name`, `brand`, `flavor`, `group`, `number`, `word`, `size`, `price`.
- Sources: `receipt-confirmed`, `user-edit`, `catalog`, `suggestion-accepted`. Each record keeps a count, a first and last date, and the last value.
- `best(kind, key)` returns the value with the highest weight. A user edit counts 3, an accepted suggestion 1 and the catalog 2. Weights fade by half every 120 days.
- Migrate the existing keys into it on load, and keep writing the old keys for one release so 6.3 backups still restore.

Done when: the self-test shows that a brand typed twice for "Mild cheddar" beats the built-in Happy Farms guess, and that an edit from 200 days ago loses to one from last week.

## 2. Learn from every correction on the receipt screen
`import63()` already saves name expansions and brands. Extend it to record:
- every repaired OCR word (`ocrFix` changes) that the person didn't undo, as `word` (for example sov → soy);
- every corrected item number (`fixNum` from → to), as `number`. Next time, a misread that has already been seen becomes an exact hit;
- every price the person edited on a row, as a doubt signal for that character pair (for example 8 printed, 3 typed). Feed it to `confusable()` so the total solver prefers swaps the person has made before;
- the chosen category, subcategory and flavor for each new item, keyed by the cleaned name and by the first two words, so "Colby jack slices" inherits from "Colby jack shreds";
- **Use** and **Use all suggestions**, as `suggestion-accepted`. A suggestion the person changed is recorded under `user-edit` with the old value kept, so we can count misses.

Done when: logging the 10/10 receipt twice in a row needs zero edits the second time, and the self-test replays it.

## 3. Use the learned knowledge first
- `suggest()` checks LearnCore before the built-in rules for name, brand, flavor and group. The `brandFrom` value becomes `learned` and the row shows "From your earlier receipts".
- `ocrFix()` adds learned words to its vocabulary, plus every word in catalog names, aliases and recipe ingredient names.
- `fixNum()` uses learned misread → number pairs before guessing from one-digit differences.
- `rowFrom()` tries learned printed text → item before fuzzy matching. Fuzzy matching should run on the repaired text, and each learned alias should add 0.1 to the match score.

## 4. Share what is safe through the Google Sheet
Add an outbox type `learn.batch` sent once per receipt import. It holds up to 50 records of kind `word`, `name`, `brand`, `group` and `number` (store:number → item id). Never include prices, dates or quantities.
- Sheet script: a `Learned` tab with kind, key, value, count and last_seen, merged by kind + key + value with counts added up.
- Catalog builder: a "Learned from the phone" step that proposes alias rows, Aldi number rows and brand and flavor columns. The owner accepts them in bulk.
- On catalog load, the phone reads the `Learned` tab back as source `catalog`, so a second phone starts out smart.

Only build this after the 6.3 sheet-script prompt (variants) has landed. Use the same retry and stuck rules as `sendOutbox`.

## 5. Measure it
Keep a small local log (`aldi-meal-prep:learnstats`, not undoable). For each receipt, store:
- items read;
- matched by number, alias or fuzzy;
- suggestions shown, accepted unchanged and edited;
- OCR words repaired, and repairs undone;
- price digits the person edited;
- seconds from **Read** to **Add**.

Show it in Settings › Help and about › Diagnostics as one line per receipt, plus a 5-receipt trend: "Edits per receipt 27 → 9 → 3". Add a self-test group that replays the 10/10 fixture through two imports and checks that the edit count drops.

## 6. Smarter defaults from what you buy
- Count how often each item is bought and at what interval, from receipts. Feed that into always stocked (suggest "Keep eggs stocked? You buy them every 6 days"), into the shopping list order (frequent items first in each category), and into the evening-check chips.
- Learn package sizes by item and store from receipts, and stop asking once the same size has been seen twice.
- Learn the usual price per item and store as a median of the last 5 receipts, and use it in place of the catalog price once there are 3 or more. Mark it "your price" in the item card.

Report at the end:
- what is learned locally and what is sent to the sheet;
- the before and after edit count on the fixture;
- anything you couldn't test without a real phone.
