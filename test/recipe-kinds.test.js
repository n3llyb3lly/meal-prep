// node --test: recipe kinds, also good for breakfast, and side pairings (6.5). The sheet script (Code.gs) guesses an
// empty kind during Fetch photos and steps, groups the Pairings tab into recipe.sides, and takes recipe.kind from the
// phone; the catalog builder (catalog-lib.js) exports the same fields; the app's own guess (kindGuess) is checked too.
const test = require('node:test'), assert = require('node:assert');
const { loadScripts } = require('./load');
const { loadCodeGs } = require('./apps-script-mock');
const { appKinds } = require('./app-kinds');
const L = loadScripts(['design/tools/catalog-lib.js']).CatalogLib;
const plain = x => JSON.parse(JSON.stringify(x));
const ld = o => `<html><head><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Recipe', name: 'x', recipeInstructions: ['Cook it.'], ...o })}</script></head><body></body></html>`;

// ---------- the kind guess from JSON-LD ----------
test('the kind guess reads recipeCategory, then keywords, then the name', () => {
  const { g: G } = loadCodeGs({});
  const guess = (o, name, meal) => plain(G.kindGuess_(o, name || 'Something', meal));
  assert.deepStrictEqual(guess({ recipeCategory: 'Side Dish' }), { kind: 'side', why: 'recipeCategory "Side Dish"', breakfast: false });
  assert.deepStrictEqual(guess({ recipeCategory: ['Dessert'] }), { kind: 'dessert', why: 'recipeCategory "Dessert"', breakfast: false });
  assert.deepStrictEqual(guess({ recipeCategory: 'Drinks' }), { kind: 'drink', why: 'recipeCategory "Drinks"', breakfast: false });
  assert.deepStrictEqual(guess({ recipeCategory: 'Condiment' }), { kind: 'sauce', why: 'recipeCategory "Condiment"', breakfast: false });
  assert.deepStrictEqual(guess({ recipeCategory: 'Appetizer, Snack' }), { kind: 'snack', why: 'recipeCategory "Appetizer"', breakfast: false });
  assert.deepStrictEqual(guess({}), { kind: 'main', why: 'no category', breakfast: false });
  assert.deepStrictEqual(guess({ recipeCategory: 'Main Course' }), { kind: 'main', why: 'recipeCategory "Main Course"', breakfast: false });
  assert.deepStrictEqual(guess({ recipeCategory: 'Breakfast, Main Course' }), { kind: 'main', why: 'recipeCategory "Breakfast, Main Course"', breakfast: true });
  assert.strictEqual(guess({ recipeCategory: 'Brunch' }).breakfast, true);
  // keywords count only when the keyword is the kind word itself
  assert.deepStrictEqual(guess({ keywords: 'easy, agua fresca, summer' }), { kind: 'drink', why: 'keywords "agua fresca"', breakfast: false });
  assert.strictEqual(guess({ keywords: 'sweet potato, side of greens' }).kind, 'main');
  // the name, when it doesn't also name a main; then meal = snack, as the app does
  assert.strictEqual(guess(null, 'Tres leches cake').kind, 'dessert');
  assert.strictEqual(guess(null, 'Chicken pot pie').kind, 'main');
  assert.strictEqual(guess(null, 'Ají de queso (Ecuadorian cheese hot sauce)').kind, 'sauce');
  assert.deepStrictEqual(guess(null, 'Easy smooth hummus', 'snack'), { kind: 'snack', why: 'meal "snack"', breakfast: false });
  assert.deepStrictEqual(guess(null, 'Weeknight chili', 'dinner'), { kind: 'main', why: 'no recipe data', breakfast: false });
  assert.strictEqual(guess(null, 'Shakshuka (eggs in spiced tomato sauce)', 'breakfast').kind, 'main', 'only the name before "(" is read');
});

test('with no recipe data, the sheet guesses the same kind as the app for every catalog recipe', () => {
  const { g: G } = loadCodeGs({}), K = appKinds();
  const differ = require('../catalog.json').recipes.map(r => [r.id, K.kindGuess(r), G.kindGuess_(null, r.name, r.meal).kind]).filter(x => x[1] !== x[2]);
  assert.deepStrictEqual(differ, []);
});

// ---------- Fetch photos and steps fills empty kinds ----------
const H = ['recipe_id', 'meal', 'name', 'servings', 'total_min', 'link', 'active', 'steps', 'kind', 'also_breakfast', 'last_changed', 'changed_by'];
const row = (id, link, o) => { o = o || {}; return [id, o.meal || 'dinner', o.name || id, 4, 30, link, 'Y', o.steps || '', o.kind || '', o.bf == null ? '' : o.bf, '', '']; };
function fetchSheet(rows, pages) {
  const env = loadCodeGs({ Items: [['item_id', 'name', 'unit', 'package_qty', 'price'], ['rice', 'Rice', 'oz', 32, 2]], Recipes: [H, ...rows],
    Ingredients: [['recipe_id', 'item_id', 'qty'], ...rows.map(r => [r[0], 'rice', 8])] });
  const asked = [];
  env.g.UrlFetchApp = { fetch: url => { asked.push(url); const p = pages[url]; if (p === 403) return { getResponseCode: () => 403, getContentText: () => '' };
    return { getResponseCode: () => 200, getContentText: () => p }; } };
  env.g.Utilities.sleep = () => {};
  env.g.ScriptApp = { getProjectTriggers: () => [], deleteTrigger: () => {}, newTrigger: () => ({ timeBased: () => ({ after: () => ({ create: () => {} }) }) }) };
  const col = h => env.sheet('Recipes')._data[0].indexOf(h);
  const cell = (id, h) => env.sheet('Recipes')._data.find(r => r[0] === id)[col(h)];
  return { ...env, asked, cell, col };
}

test('Fetch photos and steps guesses an empty kind and says so in fetch_note; a kind someone set is never changed', () => {
  const U = p => 'https://site.example/' + p;
  const s = fetchSheet([
    row('d_rice', U('rice')), row('d_cake', U('cake')), row('d_tea', U('tea')), row('d_mayo', U('mayo')), row('d_stew', U('stew')),
    row('d_hash', U('hash')), row('d_mine', U('mine'), { kind: 'dessert' }),
    row('d_done', U('done'), { steps: '["Old step."]' }), row('d_set', U('set'), { steps: '["Old step."]', kind: 'sauce' }),
    row('d_blocked', U('blocked')), row('s_hummus', '', { meal: 'snack', name: 'Easy smooth hummus' })
  ], {
    [U('rice')]: ld({ recipeCategory: 'Side Dish' }), [U('cake')]: ld({ recipeCategory: 'Dessert' }), [U('tea')]: ld({ recipeCategory: 'Drinks' }),
    [U('mayo')]: ld({ recipeCategory: 'Condiment' }), [U('stew')]: ld({}), [U('hash')]: ld({ recipeCategory: 'Breakfast' }), [U('mine')]: ld({ recipeCategory: 'Side Dish' }),
    [U('done')]: ld({ recipeCategory: 'Side Dish', recipeInstructions: ['New step.'] }), [U('set')]: ld({ recipeCategory: 'Side Dish' }), [U('blocked')]: 403
  });
  const r = plain(s.g.startFetchAll_(60000));
  assert.strictEqual(r.done, true);
  const kinds = Object.fromEntries(['d_rice', 'd_cake', 'd_tea', 'd_mayo', 'd_stew', 'd_hash', 'd_mine', 'd_done', 'd_set', 'd_blocked', 's_hummus'].map(id => [id, s.cell(id, 'kind')]));
  assert.deepStrictEqual(kinds, { d_rice: 'side', d_cake: 'dessert', d_tea: 'drink', d_mayo: 'sauce', d_stew: 'main', d_hash: 'main', d_mine: 'dessert',
    d_done: 'side', d_set: 'sauce', d_blocked: 'main', s_hummus: 'snack' });
  assert.strictEqual(s.cell('d_rice', 'fetch_note'), 'kind guessed: side (recipeCategory "Side Dish")');
  assert.strictEqual(s.cell('d_stew', 'fetch_note'), 'kind guessed: main (no category)');
  assert.strictEqual(s.cell('d_blocked', 'fetch_note'), 'http-403; kind guessed: main (no recipe data)');
  assert.strictEqual(s.cell('s_hummus', 'fetch_note'), 'kind guessed: snack (meal "snack")');
  assert.strictEqual(s.cell('d_mine', 'fetch_note'), '', 'a kind someone set gets no note');
  // also_breakfast: ticked only for a breakfast main
  assert.strictEqual(s.cell('d_hash', 'also_breakfast'), true);
  assert.strictEqual(s.cell('d_stew', 'also_breakfast'), '');
  // a row with steps is fetched for its kind only: the steps stay as they were
  assert.strictEqual(s.cell('d_done', 'steps'), '["Old step."]');
  assert.ok(!s.asked.includes(U('set')), 'a row with steps and a kind is not fetched');
  assert.deepStrictEqual(r.kinds.map(x => x.slice(0, 2)), [['d_rice', 'side'], ['d_cake', 'dessert'], ['d_tea', 'drink'], ['d_mayo', 'sauce'], ['d_stew', 'main'], ['d_hash', 'main'],
    ['d_done', 'side'], ['d_blocked', 'main'], ['s_hummus', 'snack']]);
  assert.match(r.message, /Guessed the kind of 9 recipes: 3 main, 2 side, 1 dessert, 1 drink, 1 snack, 1 sauce\./);

  // Next run: the kinds are set, so only the failed fetch is tried again (for its steps), and its kind stays.
  s.asked.length = 0; s.g.startFetchAll_(60000);
  assert.deepStrictEqual(s.asked, [U('blocked')]);
  assert.strictEqual(s.cell('d_blocked', 'fetch_note'), 'http-403');
  assert.strictEqual(s.cell('d_blocked', 'kind'), 'main');
  // A done note followed by a kind note still counts as done.
  assert.strictEqual(s.g.needsFetch_({ link: U('x'), steps: '', fetch_note: 'no-steps; kind guessed: main (no category)' }), false);
});

// ---------- the catalog: kinds, also good for breakfast, and sides from the Pairings tab ----------
const RH = ['recipe_id', 'meal', 'name', 'tags', 'servings', 'total_min', 'active', 'kind', 'also_breakfast', 'sides', 'last_changed', 'changed_by'];
const R = (id, name, kind, o) => { o = o || {}; return [id, o.meal || 'dinner', name, o.tags || '', 4, 30, o.active || 'Y', kind, o.bf == null ? '' : o.bf, '', '', '']; };
const RECIPES = [RH,
  R('d_tinga', 'Chicken tinga tacos', '', { tags: 'mexican', bf: false }), R('d_curry', 'Chickpea curry', 'main', { tags: 'indian' }),
  R('l_llap', 'Llapingachos', 'main', { meal: 'lunch', tags: 'ecuadorian', bf: true }), R('s_cake', 'Tres leches cake', 'dessert', { meal: 'snack', bf: 'TRUE' }),
  R('s_rice', 'Mexican rice', 'side', { tags: 'mexican' }), R('s_plant', 'Fried plantains', 'side', { tags: 'ecuadorian' }), R('s_old', 'Old side', 'side', { active: 'N' }),
  R('d_odd', 'Odd one', 'Entree')];
const PAIRINGS = [['main_id', 'main_name', 'side_id', 'side_name', 'note'],
  ['d_tinga', 'Chicken tinga tacos', 's_rice', 'Mexican rice', ''], ['d_tinga', 'Chicken tinga tacos', 's_plant', 'Fried plantains', ''], ['d_tinga', '', 's_rice', '', 'twice'],
  ['d_curry', 'Chickpea curry', 's_cake', 'Tres leches cake', ''], ['d_curry', 'Chickpea curry', 's_nope', '', ''], ['d_curry', '', 's_old', '', ''],
  ['s_cake', 'Tres leches cake', 's_rice', 'Mexican rice', ''], ['d_gone', '', 's_rice', '', ''], ['', '', '', '', 'blank row']];
const catTabs = extra => ({ Items: [['item_id', 'name', 'category', 'unit', 'package_qty', 'price', 'price_date', 'sold_by'], ['rice', 'Rice', 'Pantry', 'oz', 32, 2, new Date().toISOString().slice(0, 10), 'pack']],
  Recipes: RECIPES, Ingredients: [['recipe_id', 'item_id', 'qty'], ...RECIPES.slice(1).map(r => [r[0], 'rice', 8])], ...extra });

test('Pairings rows are grouped by main_id, in order and without repeats', () => {
  const { g: G } = loadCodeGs({});
  const rows = PAIRINGS.slice(1).map(r => Object.fromEntries(PAIRINGS[0].map((h, i) => [h, r[i]])));
  const want = { d_tinga: ['s_rice', 's_plant'], d_curry: ['s_cake', 's_nope', 's_old'], s_cake: ['s_rice'], d_gone: ['s_rice'] };
  assert.deepStrictEqual(plain(G.groupPairings_(rows)), want);
  assert.deepStrictEqual(plain(L.groupPairings(rows)), want, 'the builder groups the same way');
});

function checkCatalog(c, warnings) {
  const RC = Object.fromEntries(c.recipes.map(r => [r.id, r]));
  assert.strictEqual(c.schemaVersion, 2);
  assert.deepStrictEqual(c.recipes.map(r => [r.id, r.kind]), [['d_tinga', 'main'], ['d_curry', 'main'], ['l_llap', 'main'], ['s_cake', 'dessert'], ['s_rice', 'side'], ['s_plant', 'side'], ['d_odd', 'main']]);
  assert.strictEqual(RC.l_llap.alsoBreakfast, true);
  assert.ok(!('alsoBreakfast' in RC.d_tinga) && !('alsoBreakfast' in RC.s_cake), 'written only when TRUE, and only on a main');
  assert.deepStrictEqual(plain(RC.d_tinga.sides), ['s_rice', 's_plant']);
  assert.ok(!('sides' in RC.d_curry), 'no valid sides left');
  assert.ok(!('sides' in RC.s_cake) && !('sides' in RC.s_rice), 'only mains have sides');
  const W = warnings.join('\n');
  for (const m of ['kind "Entree" isn\'t one of main, side, dessert, drink, snack, sauce. Read as main.',
    's_cake: also_breakfast is ticked, but it is a dessert. Only a main can also be breakfast.',
    'Pairings: d_curry lists s_cake, which is a dessert, not a side.', 'Pairings: d_curry lists side "s_nope", which isn\'t on the Recipes sheet.',
    'Pairings: d_curry lists s_old, which isn\'t active.', 'Pairings: s_cake is a dessert, not a main. Its sides were left out.',
    'Pairings: main "d_gone" isn\'t on the Recipes sheet.', 'Recipe kinds: 4 main, 2 side, 1 dessert, 0 drink, 0 snack, 0 sauce.',
    'No side recipe yet for: black beans, tortillas, garlic bread, green salad. Mains have only 2 sides to pair with.'])
    assert.ok(W.includes(m), 'missing warning: ' + m + '\n' + W);
}

test('the sheet script writes kind, alsoBreakfast and sides into the catalog and flags what is wrong', () => {
  const { g: G } = loadCodeGs(catTabs({ Pairings: PAIRINGS }));
  const b = G.buildCatalog_(null);
  assert.deepStrictEqual(plain(b.errors), []);
  checkCatalog(plain(b.catalog), plain(b.warnings));
  // the version changes when a kind changes
  const v1 = G.currentCatalog_().catalog.catalogVersion;
  const env2 = loadCodeGs(catTabs({ Pairings: PAIRINGS })); env2.sheet('Recipes')._data[2][7] = 'side';
  assert.notStrictEqual(env2.g.currentCatalog_().catalog.catalogVersion.slice(-8), v1.slice(-8));
});

test('without a Pairings tab the Recipes sides column is read', () => {
  const tabs = catTabs({}); tabs.Recipes = RECIPES.map(r => r.slice()); tabs.Recipes[1][9] = 's_rice; s_plant';
  const { g: G } = loadCodeGs(tabs);
  assert.deepStrictEqual(plain(G.buildCatalog_(null).catalog.recipes[0].sides), ['s_rice', 's_plant']);
});

test('picking names on the Pairings tab fills the ids and the Recipes sides column', () => {
  const env = loadCodeGs(catTabs({ Pairings: [PAIRINGS[0], ['', 'Chicken tinga tacos', '', 'Mexican rice', ''], ['', 'chickpea curry', '', 'Fried plantains', '']] }));
  const sh = env.sheet('Pairings');
  env.g.onEdit({ range: { getSheet: () => sh, getRow: () => 2, getNumRows: () => 2, getColumn: () => 2, getNumColumns: () => 1 } });
  assert.deepStrictEqual(sh._data.slice(1).map(r => [r[0], r[2]]), [['d_tinga', 's_rice'], ['d_curry', 's_plant']]);
  const rec = env.sheet('Recipes')._data, sc = rec[0].indexOf('sides');
  assert.deepStrictEqual(rec.slice(1, 3).map(r => r[sc]), ['s_rice', 's_plant']);
});

test('Suggest pairings uses the app\'s sideScore rules and skips pairs already on the Pairings tab', () => {
  const { g: G } = loadCodeGs(catTabs({ Pairings: [PAIRINGS[0], PAIRINGS[1]] }));
  const x = plain(G.suggestPairings_());
  assert.strictEqual(x.sides, 2);
  assert.deepStrictEqual(x.rows, [
    ['d_tinga', 'Chicken tinga tacos', 's_plant', 'Fried plantains', 'a vegetable with meat'],
    ['d_curry', 'Chickpea curry', 's_rice', 'Mexican rice', 'rice or bread with a saucy main'],
    ['l_llap', 'Llapingachos', 's_plant', 'Fried plantains', 'both ecuadorian']]);
});

// ---------- the catalog builder ----------
const X = { utils: { sheet_to_json: (rows, o) => o && o.header === 1 ? [Object.keys(rows[0] || {})] : rows.map(r => ({ ...r })) } };
const objs = t => t.slice(1).map(r => Object.fromEntries(t[0].map((h, i) => [h, r[i]])));

test('the catalog builder exports kind, alsoBreakfast and sides, with the same checks', () => {
  const tabs = catTabs({ Pairings: PAIRINGS });
  const wb = { Sheets: Object.fromEntries(Object.entries(tabs).map(([k, v]) => [k, objs(v)])) };
  const b = L.build(X, wb, null, new Date().toISOString().slice(0, 10));
  assert.deepStrictEqual(plain(b.errors), []);
  checkCatalog(plain(b.catalog), plain(b.warnings));
  assert.deepStrictEqual(plain(b.counts.kinds), { main: 4, side: 2, dessert: 1, drink: 0, snack: 0, sauce: 0 });
  // and back to rows: Recipes carry kind and also_breakfast, Pairings one row per side
  const rows = L.toRows(b.catalog);
  const llap = rows.Recipes.find(r => r.recipe_id === 'l_llap'), tinga = rows.Recipes.find(r => r.recipe_id === 'd_tinga');
  assert.deepStrictEqual([llap.kind, llap.also_breakfast, tinga.sides], ['main', true, 's_rice, s_plant']);
  assert.deepStrictEqual(plain(rows.Pairings).map(r => [r.main_id, r.side_id, r.side_name]), [['d_tinga', 's_rice', 'Mexican rice'], ['d_tinga', 's_plant', 'Fried plantains']]);
  const again = L.build(X, { Sheets: { ...wb.Sheets, Recipes: rows.Recipes, Ingredients: rows.Ingredients, Pairings: rows.Pairings } }, null, new Date().toISOString().slice(0, 10));
  assert.deepStrictEqual(plain(again.catalog.recipes).map(r => [r.id, r.kind, r.alsoBreakfast, r.sides]), plain(b.catalog.recipes).map(r => [r.id, r.kind, r.alsoBreakfast, r.sides]));
});

// ---------- recipe.kind from the phone ----------
test('recipe.kind writes kind and also_breakfast; an own recipe not in the sheet yet is deferred; an unknown id is rejected', () => {
  const env = loadCodeGs(catTabs({}));
  const G = env.g, rec = env.sheet('Recipes')._data, h = rec[0], at = (id, k) => rec.find(r => r[0] === id)[h.indexOf(k)];
  const send = (changes) => { const ctx = G.context_(); return changes.map(([id, type, data]) => plain(G.applyOne_(ctx, { id, type, data }, 'test'))); };
  const res = send([
    ['c1', 'recipe.kind', { id: 'd_curry', kind: 'side', alsoBreakfast: false }],
    ['c2', 'recipe.kind', { id: 'd_tinga', kind: 'main', alsoBreakfast: true }],
    ['c3', 'recipe.kind', { id: 's_cake', kind: 'dessert', alsoBreakfast: true }],
    ['c4', 'recipe.kind', { id: 'u_salsa', kind: 'sauce', alsoBreakfast: false }],
    ['c5', 'recipe.kind', { id: 'd_nope', kind: 'side' }],
    ['c6', 'recipe.kind', { id: 'd_curry', kind: 'soup' }]]);
  assert.deepStrictEqual(res.map(r => r.status), ['applied', 'applied', 'applied', 'deferred', 'rejected', 'rejected']);
  assert.match(res[4].message, /No recipe d_nope in the sheet/);
  assert.deepStrictEqual([at('d_curry', 'kind'), at('d_curry', 'also_breakfast'), at('d_tinga', 'kind'), at('d_tinga', 'also_breakfast'), at('s_cake', 'also_breakfast')],
    ['side', false, 'main', true, false]);
  assert.strictEqual(at('d_curry', 'changed_by'), 'phone');
  const logged = env.sheet('Change log')._data.slice(1).map(r => r[1]);
  assert.ok(!logged.includes('c4'), 'a deferred change is not logged, so it can apply later');
  // The phone sends recipe.add, then the same recipe.kind again: now it applies.
  const again = send([
    ['c7', 'recipe.add', { id: 'u_salsa', meal: 'snack', name: 'Salsa roja', serv: 4, total: 10, ing: [['rice', 1]] }],
    ['c4', 'recipe.kind', { id: 'u_salsa', kind: 'sauce', alsoBreakfast: false }]]);
  assert.deepStrictEqual(again.map(r => r.status), ['applied', 'applied']);
  const sid = rec.find(r => r[2] === 'Salsa roja')[0];
  assert.strictEqual(at(sid, 'kind'), 'sauce');
  assert.strictEqual(send([['c4', 'recipe.kind', { id: 'u_salsa', kind: 'sauce' }]])[0].status, 'duplicate');
  assert.strictEqual(plain(G.buildCatalog_(null).catalog.recipes.find(r => r.id === sid).kind), 'sauce');
});

// ---------- the app's own guess (kindGuess in the 6.5 app) ----------
test('the app guesses kinds from the name, tags and meal until the catalog says', () => {
  const K = appKinds(), cat = require('../catalog.json');
  const byName = n => { const r = cat.recipes.find(x => x.name.toLowerCase().startsWith(n.toLowerCase())); assert.ok(r, 'no recipe ' + n); return K.kind65(r, {}); };
  const llap = byName('Llapingachos');
  assert.deepStrictEqual([llap.kind, llap.bfast], ['main', true]);
  assert.strictEqual(byName('Tres leches').kind, 'dessert');
  assert.strictEqual(byName('Agua de pepino').kind, 'drink');
  assert.strictEqual(byName('Ají de queso').kind, 'sauce');
  assert.strictEqual(byName('Salvadoran pupusas').kind, 'main');
  assert.strictEqual(byName('Smashed Chinese cucumber salad').kind, 'side');
  // a kind in the catalog wins over the guess, and a kind set on the phone wins over both
  const r = cat.recipes.find(x => x.name.startsWith('Tres leches'));
  assert.strictEqual(K.kind65({ ...r, kind: 'snack' }, {}).kind, 'snack');
  assert.strictEqual(K.kind65({ ...r, kind: 'snack' }, { recKind: { [r.id]: 'side' } }).kind, 'side');
});
