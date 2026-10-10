# Meal Prep

An Aldi meal planning, shopping and kitchen tracker that runs in the phone's browser and installs to the home screen. It works offline after the first visit.

Since version 5.3 the catalog (items, prices, Aldi numbers, recipes) lives in a **Google Sheet**. The app reads it through a small Apps Script attached to the sheet, and sends changes made on the phone back to it. This repository is the website (GitHub Pages): the files at the root are the live app.

## What's here

| File | What it is |
| --- | --- |
| `index.html` | The app (one self-contained file, version 6.1) |
| `sw.js` | Offline support. Never stores replies from the Google Sheet script, so sheet edits always come through |
| `manifest.webmanifest`, `icons/` | Home-screen name and icon |
| `catalog.json` | Fallback catalog, used only on a phone that has never reached the sheet |
| `tools/selftest.html` | Checks the app's rules (budget, staples, packages, batches, sale rule, colour contrast) |
| `tools/catalog-builder.html` | The old way to make `catalog.json` from a spreadsheet. Only needed if you stop using the sheet |
| `tools/components.html` | Every shared part of the app once, in light and dark |
| `design/sheets/Code.gs` | The Apps Script that lives in the Google Sheet (a copy, for safekeeping) |
| `design/sheets/Claude Design - Google Sheet sync.md` | How the sync works, the test plan, limits and how to undo it |
| `design/sheets/*.xlsx` | The sheet layout used to set up the Google Sheet |
| `design/Meal Prep App Guide v5.md` | What every screen does |
| `receipts.js` | Reads receipts from Aldi, Sam's Club, Walmart, Cub and Target (typed, CSV or photo text). The app loads it; fixes reach phones without an app update |
| `vendor/tesseract/` | The on-phone text reader for **Scan receipt** (Tesseract.js 5, about 11 MB). Downloaded the first time someone scans, then works offline |
| `tools/receipts-test.html` | Runs `receipts.js` on the sample receipts in `data/receipts/` and shows pass or fail |
| `data/receipts/` | Sample receipts per store, an OCR-damaged copy of each, and raw text the phone's reader got from photos |
| `catalog-v1.json` | (from the builder) the catalog for phones still on 5.3, only if you go back to GitHub files |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are |

## Day to day

- **Change prices, items, Aldi numbers or recipes:** edit the Google Sheet (computer or the Sheets phone app). The phone picks it up the next time the app opens with a connection.
- **On the phone:** receipts, new items, price fixes, new recipes, "my versions" and Aldi numbers are sent to the sheet by themselves. Offline, they wait and go out when you're back online. Settings › Google Sheet shows "N waiting to send" and has **Send now**.
- **Same thing changed in both places:** the sheet wins, and the app says so (for example "Whole milk: the sheet's price $2.99 was kept.").
- **Check the sheet for mistakes:** in the sheet, **Meal Prep › Check data**.
- **Food types and household items** (version 6.1): see the section at the end.

## Updating the app

Upload the new `index.html` to this repository, replacing the old one. Phones that are online get it the next time the app opens; an app that is already open shows "Update ready." with a **Reload** button. Settings › Help and about shows the version.

`sw.js` only changes if offline support itself changes.

## Updating the script

1. Paste the new code into the sheet's **Extensions › Apps Script** › `Code.gs`, and save.
2. **Deploy › Manage deployments ›** pencil icon **› Version: New version › Deploy.** The address stays the same, so the app keeps working. Never use **New deployment** (that makes a new address).
3. Keep the copy in `design/sheets/Code.gs` up to date.

## Backups

- **The sheet:** Google keeps every version (**File › Version history**). Once a month, **File › Download › Microsoft Excel (.xlsx)** and keep it somewhere else.
- **The phone:** Settings › Backup and restore › **Save as file** once a week.

## Going back to catalog.json

1. On the phone: Settings › Google Sheet › **Disconnect**. The app reads `catalog.json` from this repository again.
2. To refresh `catalog.json`: download the sheet as .xlsx, open `tools/catalog-builder.html`, drop in the .xlsx and the current `catalog.json`, then upload the new `catalog.json` here.

## First install on a phone

- **Android:** open the site in Chrome with a connection, tap ⋮, then **Add to Home screen**. Always open the app from that icon.
- **iPhone:** open it in Safari, tap Share, then **Add to Home Screen**.
- Then Settings › Google Sheet: paste the app address and key (in the sheet: **Meal Prep › Show the app address and key**) and tap **Test and save**.

## Stores, the item tree and receipt scanning (version 6)

- **Stores** live on the sheet's Stores tab: `id`, `name`, `num_digits` (how many digits the store's item numbers have, several separated by semicolons) and `num_where` (`before` or `after` the description on the receipt).
- **Offers** hold prices: one row per item per store, with that store's size and item numbers. The Items price columns copy the Aldi offer.
- **Nodes** are the item tree: 1 Category, 2 Type, 3 Form, 4 Variety, 5 Style. A recipe ingredient can be a node (`n_…`); the phone uses your favorite product under it, otherwise the cheapest.
- **Favorites** pick one product per node.
- The script serves version 5.3 phones the old shape (`schema 1`) and version 6 phones the new one (`?schema=2`).

### Adding a store

1. Add a row to the sheet's **Stores** tab, for example `costco, Costco, 6;7, before`.
2. In `receipts.js`, add the store to `STORES` (number length and position) and its name to `NAMES` (how `detectStore` recognises it). If its receipts have special lines (savings, quantities, departments), handle them in `parseInner` the way Sam's `INST SV` and Cub's departments are.
3. Type one real receipt into `data/receipts/<store>-sample.txt` with its exact line breaks, and an OCR-damaged copy as `<store>-ocr.txt`. Add the expected date, item count, subtotal, tax and total to `EXPECT` in `tools/receipts-test.html`.
4. Open `tools/receipts-test.html`. Every receipt should pass. Upload `receipts.js`; phones pick it up the next time they're online.

## Food types and household items (version 6.1)

Six columns on the **Items** tab. **Meal Prep › Set up sheets and dropdowns** adds them, with checks.

| Column | For | What to put |
| --- | --- | --- |
| `food_types` | food | What it contains: `pork`, `beef`, `poultry`, `fish`, `shellfish`, `dairy`, `egg`, `gluten`, `peanut`, `tree_nut`, `soy`, `sesame`. Several separated by semicolons, e.g. `egg; dairy`. Blank if none |
| `group` | household items | `kitchen`, `paper`, `cleaning` or `personal`. **Blank means food** |
| `unit_label` | household items | What you count: roll, bag, bottle |
| `units_per_package` | household items | How many come in one package (a whole number) |
| `typical_days` | household items | About how many days one lasts |
| `scales_with_people` | household items | `Y` if more people use it up faster |

- **Meal Prep › Suggest food types** fills blank `food_types` cells from the item names (chicken → poultry, pasta → gluten). It never changes a cell you filled in. Check the result: it's a guess from the name, not from the label.
- **Meal Prep › Add starter household items** adds the app's 27 household items (trash bags, paper towels, soap and so on) with estimated prices, a Household category and a Household node. Running it again adds nothing new.
- The app uses food types for each person's **Can't eat / Dislikes / Likes** (Settings › Household). It is not an allergen check.
- Household items from the sheet replace the app's built-in list of the same name, so their prices and package sizes come from the sheet. Version 5.3 and 6.0 phones see household items as ordinary items and ignore the new columns.
