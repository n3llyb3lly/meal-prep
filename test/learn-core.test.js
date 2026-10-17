// node --test: the LearnCore checks that the self-test page shows (design/source/tools/learn-checks.js).
const test = require('node:test'), assert = require('node:assert');
const { loadScripts } = require('./load');
const w = loadScripts(['design/source/tools/receipt-core.js', 'design/source/tools/learn-core.js', 'design/source/tools/learn-checks.js']);
const plain = x => JSON.parse(JSON.stringify(x === undefined ? null : x));
for (const [group, name, got, want] of w.LearnChecks()) {
  test(`${group}: ${name}`, () => assert.deepStrictEqual(plain(got), plain(want)));
}
