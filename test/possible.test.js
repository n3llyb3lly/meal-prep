// node --test: possible ingredients (script version 7). Items a recipe needs that Aldi doesn't sell reach the sheet
// with possible = Y and a blank price, get a store under "where", and stop being possible once they have a price.
const test = require('node:test'), assert = require('node:assert');
const { loadCodeGs } = require('./apps-script-mock');
const plain = x => JSON.parse(JSON.stringify(x));

const ITEMS = [['item_id', 'name', 'category', 'package_label', 'unit', 'package_qty', 'price', 'price_source', 'price_date', 'staple', 'storage', 'sold_by', 'aldi_numbers', 'retired', 'notes', 'last_changed', 'changed_by'],
  ['pineapple_juice', 'Pineapple juice', 'Pantry', '46 fl oz', 'fl oz', 46, 2.49, 'receipt', '2026-10-30', 'N', 'pantry', 'pack', '', 'N', '', '', '']];
const tabs = (extra) => ({ Items: ITEMS.map(r => r.slice()), Recipes: [['recipe_id', 'meal', 'name', 'servings', 'total_min', 'active', 'last_changed', 'changed_by']], Ingredients: [['recipe_id', 'item_id', 'qty', 'as_written', 'optional']], ...(extra || {}) });
let n = 0;
const send = (G, changes) => { const ctx = G.context_(); return changes.map(([type, data, base]) => G.applyOne_(ctx, { id: 'c' + (n++) + type, type, data, base }, 'test')); };
const rowOf = (sheet, id) => { const d = sheet('Items')._data, h = d[0], r = d.find(x => x[0] === id); return r && Object.fromEntries(h.map((k, i) => [k, r[i]])); };
const possibleAdd = (id, name, where) => ['item.add', { id, name, cat: 'Pantry', pack: 'each', unit: 'each', pkg: 1, price: 0, src: 'from a recipe', possible: true, where: where || '' }];

test('every reply says the script version', () => {
  const { g: G, props } = loadCodeGs(tabs()); props.APP_KEY = 'k';
  const post = JSON.parse(G.doPost({ postData: { contents: JSON.stringify({ key: 'k', changes: [] }) } }).text);
  const ping = JSON.parse(G.doGet({ parameter: { key: 'k', ping: '1' } }).text);
  const cat = JSON.parse(G.doGet({ parameter: { key: 'k', schema: '2' } }).text);
  assert.deepStrictEqual([post.script, ping.script, cat.script], [7, 7, 7]);
  assert.strictEqual(G.SCRIPT_VERSION, 7);
});

test('item.add with possible adds the columns at the end, leaves the price blank and keeps where', () => {
  const { g: G, sheet } = loadCodeGs(tabs());
  const res = send(G, [possibleAdd('u_star_anise', 'Star anise', 'Cub'), possibleAdd('u_naranjilla_pulp', 'Naranjilla pulp')]);
  assert.deepStrictEqual(res.map(r => r.status), ['applied', 'applied']);
  const h = sheet('Items')._data[0];
  assert.deepStrictEqual(h.slice(0, ITEMS[0].length), ITEMS[0], 'existing columns keep their order');
  assert.deepStrictEqual(h.slice(ITEMS[0].length), ['possible', 'where']);
  const r = rowOf(sheet, 'star_anise');
  assert.deepStrictEqual([r.price, r.price_source, r.price_date, r.possible, r.where], ['', '', '', 'Y', 'Cub']);
  assert.match(r.notes, /not sold at Aldi/);
  assert.strictEqual(rowOf(sheet, 'naranjilla_pulp').where, '');
  // The recipe that uses them goes through, with the phone ids swapped for the sheet's.
  const [rr] = send(G, [['recipe.add', { id: 'u_chicha', meal: 'dinner', name: 'Colada morada', serv: 4, total: 60, ing: [['u_star_anise', 0.5, '4 star anise'], ['u_naranjilla_pulp', 3.5, '14 oz naranjilla pulp'], ['pineapple_juice', 2, '1 cup pineapple juice']] }]]);
  assert.strictEqual(rr.status, 'applied', rr.message);
  assert.deepStrictEqual(sheet('Ingredients')._data.slice(1).map(x => x[1]), ['star_anise', 'naranjilla_pulp', 'pineapple_juice']);
});

test('the catalog serves possible items without a price error, with where', () => {
  const { g: G } = loadCodeGs(tabs());
  send(G, [possibleAdd('u_star_anise', 'Star anise', 'Cub'), possibleAdd('u_lulo', 'Lulo pulp')]);
  const b = G.buildCatalog_(null);
  assert.deepStrictEqual(plain(b.errors), []);
  const I = Object.fromEntries(plain(b.catalog.items).map(x => [x.id, x]));
  assert.deepStrictEqual([I.star_anise.possible, I.star_anise.where, I.star_anise.price], [true, 'Cub', 0]);
  assert.deepStrictEqual([I.lulo.possible, 'where' in I.lulo], [true, false]);
  assert.deepStrictEqual(['possible' in I.pineapple_juice, 'where' in I.pineapple_juice], [false, false], 'ordinary items are unchanged');
  assert.ok(!b.warnings.some(w => /star_anise: price_date/.test(w)), 'no stale-price warning for an item with no price');
});

test('a blank price is still an error for an item that is not possible', () => {
  const t = tabs(); t.Items.push(['oops', 'Oops', 'Pantry', 'each', 'each', 1, '', '', '', 'N', 'pantry', 'pack', '', 'N', '', '', '']);
  const { g: G } = loadCodeGs(t);
  const b = G.buildCatalog_(null);
  assert.ok(b.errors.some(e => /oops.*price is missing.*possible to Y/.test(e)), plain(b.errors).join('\n'));
});

test('item.where changes the store; an unknown item is rejected', () => {
  const { g: G, sheet } = loadCodeGs(tabs());
  send(G, [possibleAdd('u_star_anise', 'Star anise')]);
  const res = send(G, [['item.where', { id: 'u_star_anise', where: 'Cub Foods, spice aisle' }], ['item.where', { id: 'u_nope', where: 'x' }]]);
  assert.deepStrictEqual(res.map(r => r.status), ['applied', 'rejected']);
  const r = rowOf(sheet, 'star_anise');
  assert.deepStrictEqual([r.where, r.changed_by], ['Cub Foods, spice aisle', 'phone']);
});

test('item.where keeps a store typed in the sheet since the phone last saw the row', () => {
  const { g: G, sheet } = loadCodeGs(tabs());
  send(G, [possibleAdd('u_star_anise', 'Star anise')]);
  const d = sheet('Items')._data, h = d[0], row = d.find(x => x[0] === 'star_anise');
  row[h.indexOf('where')] = 'Lunds'; row[h.indexOf('changed_by')] = 'sheet'; row[h.indexOf('last_changed')] = new Date('2026-10-31T12:00:00Z');
  const [r] = send(G, [['item.where', { id: 'star_anise', where: 'Cub' }, { changed: '2026-10-30T12:00:00Z' }]]);
  assert.deepStrictEqual([r.status, plain(r.sheet)], ['conflict', { where: 'Lunds' }]);
  assert.strictEqual(rowOf(sheet, 'star_anise').where, 'Lunds');
});

test('a price at any store clears possible; the item is then ordinary in the catalog', () => {
  for (const [type, data] of [['offer.set', { item: 'u_star_anise', store: 'cub', price: 3.99, pack: '1 oz', unit: 'oz', pkg: 1, date: '2026-10-31', via: 'edited' }],
    ['price.set', { item: 'u_star_anise', store: 'cub', price: 3.99, date: '2026-10-31', via: 'receipt' }],
    ['price.set', { item: 'u_star_anise', price: 3.99, date: '2026-10-31', via: 'receipt' }]]) {
    const { g: G, sheet } = loadCodeGs(tabs());
    send(G, [possibleAdd('u_star_anise', 'Star anise', 'Cub')]);
    const [r] = send(G, [[type, data, {}]]);
    assert.strictEqual(r.status, 'applied', type + ': ' + r.message);
    assert.strictEqual(rowOf(sheet, 'star_anise').possible, 'N', type);
    const b = G.buildCatalog_(null), it = plain(b.catalog.items).find(x => x.id === 'star_anise');
    assert.deepStrictEqual(plain(b.errors), [], type);
    assert.deepStrictEqual([it.possible, it.price, it.where], [undefined, 3.99, 'Cub'], type);
  }
});

test('a price of 0 does not clear possible', () => {
  const { g: G, sheet } = loadCodeGs(tabs());
  send(G, [possibleAdd('u_star_anise', 'Star anise')]);
  const [r] = send(G, [['offer.set', { item: 'u_star_anise', store: 'cub', price: 0 }, {}]]);
  assert.strictEqual(r.status, 'rejected');
  assert.strictEqual(rowOf(sheet, 'star_anise').possible, 'Y');
});

test('a possible item whose name is already in the sheet links to it, and fills a blank store', () => {
  const { g: G, sheet } = loadCodeGs(tabs());
  send(G, [possibleAdd('u_star_anise', 'Star anise')]);
  const [r] = send(G, [possibleAdd('u_star_anise_2', 'Star anise', 'Cub')]);
  assert.strictEqual(r.status, 'applied'); assert.match(r.message, /already in the sheet as star_anise/);
  assert.strictEqual(sheet('Items')._data.filter(x => x[1] === 'Star anise').length, 1);
  assert.strictEqual(rowOf(sheet, 'star_anise').where, 'Cub');
});

test('possible typed with a price in the sheet: the price wins, with a warning', () => {
  const t = tabs(); t.Items[0].push('possible', 'where'); t.Items[1].push('Y', '');
  const { g: G } = loadCodeGs(t);
  const b = G.buildCatalog_(null);
  assert.deepStrictEqual(plain(b.errors), []);
  assert.strictEqual(plain(b.catalog.items)[0].possible, undefined);
  assert.ok(b.warnings.some(w => /pineapple_juice: possible is Y but it has a price/.test(w)));
});

test('the version 5.3 catalog shape is unchanged', () => {
  const { g: G } = loadCodeGs(tabs());
  send(G, [possibleAdd('u_star_anise', 'Star anise', 'Cub')]);
  const v1 = plain(G.toV1_(G.buildCatalog_(null).catalog));
  assert.ok(v1.items.every(x => !('possible' in x) && !('where' in x)));
});

test('an item.add the phone already priced (a receipt at another store) arrives as an ordinary item', () => {
  const { g: G, sheet } = loadCodeGs(tabs());
  const [a, b] = send(G, [
    ['item.add', { ...possibleAdd('u_star_anise', 'Star anise', 'Cub')[1], offers: [{ store: 'cub', price: 3.99, pack: '1 oz', unit: 'oz', pkg: 1, priceDate: '2026-10-31', src: 'receipt' }] }],
    ['item.add', { ...possibleAdd('u_lulo', 'Lulo pulp')[1], price: 4.49, priceDate: '2026-10-31', src: 'receipt' }]]);
  assert.deepStrictEqual([a.status, b.status], ['applied', 'applied']);
  assert.strictEqual(rowOf(sheet, 'star_anise').possible, 'N');
  assert.deepStrictEqual([rowOf(sheet, 'lulo').possible, rowOf(sheet, 'lulo').price], ['N', 4.49]);
  const offers = sheet('Offers')._data;
  assert.ok(offers.some(r => r[0] === 'star_anise' && r[1] === 'cub' && r[2] === 3.99));
  const I = Object.fromEntries(plain(G.buildCatalog_(null).catalog.items).map(x => [x.id, x]));
  assert.deepStrictEqual([I.star_anise.possible, I.star_anise.price, I.lulo.possible], [undefined, 3.99, undefined]);
});

test('a recipe that arrives before its phone items waits instead of being refused', () => {
  const { g: G, sheet } = loadCodeGs(tabs());
  const rec = { id: 'u_colada', meal: 'dinner', name: 'Colada morada', serv: 4, total: 60, ing: [['u_star_anise', 1, '4 star anise'], ['pineapple_juice', 2, '1 cup pineapple juice']] };
  const [r1] = send(G, [['recipe.add', rec]]);
  assert.strictEqual(r1.status, 'deferred', r1.message);
  assert.strictEqual(sheet('Change log')._data.length, 1, 'a deferred change is not logged');
  // The same change sent again after its item: applied.
  const ctx = G.context_();
  const r2 = [G.applyOne_(ctx, { id: 'i1', type: 'item.add', data: possibleAdd('u_star_anise', 'Star anise')[1] }, 't'), G.applyOne_(ctx, { id: 'c-same', type: 'recipe.add', data: rec }, 't')];
  assert.deepStrictEqual(r2.map(r => r.status), ['applied', 'applied']);
  const [r3] = send(G, [['recipe.add', { ...rec, id: 'u_other', name: 'Other', ing: [['nope_item', 1, 'x']] }]]);
  assert.strictEqual(r3.status, 'rejected', 'a missing sheet item is still refused');
});
