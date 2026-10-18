// node --test: recipe photos and steps. The same pages go through the sheet script (Code.gs, Fetch photos and steps)
// and the app (recipe-core.js, "+ From the web"); both must give the same photo and steps.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { loadScripts } = require('./load');
const { loadCodeGs } = require('./apps-script-mock');
const RC = loadScripts(['design/source/tools/recipe-core.js']).RecipeCore;
const L = loadScripts(['design/tools/catalog-lib.js']).CatalogLib;
const plain = x => JSON.parse(JSON.stringify(x));
const DIR = path.join(__dirname, 'fixtures', 'recipe-steps');
const page = f => fs.readFileSync(path.join(DIR, f), 'utf8');
const blocksOf = html => [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const AD = /jump to|pin this|subscribe|newsletter|tag @|share a photo|advertisement/i;

const PAGES = {
  'paneer-butter-masala.html': {
    url: 'https://www.indianhealthyrecipes.com/paneer-butter-masala-restaurant-style/',
    photo: 'https://www.indianhealthyrecipes.com/wp-content/uploads/2023/07/paneer-butter-masala-recipe.jpg',
    steps: [
      'Heat 1 tablespoon butter and 1 tablespoon oil in a pan over medium heat. Add 2 green cardamoms and sauté for a few seconds until fragrant.',
      'Add 1 cup sliced onions and fry until they turn golden, about 6 minutes.',
      'Stir in 1½ cups chopped tomatoes and 12 cashews. Cook until the tomatoes are soft and mushy.',
      'Cool the mixture, then blend it with ½ cup water to a smooth paste.',
      'Return the pan to the stove. Add the ginger garlic paste and sauté until the raw smell goes away, about 1 minute.',
      'Pour in the blended paste. Add 1 teaspoon Kashmiri red chili powder and ¾ teaspoon garam masala, and cook until the paste thickens and the butter leaves the sides.',
      'Add 1 cup water and simmer for 5 to 6 minutes. Taste and add salt.',
      'Crush 1 teaspoon kasuri methi between your palms and add it with ¼ cup cream.',
      'Add the paneer cubes and simmer for 2 minutes, until soft. Do not overcook.',
      'Garnish with 2 tablespoons chopped coriander leaves. Serve with naan or rice.'] },
  'baked-ziti-howtostep.html': {
    url: 'https://www.allrecipes.example/recipe/11758/baked-ziti/',
    photo: 'https://www.allrecipes.example/thmb/baked-ziti.jpg',
    steps: [
      'Bring a large pot of lightly salted water to a boil. Add ziti pasta, and cook until al dente, about 8 minutes; drain.',
      'Meanwhile, brown onion and ground beef in a large skillet over medium heat. Add spaghetti sauce, and simmer 15 minutes.',
      'Preheat the oven to 350 degrees F (175 degrees C). Butter a 9x13-inch baking dish.',
      'Layer as follows: ½ of the ziti, provolone cheese, sour cream, ½ sauce mixture, remaining ziti, mozzarella cheese, and remaining sauce mixture. Top with grated Parmesan cheese.',
      'Bake in the preheated oven until cheeses are melted, about 30 minutes.'] },
  'chili-graph.html': {
    url: 'https://www.budgetbytes.example/one-pot-chili-pasta/',
    photo: 'https://www.budgetbytes.example/wp-content/uploads/one-pot-chili-pasta-pot.jpg',
    steps: [
      'Dice the onion and mince the garlic. Add the olive oil, onion, and garlic to a large deep skillet or Dutch oven and sauté over medium heat until the onions are soft and transparent (about 5 minutes).',
      'Add the ground beef and continue to sauté until the beef is fully browned.',
      'Add the chili powder, cumin, oregano, garlic powder, cayenne pepper, & smoked paprika. Stir and sauté for one minute more.',
      'Drain the black beans and add them to the skillet along with the diced tomatoes, pasta, and beef broth. Stir until everything is evenly combined.',
      'Place a lid on the skillet, turn the heat up to medium-high, and let it come up to a boil. Once boiling, reduce the heat to low and let simmer for 10–12 minutes, stirring occasionally, until the pasta is tender.',
      'Top with 1 cup shredded cheddar and sliced green onions. Serve.'] },
  'lemon-chicken-string.html': {
    url: 'https://example-kitchen.com/lemon-herb-chicken',
    photo: 'https://cdn.example-kitchen.com/lemon-herb-chicken.jpg',
    steps: [
      'Preheat the oven to 400°F.',
      'Whisk 2 tablespoons olive oil with the juice of 2 lemons, 3 cloves minced garlic and 1 teaspoon oregano.',
      'Pour over 4 chicken breasts in a baking dish and turn to coat.',
      'Bake for 22 to 25 minutes, until the chicken reaches 165°F.',
      'Rest 5 minutes before slicing.'] },
  'tacos-sections-numbered.html': {
    url: 'https://www.isabeleats.example/chicken-tinga/',
    photo: 'https://www.isabeleats.example/wp-content/uploads/chicken-tinga.jpg',
    steps: [
      'Place the chicken in a pot, cover with water and simmer for 20 minutes. Shred with two forks.',
      'Heat the oil in a large skillet over medium heat. Add 1 onion, sliced, and cook 5 minutes until soft.',
      'Blend the tomatoes, chipotle peppers and garlic until smooth. Pour into the skillet and simmer 5 minutes.',
      'Stir in the shredded chicken. Serve in warm tortillas.'] },
  'no-jsonld.html': { url: 'https://example.com/soup', none: true }
};

for (const [file, want] of Object.entries(PAGES)) {
  test(`${file}: photo and steps, the same in the sheet script and the app`, () => {
    const html = page(file);
    const { g: G } = loadCodeGs({});
    const gs = plain(G.recipeSteps_(html, want.url));
    const n = RC.findRecipe(blocksOf(html));
    if (want.none) {
      assert.deepStrictEqual(gs, { found: false, photo: '', steps: [] });
      assert.strictEqual(n, null);
      return;
    }
    assert.strictEqual(gs.found, true);
    assert.deepStrictEqual(gs.steps, want.steps);
    assert.strictEqual(gs.photo, want.photo);
    const app = RC.fromSchema(n, want.url);
    assert.deepStrictEqual(plain(app.steps), want.steps, 'the app reads the same steps');
    assert.strictEqual(app.photo, want.photo, 'the app reads the same photo');
    for (const s of want.steps) assert.doesNotMatch(s, AD);
  });
}

test('the paneer butter masala page gives at least 6 clean steps', () => {
  const { g: G } = loadCodeGs({});
  const r = G.recipeSteps_(page('paneer-butter-masala.html'), PAGES['paneer-butter-masala.html'].url);
  assert.ok(r.steps.length >= 6);
  for (const s of r.steps) { assert.doesNotMatch(s, AD); assert.doesNotMatch(s, /[<>]|&[a-z]+;/); }
});

test('step cleaning: headings, numbering, ads and odd shapes', () => {
  const steps = v => plain(RC.stepsOf({ recipeInstructions: v }));
  assert.deepStrictEqual(steps('1. Mix it. 2. Bake it. 3. Eat.'), ['Mix it.', 'Bake it.', 'Eat.']);
  assert.deepStrictEqual(steps('<ol><li>Preheat oven to 350&deg;F.</li><li>Bake 11 minutes.</li></ol>'), ['Preheat oven to 350°F.', 'Bake 11 minutes.']);
  assert.deepStrictEqual(steps(['For best results, chill overnight.', 'FOR THE GARNISH', 'To serve:', 'Step 3', '']), ['For best results, chill overnight.']);
  assert.deepStrictEqual(steps([{ '@type': 'HowToStep', itemListElement: [{ '@type': 'HowToDirection', text: 'Stir.' }, { '@type': 'HowToTip', text: 'Use a wooden spoon.' }] }]), ['Stir.', 'Use a wooden spoon.']);
  assert.deepStrictEqual(steps([{ '@type': 'HowToStep', name: 'Simmer 10 minutes.' }]), ['Simmer 10 minutes.']);
  assert.deepStrictEqual(steps('&lt;p&gt;Add &lt;b&gt;2 cups&lt;/b&gt; broth.&lt;/p&gt;'), ['Add 2 cups broth.']);
  assert.deepStrictEqual(steps(undefined), []);
  assert.strictEqual(RC.photoOf({ image: 'http://insecure.example/a.jpg' }), '');
  assert.strictEqual(RC.photoOf({ image: '/a.jpg' }, 'https://site.example/r/1'), 'https://site.example/a.jpg');
  // Code.gs cleans the same way
  const { g: G } = loadCodeGs({});
  for (const v of ['1. Mix it. 2. Bake it. 3. Eat.', ['FOR THE GARNISH', 'Simmer. Jump to Recipe']]) assert.deepStrictEqual(plain(G.stepsOf_({ recipeInstructions: v })), steps(v));
});

// ---------- Fetch photos and steps on the Recipes sheet ----------
const H = ['recipe_id', 'meal', 'name', 'servings', 'total_min', 'link', 'active', 'last_changed', 'changed_by'];
const recRow = (id, link) => [id, 'dinner', id, 4, 30, link, 'Y', '', ''];
function sheetWith(rows, pages) {
  const env = loadCodeGs({ Items: [['item_id', 'name', 'unit', 'package_qty', 'price'], ['paneer', 'Paneer', 'oz', 8, 3]], Recipes: [H, ...rows],
    Ingredients: [['recipe_id', 'item_id', 'qty'], ...rows.map(r => [r[0], 'paneer', 8])] });
  const { g: G } = env;
  const asked = [], triggers = [];
  G.UrlFetchApp = { fetch: url => { asked.push(url); const p = pages[url];
    if (p === 403) return { getResponseCode: () => 403, getContentText: () => 'blocked' };
    if (p == null) throw new Error('DNS'); return { getResponseCode: () => 200, getContentText: () => page(p) }; } };
  const waits = [];
  G.Utilities.sleep = ms => { waits.push(ms); };
  G.ScriptApp = { getProjectTriggers: () => triggers, deleteTrigger: t => triggers.splice(triggers.indexOf(t), 1),
    newTrigger: fn => ({ timeBased: () => ({ after: ms => ({ create: () => triggers.push({ getHandlerFunction: () => fn, ms }) }) }) }) };
  const col = h => env.sheet('Recipes')._data[0].indexOf(h);
  const cell = (id, h) => { const d = env.sheet('Recipes')._data; return d.find(r => r[0] === id)[col(h)]; };
  return { ...env, asked, triggers, waits, cell, col };
}
const P = 'https://www.indianhealthyrecipes.com/paneer-butter-masala-restaurant-style/';

test('Fetch photos and steps fills the Recipes columns and the catalog carries them', () => {
  const s = sheetWith([recRow('d_paneer', P), recRow('d_ziti', 'https://www.allrecipes.example/ziti/'), recRow('d_reel', 'https://www.instagram.com/reel/abc/'),
    recRow('d_blocked', 'https://blocked.example/x'), recRow('d_nolink', '')],
  { [P]: 'paneer-butter-masala.html', 'https://www.allrecipes.example/ziti/': 'baked-ziti-howtostep.html', 'https://www.instagram.com/reel/abc/': 'no-jsonld.html', 'https://blocked.example/x': 403 });
  const r = plain(s.g.startFetchAll_(60000));
  assert.strictEqual(r.done, true);
  assert.strictEqual(r.steps, 2);
  assert.deepStrictEqual(r.missed, [['d_reel', 'no-recipe-data'], ['d_blocked', 'http-403']]);
  assert.strictEqual(JSON.parse(s.cell('d_paneer', 'steps')).length, 10);
  assert.strictEqual(s.cell('d_paneer', 'photo_url'), PAGES['paneer-butter-masala.html'].photo);
  assert.strictEqual(Object.prototype.toString.call(s.cell('d_paneer', 'fetched_at')), '[object Date]');
  assert.strictEqual(s.cell('d_reel', 'fetch_note'), 'no-recipe-data');
  assert.strictEqual(s.cell('d_reel', 'steps'), '');
  assert.strictEqual(s.asked.length, 4, 'the recipe without a link is skipped');
  assert.strictEqual(s.triggers.length, 0);
  const c = s.g.currentCatalog_().catalog;
  const paneer = c.recipes.find(x => x.id === 'd_paneer'), reel = c.recipes.find(x => x.id === 'd_reel');
  assert.strictEqual(c.schemaVersion, 2);
  assert.deepStrictEqual(plain(paneer.steps), PAGES['paneer-butter-masala.html'].steps);
  assert.strictEqual(paneer.photo, PAGES['paneer-butter-masala.html'].photo);
  assert.ok(!('steps' in reel) && !('photo' in reel), 'left out when empty');

  // Again: only the failed fetch is tried; rows with steps or no recipe data are left alone.
  s.asked.length = 0; s.g.startFetchAll_(60000);
  assert.deepStrictEqual(s.asked, ['https://blocked.example/x']);
  // Clearing steps fetches that row again.
  s.sheet('Recipes')._data.find(x => x[0] === 'd_ziti')[s.col('steps')] = '';
  s.asked.length = 0; s.g.startFetchAll_(60000);
  assert.deepStrictEqual(s.asked, ['https://www.allrecipes.example/ziti/', 'https://blocked.example/x']);
});

test('a long catalog stops before the time limit and carries on from a trigger', () => {
  const rows = [], pages = {};
  for (let i = 0; i < 45; i++) { const u = `https://site${i % 3}.example/r${i}`; rows.push(recRow('d_r' + i, u)); pages[u] = 'chili-graph.html'; }
  const s = sheetWith(rows, pages);
  const D = require('vm').runInContext('Date', s.g); let now = 0; const realNow = D.now; D.now = () => (now += 1000);
  try {
    const r = plain(s.g.startFetchAll_(20000));
    assert.strictEqual(r.done, false);
    assert.strictEqual(s.triggers.length, 1);
    assert.strictEqual(s.triggers[0].getHandlerFunction(), 'fetchStepsRun');
    const first = s.asked.length; assert.ok(first > 0 && first < 45);
    while (s.triggers.length && s.asked.length < 200) { s.triggers.length = 0; now = 0; s.g.fetchSteps_(20000); }
  } finally { D.now = realNow; }
  assert.strictEqual(s.asked.length, 45, 'every row fetched once');
  assert.strictEqual(s.triggers.length, 0);
  assert.strictEqual(s.props.FETCH_NEXT_ROW, undefined);
  assert.ok(rows.every(r => JSON.parse(s.cell(r[0], 'steps')).length === 6));
});

test('waits a second between fetches to the same site', () => {
  const s = sheetWith([recRow('d_a', 'https://same.example/a'), recRow('d_b', 'https://same.example/b'), recRow('d_c', 'https://other.example/c')],
    { 'https://same.example/a': 'chili-graph.html', 'https://same.example/b': 'chili-graph.html', 'https://other.example/c': 'chili-graph.html' });
  s.g.startFetchAll_(60000);
  assert.strictEqual(s.waits.length, 1, 'only before the second same.example fetch');
  assert.ok(s.waits[0] > 0 && s.waits[0] <= 1000);
});

test('recipe.fetchAll from the phone starts the same job', () => {
  const s = sheetWith([recRow('d_paneer', P)], { [P]: 'paneer-butter-masala.html' });
  s.props.APP_KEY = 'k';
  const r = JSON.parse(s.g.doPost({ postData: { contents: JSON.stringify({ key: 'k', action: 'recipe.fetchAll' }) } }).text);
  assert.strictEqual(r.ok, true); assert.strictEqual(r.done, true); assert.strictEqual(r.steps, 1);
});

test('editing a link clears the fetched photo and steps', () => {
  const s = sheetWith([recRow('d_paneer', P)], { [P]: 'paneer-butter-masala.html' });
  s.g.startFetchAll_(60000);
  const sh = s.sheet('Recipes');
  sh._data[1][s.col('link')] = 'https://new.example/paneer';
  s.g.onEdit({ range: { getSheet: () => sh, getRow: () => 2, getNumRows: () => 1, getColumn: () => s.col('link') + 1, getNumColumns: () => 1 } });
  for (const h of ['photo_url', 'steps', 'fetched_at', 'fetch_note']) assert.strictEqual(s.cell('d_paneer', h), '');
});

test('recipe.add from "+ From the web" stores the photo and steps; a new link clears them', () => {
  const s = sheetWith([], {});
  s.props.APP_KEY = 'k';
  const post = ch => JSON.parse(s.g.doPost({ postData: { contents: JSON.stringify({ key: 'k', changes: [ch] }) } }).text).results[0];
  const rec = { id: 'u_paneer', meal: 'dinner', name: 'Paneer butter masala', serv: 4, total: 35, ing: [['paneer', 2, '200 grams paneer']], link: P,
    photo: 'https://img.example/p.jpg', steps: ['Heat the butter.', 'Add 1 cup onions and cook 5 minutes.'] };
  const added = post({ id: 'c1', type: 'recipe.add', data: rec }); assert.strictEqual(added.status, 'applied', added.message);
  const id = 'd_paneer';
  assert.deepStrictEqual(JSON.parse(s.cell(id, 'steps')), rec.steps);
  assert.strictEqual(s.cell(id, 'photo_url'), 'https://img.example/p.jpg');
  assert.deepStrictEqual(plain(s.g.currentCatalog_().catalog.recipes.find(x => x.id === id).steps), rec.steps);
  const changed = s.cell(id, 'last_changed');
  const upd = { ...rec, id, link: 'https://new.example/x' }; delete upd.steps; delete upd.photo;
  const upd2 = post({ id: 'c2', type: 'recipe.update', data: upd, base: { changed: changed.toISOString() } }); assert.strictEqual(upd2.status, 'applied', upd2.message);
  assert.strictEqual(s.cell(id, 'steps'), '');
  assert.strictEqual(s.cell(id, 'photo_url'), '');
});

// ---------- the catalog builder ----------
const X = { utils: { sheet_to_json: (rows, o) => o && o.header === 1 ? [Object.keys(rows[0] || {})] : rows.map(r => ({ ...r })) } };
const item = { item_id: 'paneer', name: 'Paneer', category: 'Dairy', package_label: '8 oz', unit: 'oz', package_qty: 8, price: 3, price_source: 'receipt', price_date: '2026-10-03', staple: 'N', storage: 'fridge', sold_by: 'pack', retired: 'N' };
const rec = (id, extra) => ({ recipe_id: id, meal: 'dinner', name: id, servings: 4, total_min: 30, hands_on_min: 10, keeps_days: 3, active: 'Y', link: 'https://x.example/' + id, ...extra });

test('the catalog builder reads photo_url and steps into recipe.photo and recipe.steps', () => {
  const wb = { Sheets: { Items: [item], Recipes: [rec('d_a', { photo_url: 'https://img.example/a.jpg', steps: '["Heat the oil.","Add 2 cups broth."]' }),
    rec('d_b', { photo_url: '', steps: 'not json' }), rec('d_c', { photo_url: 'http://insecure.example/c.jpg', steps: '' })],
    Ingredients: ['d_a', 'd_b', 'd_c'].map(r => ({ recipe_id: r, item_id: 'paneer', qty: 8 })) } };
  const b = L.build(X, wb, null, '2026-10-18');
  assert.deepStrictEqual(plain(b.errors), []);
  assert.strictEqual(b.catalog.schemaVersion, 2);
  const R = Object.fromEntries(b.catalog.recipes.map(r => [r.id, r]));
  assert.strictEqual(R.d_a.photo, 'https://img.example/a.jpg');
  assert.deepStrictEqual(plain(R.d_a.steps), ['Heat the oil.', 'Add 2 cups broth.']);
  for (const k of ['photo', 'steps']) { assert.ok(!(k in R.d_b)); assert.ok(!(k in R.d_c)); }
  const rows = L.toRows(b.catalog).Recipes;
  assert.strictEqual(rows.find(r => r.recipe_id === 'd_a').steps, '["Heat the oil.","Add 2 cups broth."]');
});
