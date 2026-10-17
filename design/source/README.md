# Editable source for the app (6.3.1)

`index.html` in the repo root is a bundled build. This folder holds the editable source it was built from:

- `Meal Prep App Mobile v6.3.dc.html` is the app. It loads `support.js` and `tools/*.js` next to it.
- `tools/receipt-core.js` (window.ReceiptCore) holds the receipt reading rules and suggestions.
- `tools/house-core.js` (window.HouseCore) holds the household, portion and gallery rules.
- `tools/meal-core.js` (window.MealCore) holds the shared rules, units and tokens.
- `tools/catalog-lib.js` is used by the catalog builder.
- `Self Test.dc.html` is the self-test. Open it in a browser and every check should pass.

## Working on it in Claude Code
1. Edit the files here, not `index.html`.
2. To test, serve the folder (`npx serve design/source`) and open `Meal Prep App Mobile v6.3.dc.html` and `Self Test.dc.html`.
3. To ship, either:
   - bring the changed files back into Claude Design and re-bundle `index.html` there, or
   - copy the changed `tools/*.js` into the build. `index.html` inlines them, so it has to be rebuilt; a changed tools file alone does nothing on the phone.
4. Keep the `window.__mp` hook. Tests use it to drive the app.

## Order for the prompts
1. The sheet script: prompt 4 in `Claude Code - receipt reader prompts.md`.
2. `Claude Code - learning prompt.md`, steps 1–3, 5 and 6.
3. The learning prompt's step 4 (sharing with the sheet), only after the sheet script is live.
