// node --test: the sheet script's recipe.fetch reads a recipe page for the phone (design/sheets/Code.gs).
const test = require('node:test'), assert = require('node:assert');
const { loadCodeGs } = require('./apps-script-mock');
const plain = x => JSON.parse(JSON.stringify(x));

function withPage(html, code) {
  const { g: G, props } = loadCodeGs({ Items: [['item_id']] });
  props.APP_KEY = 'k';
  const asked = [];
  G.UrlFetchApp = { fetch: (url, opts) => { asked.push([url, opts]); return { getResponseCode: () => code || 200, getContentText: () => html }; } };
  const post = body => JSON.parse(G.doPost({ postData: { contents: JSON.stringify({ key: 'k', ...body }) } }).text);
  return { G, post, asked };
}

test('recipe.fetch sends back the Recipe block and the page title', () => {
  const html = `<html><head><title>One Pot Chili Pasta - Budget Bytes</title>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"x"}</script>
    <script type="application/ld+json" class="yoast-schema-graph">{"@graph":[{"@type":"Recipe","name":"One Pot Chili Pasta","recipeIngredient":["1 lb ground beef"]}]}</script>
    </head><body>ads ads</body></html>`;
  const { post, asked } = withPage(html);
  const r = post({ action: 'recipe.fetch', url: 'https://www.example.com/one-pot-chili-pasta/' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.title, 'One Pot Chili Pasta - Budget Bytes');
  assert.strictEqual(r.blocks.length, 1, 'only blocks that mention Recipe');
  assert.match(r.blocks[0], /One Pot Chili Pasta/);
  assert.strictEqual(r.text, undefined);
  assert.strictEqual(asked[0][1].muteHttpExceptions, true);
});

test('recipe.fetch falls back to the page text, one line per block', () => {
  const html = `<html><head><title>Grandma's soup</title><style>.a{}</style></head><body><nav>Home</nav><h1>Grandma's soup</h1>
    <ul><li>2 cups chicken broth</li><li>1 onion, diced</li></ul><p>Simmer for 20 minutes.</p><script>track()</script></body></html>`;
  const r = withPage(html).post({ action: 'recipe.fetch', url: 'https://example.com/soup' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.blocks, undefined);
  assert.deepStrictEqual(r.text.split('\n'), ["Grandma's soup", '2 cups chicken broth', '1 onion, diced', 'Simmer for 20 minutes.']);
});

test('recipe.fetch refuses bad addresses and the wrong key, and writes nothing to the sheet', () => {
  const { post, G } = withPage('<html></html>');
  assert.strictEqual(post({ action: 'recipe.fetch', url: 'javascript:alert(1)' }).error, 'bad-url');
  assert.strictEqual(post({ action: 'recipe.fetch', url: 'file:///etc/passwd' }).error, 'bad-url');
  assert.strictEqual(post({ key: 'nope', action: 'recipe.fetch', url: 'https://example.com' }).error, 'refused');
  assert.strictEqual(G.SpreadsheetApp.getActive().getSheetByName('Log'), null, 'no change log for a fetch');
});

test('recipe.fetch passes on a site error', () => {
  const r = withPage('Forbidden', 403).post({ action: 'recipe.fetch', url: 'https://example.com/x' });
  assert.deepStrictEqual(plain(r).error, 'http-403');
});
