# Claude Code: recipe photos and steps from the web (6.4)

The 6.4 app (`design/source/Meal Prep App Mobile v6.4.dc.html`) already shows a photo and numbered steps for each recipe, and has a cook mode, but only once the catalog includes them. Each recipe in `catalog.json` needs two optional fields:

```json
{ "id": "d_tinga", "...": "...",
  "photo": "https://…/chicken-tinga.jpg",
  "steps": ["Heat the oil in a large skillet over medium heat.", "Add 1 onion, sliced, and cook 5 minutes until soft.", "…"] }
```

- **`photo`** is an https image URL, or it's left out.
- **`steps`** is an array of plain strings, one per step, written the way the site wrote them, with amounts left as written.
  - The app scales amounts like "2 cups broth" to your portions and converts them to the unit you picked for that ingredient.
  - It leaves times and temperatures ("11 minutes", "350°F") alone.
  - Don't scale or rewrite anything when storing the steps.

## 1. Sheet script: fetch once for every catalog recipe
In the Apps Script, add a menu item **Meal Prep › Fetch photos and steps**, plus a `recipe.fetchAll` action:

1. For each row in the Recipes sheet that has a `link` and an empty `steps` column:
   1. `UrlFetchApp.fetch(link, {muteHttpExceptions: true, followRedirects: true})`.
   2. Read the schema.org Recipe JSON-LD. Look in every `<script type="application/ld+json">`, including `@graph` arrays, and also accept `@type` given as an array.
   3. **photo:** `image` (a string, an array where you take the first item, or an object where you take `url`).
   4. **steps:** `recipeInstructions`. It can be a string, an array of strings, `HowToStep` objects with `text`, or `HowToSection` objects with `itemListElement`; flatten sections in order.
   5. Clean each step:
      - strip HTML tags and decode entities;
      - collapse whitespace;
      - drop empty steps and steps that are only a heading;
      - drop ad or "jump to recipe" text.
   6. If there's no JSON-LD, leave both fields empty and write `no-recipe-data` in a new `fetch_note` column. Don't scrape the visible page.
2. Write the results into new Recipes columns: `photo_url`, `steps` (a JSON array as text) and `fetched_at`.
3. Work in batches of 20 and stop before the 6-minute limit. Store the next row to process in script properties and set a time trigger to continue, so a single click handles the whole catalog.
4. Wait 1 s between fetches to the same host.
5. Re-fetch only when the `link` changes or someone clears `steps`.

Done when: running it on the current catalog fills `photo_url` and `steps` for every recipe that has a link and a recipe block, and the "Paneer butter masala" link from PR #4 gives at least 6 clean steps with no ad text.

## 2. Catalog builder and catalog.json
- `CatalogLib` / the builder: read `photo_url` → `photo` and `steps` (parse the JSON; if it fails, treat it as empty) into each recipe in `catalog.json`. Bump `catalogVersion`.
- Keep `schemaVersion` at 2. Both fields are optional, so older app builds ignore them.
- The phone gets them with its next catalog load. There's no extra request from the phone.

## 3. Recipes added from the web on the phone
`recipe-core.js` already reads recipe pages for "+ From the web". Make it return `photo` and `steps` the same way, so recipes the person imports get them as well. When those recipes are sent to the sheet (`recipe.add`), include both fields.

## 4. Tests
Add `test/recipe-steps.test.js` with saved page fixtures in `test/fixtures/` (strip all images and scripts except the JSON-LD). It needs at least: a HowToStep array, HowToSection groups, a plain string, an `@graph` page and a page with no JSON-LD. Check the cleaned step arrays and the photo URL.

Report:
- how many catalog recipes got steps and how many didn't, with the reason for each miss;
- any site that blocked the fetch.
