// node --test: recipe import (design/source/tools/recipe-core.js). Pages go through the sheet script's recipe.fetch,
// then RecipeCore, with the app's own receipt matcher and the real catalog.
const test = require('node:test'), assert = require('node:assert');
const { loadScripts, read } = require('./load');
const { loadCodeGs } = require('./apps-script-mock');
const { appFuzzy } = require('./app-matcher');
const PAGES = require('./fixtures/recipe-pages');

const w = loadScripts(['design/source/tools/meal-core.js', 'design/source/tools/recipe-core.js']), RC = w.RecipeCore;
const plain = x => JSON.parse(JSON.stringify(x));
const cat = JSON.parse(read('catalog.json')), items = cat.items.filter(i => !i.retired), P = Object.fromEntries(items.map(i => [i.id, i]));
const fuzzy = appFuzzy(), opts = { P, fuzzy: t => fuzzy(t, items) };

function fetchViaSheet(pg) {
  const { g: G, props } = loadCodeGs({ Items: [['item_id']] });
  props.APP_KEY = 'k';
  G.UrlFetchApp = { fetch: () => ({ getResponseCode: () => 200, getContentText: () => pg.html }) };
  return JSON.parse(G.doPost({ postData: { contents: JSON.stringify({ key: 'k', action: 'recipe.fetch', url: pg.url }) } }).text);
}

test('ingredient lines split into amount, unit, item and notes', () => {
  const p = l => { const x = plain(RC.parseLine(l)); return [x.q, x.unit, x.size && [x.size.q, x.size.unit], x.item, x.notes]; };
  assert.deepStrictEqual(p('1 (15 oz) can black beans, rinsed'), [1, 'can', [15, 'oz'], 'black beans', 'rinsed']);
  assert.deepStrictEqual(p('2 cups shredded mozzarella'), [2, 'cup', null, 'shredded mozzarella', '']);
  assert.deepStrictEqual(p('1 ½ cups sour cream'), [1.5, 'cup', null, 'sour cream', '']);
  assert.deepStrictEqual(p('1½ cups milk'), [1.5, 'cup', null, 'milk', '']);
  assert.deepStrictEqual(p('1 1/2 to 2 cups milk'), [1.75, 'cup', null, 'milk', '']);
  assert.deepStrictEqual(p('6-8 garlic cloves'), [7, null, null, 'garlic cloves', '']);
  assert.deepStrictEqual(p('3 cloves garlic, minced'), [3, 'clove', null, 'garlic', 'minced']);
  assert.deepStrictEqual(p('2 15-oz cans chickpeas'), [2, 'can', [15, 'oz'], 'chickpeas', '']);
  assert.deepStrictEqual(p('1 large onion, diced'), [1, null, null, 'onion', 'large, diced']);
  assert.deepStrictEqual(p('a pinch of red pepper flakes'), [1, 'pinch', null, 'red pepper flakes', '']);
  assert.deepStrictEqual(p('1 bunch cilantro'), [1, 'bunch', null, 'cilantro', '']);
  const opt = RC.parseLine('½ tsp turmeric (optional)');
  assert.deepStrictEqual([opt.optional, opt.item, opt.q], [true, 'turmeric', 0.5]);
  const alt = RC.parseLine('½ kg (1.1 lbs) boneless chicken thighs');
  assert.deepStrictEqual([alt.unit, plain(alt.alts)], ['kg', [{ q: 1.1, unit: 'lb' }]]);
});

test('salt, pepper and water are pantry basics, not items', () => {
  for (const l of ['Salt and pepper to taste', 'kosher salt', 'Freshly ground black pepper', '1/4 cup water', '2 cups warm water', 'Kosher salt and black pepper'])
    assert.ok(RC.parseLine(l).basic, l);
  for (const l of ['1 tsp seasoned salt', '1/2 tsp white pepper', '1 red bell pepper', '2 cups coconut water'])
    assert.ok(!RC.parseLine(l).basic, l);
});

test('matching uses the receipt matcher, ranks exact names first and keeps forms apart', () => {
  const m = l => { const r = RC.build([l], opts).rows[0]; return [r.iid, r.q, r.state]; };
  assert.deepStrictEqual(m('1 (15 oz) can black beans, rinsed'), ['black_beans', 1, 'ok']);
  assert.deepStrictEqual(m('3 cloves garlic, minced'), ['garlic', 3, 'ok']);
  assert.deepStrictEqual(m('1 tablespoon garlic powder'), ['garlic_powder', 3, 'ok']);
  assert.deepStrictEqual(m('2 (14.5-ounce) cans diced tomatoes'), ['diced_tomatoes', 2, 'ok'], 'canned, not fresh');
  assert.deepStrictEqual(m('1 large onion, diced'), ['onion', null, 'amount'], 'yellow onions are sold by the pound, so the amount is asked');
  assert.deepStrictEqual(m('1 cup shredded cheddar cheese (about 4 oz)'), ['cheddar', 4, 'ok'], 'the ounces in parentheses are used');
  assert.deepStrictEqual(m('2 cups shredded mozzarella cheese'), ['mozzarella', null, 'amount'], 'cups of cheese do not convert to ounces');
  assert.deepStrictEqual(m('1 cup crème fraîche'), [null, null, 'unmatched'], 'not at Aldi: flagged, not swapped');
});

test('a pick made once is used next time', () => {
  const before = RC.build(['1 red bell pepper, sliced'], opts).rows[0];
  assert.strictEqual(before.state, 'unmatched');
  const after = RC.build(['2 red bell peppers'], { ...opts, learned: { [RC.learnKey('Red bell pepper')]: 'peppers' } }).rows[0];
  assert.deepStrictEqual([after.iid, after.how, after.q], ['peppers', 'learned', 2]);
});

for (const pg of PAGES) {
  test(`page: ${pg.site}`, () => {
    const res = fetchViaSheet(pg);
    assert.strictEqual(res.ok, true);
    if (pg.noBlock) {
      assert.strictEqual(res.blocks, undefined);
      const picked = RC.pageLines(res.text).filter(l => l.pick).map(l => l.text);
      assert.deepStrictEqual(plain(picked), pg.expect.picked);
      const b = RC.build(picked, opts);
      assert.ok(b.rows.filter(r => r.iid).length >= 4, 'most picked lines match');
      return;
    }
    const n = RC.findRecipe(res.blocks);
    assert.ok(n, 'found the Recipe block');
    const r = RC.fromSchema(n, res.url), e = pg.expect;
    assert.strictEqual(r.name, e.name);
    assert.strictEqual(r.serv, e.serv);
    assert.strictEqual(r.total, e.total);
    assert.strictEqual(r.link, pg.url);
    assert.strictEqual(r.image, undefined, 'link only, no photo');
    if (e.meal) assert.strictEqual(r.meal, e.meal);
    if (e.tags) assert.deepStrictEqual(plain(r.tags), e.tags);
    const b = RC.build(r.ings, opts);
    if (e.basics != null) assert.strictEqual(b.basics.length, e.basics, 'basics: ' + b.basics.join(' | '));
    assert.strictEqual(b.rows.length + b.basics.length, r.ings.length, 'every line is a row or a basic');
    for (const [line, [iid, q]] of Object.entries(e.lines)) {
      const row = b.rows.find(x => x.text === RC.decode(line));
      assert.ok(row, 'row for ' + line);
      assert.deepStrictEqual([row.iid, row.q], [iid, q], line);
    }
    for (const line of e.optional || []) assert.ok(b.rows.find(x => x.text === line).optional, line);
    const matched = b.rows.filter(x => x.iid).length;
    assert.ok(matched / b.rows.length >= 0.6, `${matched} of ${b.rows.length} lines matched`);
  });
}

test('pasted lines skip headings', () => {
  assert.deepStrictEqual(plain(RC.pasteLines('Ingredients\n2 cups rice\n\nFor the sauce:\n3 tbsp soy sauce\n')), ['2 cups rice', '3 tbsp soy sauce']);
});

test('household cost counts portions, not the whole recipe, and leaves out staples and optional lines', () => {
  const b = RC.build(['1 (15 oz) can black beans', '1 lb ground beef', '2 tbsp chili powder', 'Optional: 1 avocado'], opts);
  const c = RC.cost(b.rows, P, 4, 2);
  const whole = P.black_beans.price + P.ground_beef.price / P.ground_beef.pkg;
  assert.strictEqual(c.whole, Math.round(whole * 100) / 100);
  assert.strictEqual(c.household, Math.round(whole / 2 * 100) / 100);
  assert.strictEqual(c.portions, 2);
});

test('durations and yields', () => {
  assert.deepStrictEqual([RC.minutes('PT1H30M'), RC.minutes('P0DT0H45M'), RC.minutes('PT0S'), RC.minutes('')], [90, 45, null, null]);
  assert.deepStrictEqual([RC.servings(['6', '6 servings']), RC.servings('Makes 12 cookies'), RC.servings(4), RC.servings(null)], [6, 12, 4, null]);
});
