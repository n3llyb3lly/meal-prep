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
  assert.deepStrictEqual(p('6-8 garlic cloves'), [7, 'clove', null, 'garlic', '']);
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

test('doubled and nested parentheses come out whole, with alternatives kept out of the name and amount', () => {
  const p = l => { const x = plain(RC.parseLine(l)); return [x.q, x.unit, x.item, x.notes, x.optional, x.alts]; };
  assert.deepStrictEqual(p('1 small bay leaf ((tej patta, optional))'), [1, null, 'bay leaf', 'tej patta, small', true, []]);
  assert.deepStrictEqual(p('3 cloves ((laung, optional))'), [3, null, 'cloves', 'laung', true, []]);
  assert.deepStrictEqual(p('2 green cardamoms ( (or ¼ to ⅓ tsp ground cardamom, elaichi))'), [2, null, 'green cardamoms', 'or ¼ to ⅓ tsp ground cardamom, elaichi', false, []]);
  assert.deepStrictEqual(p('1 inch (10 grams) ginger ((peeled & sliced or use 1½ to 2 teaspoon ginger garlic paste, read notes))'),
    [1, 'inch', 'ginger', 'peeled & sliced or use 1½ to 2 teaspoon ginger garlic paste, read notes', false, [{ q: 10, unit: 'g' }]]);
  assert.deepStrictEqual(p('250 to 300 grams (9 to 10 oz) paneer ((I cut mine to ¾ inch))'), [275, 'g', 'paneer', 'I cut mine to ¾ inch', false, [{ q: 9.5, unit: 'oz' }]]);
  assert.deepStrictEqual(p('15 cashews ((whole, 30 grams, or up to 18, or use almonds))'), [15, null, 'cashews', 'whole, or up to 18, or use almonds', false, [{ q: 30, unit: 'g' }]]);
  assert.deepStrictEqual(p('2 inch Ceylon cinnamon piece ((or 1 inch dalchini, optional))').slice(0, 3), [2, 'inch', 'Ceylon cinnamon piece']);
  assert.deepStrictEqual(p('1 teaspoon jaggery or sugar ((optional))').slice(0, 3), [1, 'tsp', 'jaggery or sugar']);
  assert.strictEqual(RC.parseLine('1 small bay leaf ((tej patta, optional))').text, '1 small bay leaf (tej patta, optional)');
});

test('amounts are shown the way a person measures them', () => {
  const d = (q, unit) => plain(RC.display(q, { unit }));
  assert.deepStrictEqual(d(0.287, 'lb'), { q: '4.5', u: 'oz' });
  assert.deepStrictEqual(d(0.772, 'lb'), { q: '12', u: 'oz' });
  assert.deepStrictEqual(d(2.4, 'lb'), { q: '2.4', u: 'lb' });
  assert.deepStrictEqual(d(0.219, 'cup'), { q: '3.5', u: 'tbsp' });
  assert.deepStrictEqual(d(0.875, 'tsp'), { q: '1', u: 'tsp' });
  assert.deepStrictEqual(d(5.5, 'clove'), { q: '5.5', u: 'clove' });
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

test('a line ending in a form word does not match an item packed in it', () => {
  const m = l => RC.matchLine(RC.parseLine(l), opts).iid;
  assert.notStrictEqual(m('1 cup pineapple juice'), 'pineapple_chunks', '"pineapple juice" is not "Pineapple chunks in juice"');
  assert.strictEqual(m('1 (20 oz) can pineapple chunks in juice'), 'pineapple_chunks');
  assert.strictEqual(m('1 cup pineapple chunks'), 'pineapple_chunks');
  assert.ok(P.cornstarch, 'the catalog has corn starch');
  assert.strictEqual(m('2 tbsp corn starch'), 'cornstarch');
  assert.strictEqual(m('1 tbsp cornstarch'), 'cornstarch');
  assert.deepStrictEqual([RC.onlyPacked('pineapple chunk in juice', 'juice'), RC.onlyPacked('pineapple juice', 'juice'), RC.onlyPacked('tuna with oil', 'oil')], [true, false, true]);
});

test('substitutions a line offers', () => {
  const s = l => plain(RC.subsOf(l));
  assert.deepStrictEqual(s("14 oz naranjilla or lulo pulp (thawed if frozen – use passion fruit or pineapple juice if you can't find naranjilla juice)"),
    ['naranjilla pulp', 'lulo pulp', 'passion fruit juice', 'pineapple juice']);
  assert.deepStrictEqual(s('1 cup purple or black corn flour (can use corn starch –aka maicena – as a replacement)'), ['purple corn flour', 'black corn flour', 'corn starch']);
  assert.deepStrictEqual(s('12-14 oz panela or brown sugar (adjust to your taste)'), ['panela', 'brown sugar']);
  assert.deepStrictEqual(s('4-5 all spice berries'), []);
});

test('possible ingredients are left out of the cost and counted as not priced', () => {
  const PP = { ...P, u_star_anise: { id: 'u_star_anise', name: 'Star anise', unit: 'each', pkg: 1, price: 0, possible: true }, u_lulo: { id: 'u_lulo', name: 'Lulo pulp', unit: 'oz', pkg: 1, price: 0, possible: true } };
  const rows = [{ iid: 'black_beans', q: P.black_beans.pkg }, { iid: 'u_star_anise', q: 4 }, { iid: 'u_lulo', q: 14 }, { iid: 'u_lulo', q: 2 }, { iid: 'u_star_anise', q: 1, optional: true }];
  const c = RC.cost(rows, PP, 4, 4);
  assert.strictEqual(c.whole, P.black_beans.price);
  assert.deepStrictEqual([c.unpriced, plain(c.unpricedIds)], [2, ['u_star_anise', 'u_lulo']]);
  assert.deepStrictEqual([RC.unpricedText(0), RC.unpricedText(1), RC.unpricedText(2)], ['', '+ 1 item not priced', '+ 2 items not priced']);
  assert.strictEqual(RC.cost([{ iid: 'black_beans', q: 1 }], P, 4, 4).unpriced, 0);
});
