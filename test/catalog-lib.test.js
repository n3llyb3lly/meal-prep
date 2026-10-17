// node --test: the catalog builder's rules (design/tools/catalog-lib.js) for flavor and variants.
const test = require('node:test'), assert = require('node:assert');
const { loadScripts } = require('./load');
const L = loadScripts(['design/tools/catalog-lib.js']).CatalogLib;
const plain = x => JSON.parse(JSON.stringify(x));
// Stand-in for SheetJS: a workbook is {Sheets: {name: [rowObject]}}.
const X = { utils: { sheet_to_json: (rows, o) => o && o.header === 1 ? [Object.keys(rows[0] || {})] : rows.map(r => ({ ...r })) } };
const item = (id, name, extra) => ({ item_id: id, name, brand: '', flavor: '', category: 'Frozen', package_label: '48 oz', unit: 'oz', package_qty: 48, price: 2.95, price_source: 'receipt', price_date: '2026-10-03', staple: 'N', storage: 'freezer', sold_by: 'pack', aldi_numbers: '', retired: 'N', ...extra });
const wb = variants => ({ Sheets: {
  Items: [item('ice_cream', 'Ice cream'), item('cone', 'Waffle cones', { flavor: 'Classic' })],
  Recipes: [{ recipe_id: 'x_sundae', meal: 'snack', name: 'Sundae', servings: 2, total_min: 5, hands_on_min: 5, keeps_days: 1, active: 'Y', link: 'x' }],
  Ingredients: [{ recipe_id: 'x_sundae', item_id: 'ice_cream', qty: 8 }, { recipe_id: 'x_sundae', item_id: 'cone', qty: 2 }],
  ...(variants ? { Variants: variants } : {})
} });

test('Items export has Brand and Flavor columns, and flavor round-trips', () => {
  const b = L.build(X, wb(), null, '2026-10-10');
  assert.deepStrictEqual(plain(b.errors), []);
  const rows = L.toRows(b.catalog).Items;
  assert.deepStrictEqual(Object.keys(rows[0]).slice(0, 4), ['item_id', 'name', 'brand', 'flavor']);
  assert.strictEqual(rows.find(r => r.item_id === 'cone').flavor, 'Classic');
});

test('Variants sheet rows become catalog.variants and back', () => {
  const V = [
    { item_id: 'ice_cream', variant_id: 'v_vanilla', brand: 'Sundae Shoppe', flavor: 'Vanilla', store: 'aldi', numbers: '405206', last_price: 2.95, last_date: '2026-10-10' },
    { item_id: 'ice_cream', variant_id: 'v_vanilla', brand: 'Sundae Shoppe', flavor: 'Vanilla', store: 'walmart', numbers: '078742012345', last_price: '', last_date: '' },
    { item_id: 'ice_cream', variant_id: 'v_choc', brand: 'Sundae Shoppe', flavor: 'Chocolate', store: '', numbers: '', last_price: '', last_date: '' }];
  const b = L.build(X, wb(V), null, '2026-10-10');
  assert.deepStrictEqual(plain(b.errors), []);
  assert.deepStrictEqual(plain(b.catalog.variants), { ice_cream: [
    { vid: 'v_vanilla', brand: 'Sundae Shoppe', flavor: 'Vanilla', nums: { aldi: ['405206'], walmart: ['078742012345'] }, last: { price: 2.95, date: '2026-10-10', store: 'aldi' } },
    { vid: 'v_choc', brand: 'Sundae Shoppe', flavor: 'Chocolate', nums: {}, last: null }] });
  assert.strictEqual(plain(b.catalogV1).variants, undefined);
  assert.strictEqual(L.toRows(b.catalog).Variants.length, 3);
});

test('additions export the phone variants as Variants rows', () => {
  const b = L.build(X, wb(), null, '2026-10-10');
  const add = { app: 'aldi-meal-prep-additions', exportedAt: '2026-10-10T20:00:00Z',
    variants: { ice_cream: [
      { vid: 'v_vanilla', brand: 'Sundae Shoppe', flavor: 'Vanilla', nums: { aldi: ['405206'] }, last: { price: 2.95, date: '2026-10-10', store: 'aldi' } },
      { vid: 'v_choc', brand: 'Sundae Shoppe', flavor: 'Chocolate', nums: {} },
      { vid: 'v_mint', brand: 'Sundae Shoppe', flavor: 'Mint chip', nums: {} }] },
    numVar: { '405207': 'v_choc' } };
  const r = L.additions(X, wb(), add, b);
  const g = r.groups.find(x => x.key === 'variants');
  assert.deepStrictEqual(plain(g.rows.map(x => [x.item_id, x.variant_id, x.flavor, x.store, x.numbers, x.last_price])), [
    ['ice_cream', 'v_vanilla', 'Vanilla', 'aldi', '405206', 2.95],
    ['ice_cream', 'v_choc', 'Chocolate', 'aldi', '405207', ''],
    ['ice_cream', 'v_mint', 'Mint chip', '', '', '']]);
  assert.strictEqual(g.header.split('\t')[0], 'item_id');
});
