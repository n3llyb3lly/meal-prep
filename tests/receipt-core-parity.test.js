// node --test: receipts.js must read Aldi receipts the same way as tools/receipt-core.js (window.ReceiptCore),
// which the app tries first for Aldi. Ground truth is the 10/10 receipt in ReceiptCore.F1010.
const test = require('node:test'), assert = require('node:assert');
const { loadScripts, exists } = require('./load');
const CORE = 'tools/receipt-core.js';

test('10/10 Aldi receipt: receipts.js matches ReceiptCore', { skip: !exists(CORE) && `${CORE} is not in the repo yet` }, () => {
  const w = loadScripts([CORE, 'receipts.js']), C = w.ReceiptCore, R = w.ReceiptParsers;
  const text = C.fixtureText(C.F1010);
  const r = R.parse(text, 'aldi');
  const core = C.parseLines(text.split('\n'));
  const coreItems = C.groupItems(core.items);
  // Same items, in the same order: number, amount, quantity (pounds for weighed lines).
  const key = x => [x.num || null, Math.round(x.amount * 100), +(+(x.weighed && x.wt ? x.wt : x.qty)).toFixed(3)].join('|');
  const units = items => items.reduce((a, x) => a + (x.weighed ? 1 : x.qty), 0);
  assert.deepStrictEqual([...r.items.map(key)], [...coreItems.map(key)]);
  assert.strictEqual(units(r.items), 49);
  assert.strictEqual(r.subtotal, 137.25);
  assert.strictEqual(r.tax, 0.14);
  assert.strictEqual(r.total, 137.39);
  assert.strictEqual(r.count, 49);
  assert.deepStrictEqual([core.subtotal, core.tax, core.total, core.count], [137.25, 0.14, 137.39, 49]);
  assert.strictEqual(r.date, core.date); assert.strictEqual(r.time, core.time);
  const yog = r.items.filter(x => /yogurt/i.test(x.text)).reduce((a, x) => a + x.qty, 0);
  assert.strictEqual(yog, 6);
  const tom = r.items.find(x => /tomato/i.test(x.text) && x.weighed);
  assert.deepStrictEqual([tom.qty, tom.perLb], [1.54, 0.85]);
});
