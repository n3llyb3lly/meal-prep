# Meal Prep

Files in this folder go in the root of the GitHub Pages repository:

- index.html: the app
- catalog.json: items, recipes and prices (built with tools/catalog-builder.html)
- sw.js: offline support
- manifest.webmanifest and icons/: the home-screen icon
- tools/catalog-builder.html: turns the master spreadsheet into catalog.json

## Updating prices or recipes

1. Edit the master spreadsheet. Paste price values, not lookups, and set price_date.
2. Open tools/catalog-builder.html, drop in the spreadsheet and the current catalog.json, and fix any errors.
3. Download catalog.json and upload it to GitHub, replacing the old one.
4. Open the app with a connection. It loads the new catalog and shows what changed. No app update prompt appears.

## Updating the app

1. Upload the new index.html.
2. Open sw.js and change VERSION (for example 4.5.0 to 4.5.1), then upload it. Without this step phones keep the old app.
3. Wait a few minutes for GitHub Pages, open the app, and tap Reload when it says "Update ready."

Replacing a file with the same name overwrites it, so you don't need to delete it first.

## First install on Android

Open the site in Chrome with a connection, tap the three dots, then Add to Home screen. Use the home-screen icon from then on: data entered in a Chrome tab and in the installed app can be treated differently for storage protection.
