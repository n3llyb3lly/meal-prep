# Claude Code: recipe kinds, breakfast mains and side pairings (6.5)

The 6.5 app (`design/source/Meal Prep App Mobile v6.5.dc.html`) sorts recipes into six kinds: **Main, Side, Dessert, Drink, Snack, Sauce**. It lets a main be marked **also good for breakfast**, pairs sides with mains and suggests which ones fit. Until the catalog says which kind each recipe is, the app guesses from the name and tags (`kindGuess`), and that guess is often wrong. This work makes the sheet the source of truth.

## 1. Code.gs: new Recipes columns
In the Recipes sheet, add:
- **`kind`**: one of `main`, `side`, `dessert`, `drink`, `snack` or `sauce`. Add data validation with a dropdown.
- **`also_breakfast`**: a TRUE or FALSE checkbox.
- **`sides`**: a comma-separated list of side recipe ids. It's filled from the Pairings tab (step 2). Don't edit it by hand.

When **Fetch photos and steps** runs (`recipe.fetchAll` / `recipeSteps_`) and the `kind` cell is empty, guess the kind from the JSON-LD and write it in. Never overwrite a kind someone has already set.
- `recipeCategory` or `keywords` containing side, side dish, accompaniment → `side`
- dessert, sweet, cake, pie, cookie → `dessert`
- drink, beverage, cocktail, smoothie, agua fresca → `drink`
- sauce, condiment, salsa, dressing, dip → `sauce`
- snack, appetizer → `snack`
- otherwise → `main`

Also write the guess to `fetch_note` as `kind guessed: side (recipeCategory "Side Dish")`, so the owner can check it.

`also_breakfast`: when the cell is empty, set TRUE only if `recipeCategory` includes breakfast or brunch and the recipe is a main.

## 2. Pairings tab
Create a **Pairings** tab with the columns `main_id`, `main_name`, `side_id`, `side_name` and `note`.
- Give `main_name` and `side_name` dropdowns from the Recipes sheet: mains only for one, sides only for the other. An onEdit trigger fills in the matching id.
- One row per pairing. A main can have many sides.
- Writing the catalog: group the rows by `main_id` into the Recipes `sides` column, or straight into the catalog (step 3).
- To start the tab, add a menu item **Meal Prep › Suggest pairings**. It writes suggested rows to a `Suggested pairings` tab, never to Pairings itself, using the same rules as the app's `sideScore`:
  - a shared cuisine tag;
  - curry, stew or masala with rice, naan or tortilla;
  - tacos with rice, beans or elote;
  - meat with salad, roasted vegetables or plantains;
  - pasta with salad or garlic bread.

  The owner copies over the rows they like.

## 3. Catalog builder and catalog.json
In `CatalogLib` and the builder, add these to each recipe in `catalog.json`:
```json
{ "kind": "side", "alsoBreakfast": false, "sides": ["s_rice", "s_plantains"] }
```
- `kind` is always written; if it's empty, write `main`.
- `alsoBreakfast` is written only when TRUE.
- `sides` is written only for mains that have pairings.
- Keep `schemaVersion` at 2 and bump `catalogVersion`.
- In the builder's check step:
  - flag a `sides` id that doesn't exist or isn't a side;
  - flag `also_breakfast` set on a recipe that isn't a main;
  - list how many recipes of each kind there are.

The catalog currently has only 3 sides and no rice side. List any missing basics (white rice, black beans, tortillas, garlic bread, green salad) in the report. Don't add them.

## 4. Outbox: send the phone's edits back
The app queues `recipe.kind {id, kind, alsoBreakfast}` whenever someone changes a recipe's kind or breakfast switch from its recipe sheet. That only happens when the sheet is connected.
- Code.gs: handle `recipe.kind` by writing `kind` and `also_breakfast` on that recipe's row.
  - For an own recipe (`u_…`) that isn't in the sheet yet, return `deferred` so the phone sends it again after `recipe.add`.
  - For an unknown id, return `rejected` with a reason.
- Use the existing retry, stuck and conflict rules (`sendOutbox` / `applyResults`).
- A pairing chosen on the phone (`sidePair`) belongs to one trip's menu item. Don't send it.

## 5. Tests
- `test/recipe-kinds.test.js`:
  - the JSON-LD kind guess, from fixtures with "Side Dish", "Dessert", "Drinks", "Condiment" and no category;
  - a kind someone set is never overwritten;
  - grouping Pairings rows into `sides`;
  - the builder export fields and checks;
  - `recipe.kind` for a catalog id, an own id (deferred) and an unknown id (rejected).
- Load `kindGuess` from the app source the same way `test/recipe-steps.test.js` loads app code. Check these:
  - Llapingachos → main with alsoBreakfast;
  - Tres leches → dessert;
  - Agua de pepino → drink;
  - Ají de queso → sauce;
  - Salvadoran pupusas with curtido → main;
  - Smashed cucumber salad → side.

Report:
- the count of each kind after the fetch;
- every guessed kind, so the owner can review them;
- the missing side basics.
