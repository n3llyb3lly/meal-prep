# Meal Prep

An Aldi meal planning, shopping and kitchen tracker that runs in the phone's browser and installs to the home screen. It works offline after the first visit.

Since version 5.3 the catalog (items, prices, Aldi numbers, recipes) lives in a **Google Sheet**. The app reads it through a small Apps Script attached to the sheet, and sends changes made on the phone back to it. This repository is the website (GitHub Pages): the files at the root are the live app.

## What's here

| File | What it is |
| --- | --- |
| `index.html` | The app (one self-contained file, version 5.3) |
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
| `.nojekyll` | Tells GitHub Pages to serve the files as they are |

## Day to day

- **Change prices, items, Aldi numbers or recipes:** edit the Google Sheet (computer or the Sheets phone app). The phone picks it up the next time the app opens with a connection.
- **On the phone:** receipts, new items, price fixes, new recipes, "my versions" and Aldi numbers are sent to the sheet by themselves. Offline, they wait and go out when you're back online. Settings › Google Sheet shows "N waiting to send" and has **Send now**.
- **Same thing changed in both places:** the sheet wins, and the app says so (for example "Whole milk: the sheet's price $2.99 was kept.").
- **Check the sheet for mistakes:** in the sheet, **Meal Prep › Check data**.

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
