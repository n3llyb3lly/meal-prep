# Meal Prep

An Aldi meal planning, shopping and kitchen tracker that runs in the phone's browser and installs to the home screen. It works offline after the first visit.

This repository is set up for GitHub Pages: the files at the root are the live site.

| File | What it is |
| --- | --- |
| `index.html` | The app (a single self-contained file) |
| `catalog.json` | Items, recipes and prices, built with the catalog builder |
| `sw.js` | Offline support |
| `manifest.webmanifest`, `icons/` | Home-screen name and icon |
| `tools/catalog-builder.html` | Turns the master spreadsheet into `catalog.json`, and reads "Export my additions" files from the phone |
| `tools/selftest.html` | Checks the app's rules (budget, staples, packages, batches, sale rule, colour contrast) |
| `tools/components.html` | Every shared part of the app once, in light and dark |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are |
| `design/` | Design sources, spreadsheets, guide and history. Not used by the live site |

## Publish on GitHub Pages

1. Create a repository on github.com (for example `meal-prep`). Free Pages needs it to be **Public**.
2. Upload everything in this folder, keeping the layout. Either push it with git, or on the repository page use **Add file › Upload files** and drag in the files and folders. The web uploader skips files whose names start with a dot, so add `.nojekyll` separately (**Add file › Create new file**, name it `.nojekyll`, leave it empty).
3. Open **Settings › Pages**. Under "Build and deployment", set Source to **Deploy from a branch**, Branch to **main** and folder to **/ (root)**, then **Save**.
4. After a minute or two the link appears at the top of that page: `https://YOUR-USERNAME.github.io/meal-prep/`.
5. Open `…/tools/selftest.html` on that site. Every check should pass.

### First install on the phone

- **Android:** open the site in Chrome with a connection, tap the three dots, then **Add to Home screen**. Use the home-screen icon from then on: data entered in a Chrome tab and in the installed app can be treated differently for storage protection.
- **iPhone:** open the site in Safari, tap Share, then **Add to Home Screen**.

## Deploy checklist

1. Open `tools/selftest.html`. Every check should pass.
2. Data change: build `catalog.json` with `tools/catalog-builder.html` and upload it.
3. App change: upload `index.html` (and any changed `tools/` pages).
4. Open the installed app with a connection and confirm "Update ready. Reload." appears, then reload.

## Updating prices or recipes

1. Edit the master spreadsheet in `design/data/`. Paste price values, not lookups, and set `price_date`.
2. Open `tools/catalog-builder.html`, drop in the spreadsheet and the current `catalog.json`, and fix any errors.
3. Download `catalog.json` and upload it here, replacing the old one.
4. Open the app with a connection. It loads the new catalog and shows what changed. No app update prompt appears.

## Updating the app

Upload the new `index.html`. Phones that are online get it the next time the app opens, and an app that is already open shows "Update ready." with a **Reload** button. Replacing a file with the same name overwrites it, so you don't need to delete it first. Settings › Help and about shows the build (the first 7 characters of the file's fingerprint) next to the catalog version, so you can tell which upload a phone is running.

`sw.js` only changes if offline support itself changes.

## How the app is built

- **Source:** `design/Meal Prep App Mobile v5.dc.html`, a Claude Design component: one HTML file with an inline-styled template and a logic class. It runs on `design/support.js` (the component runtime) and React.
- **Shared rules:** `design/tools/meal-core.js` holds the budget formula, trip length, staple states, whole-package costing, oldest-first batches, the 8% sale rule, units and the colour tokens. The app, the self-test and the components page all load it, so a rule changes in one place.
- **Built-in data:** `design/data/master.js` is the catalog baked into the app for the first run. `catalog.json` replaces it when the app is online.
- **Build:** Claude Design bundles the source and everything it loads (support.js, data/master.js, tools/meal-core.js, React, fonts) into one self-contained `index.html`. The same step turns `Catalog Builder.dc.html` into `tools/catalog-builder.html`, `Self Test.dc.html` into `tools/selftest.html` and `Components.dc.html` into `tools/components.html`. After a design change, ask Claude Design to "bundle the app to export" and copy the output files to the root of this repository.
- **Colours:** the app's `<helmet>` defines CSS variables for light and dark (dark follows the phone's setting). They mirror `TOKENS` in `meal-core.js`. If you change a colour, change both.

## What's in `design/`

- `Meal Prep App Mobile v5.dc.html`: current app source. v3, v4 and earlier versions are kept for reference.
- `Catalog Builder.dc.html`, `Self Test.dc.html`, `Components.dc.html`: sources of the tools pages.
- `Meal Prep App Guide v5.md`: what every screen and button does.
- `CLAUDE.md`: decisions and notes from each work order.
- `data/`: master spreadsheets, the built-in catalog and work-order notes.
- `chats/`: the design conversations.
- `screenshots/`, `uploads/`: reference images, the original work order and price sheet.
- `old-builds/meal-prep-v1.html`: the first single-file version.
- `HANDOFF.md`: the Claude Design handoff note.
