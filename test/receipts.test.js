// node --test: receipts.js on the sample receipts in data/receipts/. Same checks as tools/receipts-test.html.
const test = require('node:test'), assert = require('node:assert');
const { loadScripts, read } = require('./load');
const { ReceiptParsers: R } = loadScripts(['receipts.js']);

const EXPECT = {
  aldi:    { date: '2026-10-03', time: '11:42', count: 42, subtotal: 126.42, tax: 0.09, total: 126.51 },
  sams:    { date: '2025-10-15', count: 6,  subtotal: 87.20,  tax: 1.47, total: 88.67 },
  walmart: { date: '2026-08-14', count: 22, subtotal: 123.67, tax: 6.13, total: 129.80 },
  cub:     { date: '2026-02-19', count: 8,  subtotal: 43.92,  tax: 0,    total: 43.92 }
};
const plain = x => JSON.parse(JSON.stringify(x));  // arrays from the fake window come from another realm
const near = (a, b) => Math.abs((a || 0) - b) < 0.005;

for (const [store, e] of Object.entries(EXPECT)) for (const kind of ['sample', 'ocr']) {
  test(`${store}-${kind}.txt`, () => {
    const text = read(`data/receipts/${store}-${kind}.txt`);
    assert.strictEqual(R.detectStore(text), store);
    const r = R.parse(text, store);
    const units = r.items.reduce((a, x) => a + (x.weighed ? 1 : x.qty), 0);
    assert.strictEqual(r.date, e.date);
    if (e.time) assert.strictEqual(r.time, e.time);
    assert.strictEqual(r.count, e.count, 'printed item count');
    assert.strictEqual(units, e.count, 'items read');
    assert.ok(near(r.subtotal, e.subtotal), `subtotal ${r.subtotal}`);
    assert.ok(near(r.sum, e.subtotal), `sum of items ${r.sum}`);
    assert.ok(near(r.tax, e.tax), `tax ${r.tax}`);
    assert.ok(near(r.total, e.total), `total ${r.total}`);
  });
}

test('aldi weight line attaches to the line above', () => {
  const r = R.parse(read('data/receipts/aldi-sample.txt'), 'aldi');
  const tom = r.items.find(x => x.num === '356615');
  assert.deepStrictEqual([tom.weighed, tom.qty, tom.perLb, tom.amount], [true, 1.82, 0.85, 1.55]);
});

test('aldi footer: any X-Taxable line, spaced TOTAL, footer after the card lines', () => {
  const text = ['ALDI', '382147 All Purpose Flour 1.95 FA', '405206 Ice Cream 2.95 B',
    'Price Reduction -0.50', 'VISA ************1234', 'APPROVED', 'SUBTOTAL 4.40',
    'A-Taxable 0.00 @ 0.000% 0.00', 'B-Taxable 2.45 @ 7.025% 0.17', 'T O T A L 4.57', '2 ITEMS',
    'VISA 4.57 10/10/26 3:05PM'].join('\n');
  const r = R.parse(text, 'aldi');
  assert.deepStrictEqual(plain(r.items.map(x => [x.num, x.amount, x.discount])), [['382147', 1.95, false], ['405206', 2.45, true]]);
  assert.deepStrictEqual([r.subtotal, r.tax, r.total, r.count, r.date, r.time], [4.4, 0.17, 4.57, 2, '2026-10-10', '15:05']);
});
