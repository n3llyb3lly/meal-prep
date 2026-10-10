// node --test: the Apps Script (design/sheets/Code.gs) accepts variant changes and serves them in the catalog.
const test = require('node:test'), assert = require('node:assert');
const { loadCodeGs } = require('./apps-script-mock');
const plain = x => JSON.parse(JSON.stringify(x));

const ITEMS = [['item_id', 'name', 'brand', 'flavor', 'category', 'package_label', 'unit', 'package_qty', 'price', 'price_source', 'price_date', 'staple', 'storage', 'sold_by', 'aldi_numbers', 'retired', 'notes', 'last_changed', 'changed_by'],
  ['ice_cream', 'Ice cream', '', '', 'Frozen', '48 oz', 'oz', 48, 2.95, 'receipt', '2026-10-03', 'N', 'freezer', 'pack', '405206', 'N', '', '', '']];
const tabs = () => ({ Items: ITEMS, Recipes: [['recipe_id', 'meal', 'name', 'servings', 'active']], Ingredients: [['recipe_id', 'item_id', 'qty']] });
const send = (G, changes) => changes.map(([type, data], i) => G.applyOne_(G.context_(), { id: 'c' + i + type, type, data }, 'test'));

test('variant.add and variant.number write the Variants tab, one row per variant and store', () => {
  const { g: G, sheet } = loadCodeGs(tabs());
  const res = send(G, [
    ['variant.add', { item: 'ice_cream', vid: 'v_vanilla', brand: 'Sundae Shoppe', flavor: 'Vanilla' }],
    ['variant.add', { item: 'ice_cream', vid: 'v_choc', brand: 'Sundae Shoppe', flavor: 'Chocolate' }],
    ['variant.add', { item: 'ice_cream', vid: 'v_mint', brand: 'Sundae Shoppe', flavor: 'Mint chip' }],
    ['variant.number', { vid: 'v_vanilla', store: 'aldi', num: '405206' }],
    ['variant.number', { vid: 'v_vanilla', store: 'walmart', num: '078742012345' }],
    ['variant.number', { vid: 'v_choc', store: 'aldi', num: '405206' }],
    ['variant.add', { item: 'other_item', vid: 'v_x' }],
    ['variant.number', { vid: 'v_nope', store: 'aldi', num: '1234' }]
  ]);
  assert.deepStrictEqual(res.map(r => r.status), ['applied', 'applied', 'applied', 'applied', 'applied', 'conflict', 'rejected', 'rejected']);
  const rows = plain(sheet('Variants')._data);
  assert.deepStrictEqual(rows[0].slice(0, 8), ['item_id', 'variant_id', 'brand', 'flavor', 'store', 'numbers', 'last_price', 'last_date']);
  assert.deepStrictEqual(rows.slice(1).map(r => r.slice(0, 6)), [
    ['ice_cream', 'v_vanilla', 'Sundae Shoppe', 'Vanilla', 'aldi', '405206'],
    ['ice_cream', 'v_choc', 'Sundae Shoppe', 'Chocolate', '', ''],
    ['ice_cream', 'v_mint', 'Sundae Shoppe', 'Mint chip', '', ''],
    ['ice_cream', 'v_vanilla', 'Sundae Shoppe', 'Vanilla', 'walmart', '078742012345']]);
  // Sent again (same change ids): answered as duplicates, nothing new written.
  const again = send(G, [['variant.add', { item: 'ice_cream', vid: 'v_vanilla', brand: 'Sundae Shoppe', flavor: 'Vanilla' }]]);
  assert.strictEqual(again[0].status, 'duplicate');
  assert.strictEqual(sheet('Variants')._data.length, 5);
});

test('the next catalog keeps the three ice creams under one item', () => {
  const { g: G } = loadCodeGs(tabs());
  send(G, [
    ['variant.add', { item: 'ice_cream', vid: 'v_vanilla', brand: 'Sundae Shoppe', flavor: 'Vanilla' }],
    ['variant.add', { item: 'ice_cream', vid: 'v_choc', brand: 'Sundae Shoppe', flavor: 'Chocolate' }],
    ['variant.add', { item: 'ice_cream', vid: 'v_mint', brand: 'Sundae Shoppe', flavor: 'Mint chip' }],
    ['variant.number', { vid: 'v_vanilla', store: 'aldi', num: '405206' }]
  ]);
  const b = G.buildCatalog_(null);
  assert.deepStrictEqual(plain(b.errors), []);
  const v = plain(b.catalog.variants);
  assert.deepStrictEqual(Object.keys(v), ['ice_cream']);
  assert.deepStrictEqual(v.ice_cream.map(x => [x.vid, x.flavor, x.nums]), [['v_vanilla', 'Vanilla', { aldi: ['405206'] }], ['v_choc', 'Chocolate', {}], ['v_mint', 'Mint chip', {}]]);
  assert.strictEqual(G.toV1_(b.catalog).variants, undefined, 'version 5.3 phones get no variants');
});

test('item.add from a receipt keeps the printed size and says where it came from', () => {
  const { g: G, sheet } = loadCodeGs(tabs());
  const [r] = send(G, [['item.add', { id: 'u_oat_milk', name: 'Oat milk', cat: 'Dairy', pack: '1 L', unit: 'fl oz', pkg: 33.81, price: 2.49, src: 'receipt', unsorted: true }]]);
  assert.strictEqual(r.status, 'applied');
  const rows = sheet('Items')._data, h = rows[0], row = rows[rows.length - 1], at = k => row[h.indexOf(k)];
  assert.deepStrictEqual([at('item_id'), at('package_label'), at('unit'), at('package_qty'), at('price_source')], ['oat_milk', '1 L', 'fl oz', 33.81, 'receipt']);
  assert.match(at('notes'), /receipt; not placed/);
});
