// node --test: a link shared to the installed app (sw.js share target) is saved for the app and opens ?share=link.
const test = require('node:test'), assert = require('node:assert');
const vm = require('vm');
const { read } = require('./load');

function loadSw() {
  const caches = {}, listeners = {};
  const open = name => caches[name] = caches[name] || { store: {}, put: async function (k, r) { this.store[k] = r; }, match: async function (k) { return this.store[k]; }, keys: async function () { return Object.keys(this.store); }, addAll: async () => {} };
  const ctx = {
    self: { addEventListener: (t, f) => { listeners[t] = f; }, registration: { scope: 'https://n.example/meal-prep/' }, skipWaiting: () => {}, clients: { claim: () => {} } },
    caches: { open: async n => open(n), keys: async () => [] }, location: { origin: 'https://n.example' },
    Response, URL, TextEncoder, crypto: globalThis.crypto, setTimeout, Promise, fetch: async () => { throw new Error('offline'); }
  };
  ctx.Response.redirect = Response.redirect;
  vm.createContext(ctx); vm.runInContext(read('sw.js'), ctx, { filename: 'sw.js' });
  const share = async fields => {
    const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    let out; const req = new Request('https://n.example/meal-prep/share', { method: 'POST', body: fd });
    listeners.fetch({ request: req, respondWith: p => { out = p; }, waitUntil: () => {} });
    return out;
  };
  return { share, store: n => (caches[n] || { store: {} }).store };
}

test('a shared recipe link is kept as JSON and opens New recipe from the web', async () => {
  const { share, store: S } = loadSw();
  const r = await share({ title: 'One Pot Chili Pasta', text: 'One Pot Chili Pasta https://www.budgetbytes.com/one-pot-chili-pasta/' });
  assert.strictEqual(r.status, 303);
  assert.strictEqual(r.headers.get('location'), 'https://n.example/meal-prep/?share=link');
  const store = S('meal-prep-share-link'), keys = Object.keys(store);
  assert.strictEqual(Object.keys(S('meal-prep-share')).length, 0, 'not where the photo reader looks');
  assert.strictEqual(keys.length, 1);
  assert.match(keys[0], /\/shared\/link-\d+$/);
  assert.deepStrictEqual(JSON.parse(await store[keys[0]].text()).url, 'https://www.budgetbytes.com/one-pot-chili-pasta/');
});

test('a shared photo still goes to Add receipt', async () => {
  const { share, store: S } = loadSw();
  const r = await share({ receipt: new File([new Uint8Array([1, 2, 3])], 'r.jpg', { type: 'image/jpeg' }) });
  const store = S('meal-prep-share');
  assert.strictEqual(r.headers.get('location'), 'https://n.example/meal-prep/?share=1');
  assert.strictEqual(Object.keys(store).length, 1);
  assert.strictEqual(store[Object.keys(store)[0]].headers.get('Content-Type'), 'image/jpeg');
});

test('shared text with no link saves nothing', async () => {
  const { share, store: S } = loadSw();
  const r = await share({ text: 'just some words' });
  assert.strictEqual(r.headers.get('location'), 'https://n.example/meal-prep/?share=1');
  assert.strictEqual(Object.keys(S('meal-prep-share')).length + Object.keys(S('meal-prep-share-link')).length, 0);
});
