// node --test: the sheet script's Drive backups (design/sheets/Code.gs, 6.6): backup.save, backup.list, backup.fetch,
// the 7 daily + 4 weekly retention, the key check, and "unknown action" for anything else.
const test = require('node:test'), assert = require('node:assert'), zlib = require('zlib');
const { loadCodeGs } = require('./apps-script-mock');
const plain = x => JSON.parse(JSON.stringify(x));
const DAY = 864e5, KEY = 'secret-key-1234567890';

// A tiny Drive: folders hold files; ids are counters. Enough for DriveApp as Code.gs uses it.
function fakeDrive() {
  let n = 0; const folders = [], files = [];
  const iter = a => { let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
  const blob = buf => ({ getDataAsString: () => buf.toString('utf8'), _buf: buf });
  function folder(name, parent) {
    const f = { _id: 'fo' + (++n), _name: name, _parent: parent, _trashed: false,
      getId: () => f._id, isTrashed: () => f._trashed,
      getFoldersByName: nm => iter(folders.filter(x => x._parent === f && x._name === nm && !x._trashed)),
      createFolder: nm => folder(nm, f),
      getFiles: () => iter(files.filter(x => x._folder === f && !x._trashed)),
      createFile: (nm, content, mime) => {
        const x = { _id: 'fi' + (++n), _name: nm, _folder: f, _content: String(content), _mime: mime, _desc: null, _trashed: false, _created: new Date(G.__now()) };
        Object.assign(x, { getId: () => x._id, getName: () => x._name, isTrashed: () => x._trashed, setTrashed: t => { x._trashed = t; },
          getBlob: () => blob(Buffer.from(x._content)), getDescription: () => x._desc, setDescription: d => { x._desc = d; }, getDateCreated: () => x._created });
        files.push(x); return x;
      } };
    folders.push(f); return f;
  }
  const root = folder('My Drive', null);
  const G = { __now: () => Date.now() };
  return {
    G, folders, files, live: () => files.filter(x => !x._trashed),
    DriveApp: {
      getFolderById: id => { const f = folders.find(x => x._id === id); if (!f) throw new Error('not found'); return f; },
      getFoldersByName: nm => iter(folders.filter(x => x._name === nm && !x._trashed)),
      createFolder: nm => root.createFolder(nm)
    },
    blob
  };
}

function setup() {
  const { g, props } = loadCodeGs({ Items: [['item_id', 'name']], Recipes: [['recipe_id', 'meal', 'name', 'servings', 'active']], Ingredients: [['recipe_id', 'item_id', 'qty']] });
  props.APP_KEY = KEY;
  const d = fakeDrive();
  g.DriveApp = d.DriveApp;
  Object.assign(g.Utilities, {
    base64Decode: s => [...Buffer.from(s, 'base64')],
    newBlob: (bytes) => d.blob(Buffer.from(bytes)),
    ungzip: b => d.blob(zlib.gunzipSync(b._buf))
  });
  let now = Date.UTC(2026, 9, 19, 12);
  d.G.__now = () => now;
  require('vm').runInContext('Date', g).now = () => now;     // Code.gs reads Date.now() for "at"
  const post = body => JSON.parse(g.doPost({ postData: { contents: JSON.stringify({ key: KEY, ...body }) } }).text);
  return { g, d, props, post, setNow: t => { now = t; } };
}

const pack = (obj, gzip = true) => (gzip ? zlib.gzipSync(Buffer.from(JSON.stringify(obj))) : Buffer.from(JSON.stringify(obj))).toString('base64');
function save(post, { id, name, obj, gzip = true, chunk = 350000, keep = { daily: 7, weekly: 4 } }) {
  const data = pack(obj, gzip), parts = Math.max(1, Math.ceil(data.length / chunk)), out = [];
  for (let p = 0; p < parts; p++) out.push(post({ action: 'backup.save', id, name, part: p, parts, enc: gzip ? 'gzip-base64' : 'base64', data: data.slice(p * chunk, (p + 1) * chunk), size: 123, meta: { lists: 2 }, keep }));
  return out;
}

test('backup.save joins the parts into one file in "Meal Prep backups" and removes the parts', () => {
  const { d, post } = setup();
  const obj = { lists: [{ name: 'Trip', items: Array.from({ length: 2000 }, (_, i) => 'item ' + i + ' ' + Math.random()) }] };
  const res = save(post, { id: 'b1', name: 'meal-prep-2026-10-19-0702.json', obj, chunk: 20000 });
  assert.ok(res.length > 1, 'sent in several parts');
  assert.ok(res.every(r => r.ok === true));
  assert.strictEqual(res[res.length - 1].saved, true);
  const live = d.live();
  assert.deepStrictEqual(live.map(f => [f._folder._name, f._name]), [['Meal Prep backups', 'meal-prep-2026-10-19-0702.json']]);
  const c = JSON.parse(live[0]._content);
  assert.deepStrictEqual(Object.keys(c).sort(), ['at', 'data', 'enc', 'id', 'meta', 'size']);
  assert.strictEqual(c.enc, 'gzip-base64');
  assert.deepStrictEqual(JSON.parse(zlib.gunzipSync(Buffer.from(c.data, 'base64'))), obj);
});

test('backup.list and backup.fetch give the file back in 350,000-character parts', () => {
  const { post } = setup();
  const big = { blob: require('crypto').randomBytes(400000).toString('hex') };   // does not compress: about 1.07 MB of base64
  save(post, { id: 'b2', name: 'meal-prep-2026-10-19-0800.json', obj: big, gzip: false });
  const l = post({ action: 'backup.list' });
  assert.strictEqual(l.ok, true);
  assert.strictEqual(l.files.length, 1);
  const f = l.files[0];
  assert.deepStrictEqual([f.id, f.name, f.enc, f.size, f.parts], ['b2', 'meal-prep-2026-10-19-0800.json', 'base64', 123, Math.ceil(pack(big, false).length / 350000)]);
  assert.deepStrictEqual(plain(f.meta), { lists: 2 });
  let data = '';
  for (let p = 0; p < f.parts; p++) { const r = post({ action: 'backup.fetch', id: f.id, part: p }); assert.strictEqual(r.ok, true); assert.strictEqual(r.parts, f.parts); assert.ok(r.data.length <= 350000); data += r.data; }
  assert.deepStrictEqual(JSON.parse(Buffer.from(data, 'base64')), big);
  assert.strictEqual(post({ action: 'backup.fetch', id: f.fileId, part: 0 }).ok, true, 'the Drive file id works too');
  assert.strictEqual(post({ action: 'backup.fetch', id: 'nope', part: 0 }).error, 'not-found');
  assert.strictEqual(post({ action: 'backup.fetch', id: f.id, part: f.parts }).error, 'bad-part');
});

test('a backup that still contains the app key is refused and nothing is kept', () => {
  const { d, post } = setup();
  const res = save(post, { id: 'b3', name: 'meal-prep-2026-10-19-0900.json', obj: { sheetLink: { url: 'x', key: KEY } } });
  assert.strictEqual(res[res.length - 1].ok, false);
  assert.strictEqual(res[res.length - 1].error, 'has-key');
  assert.deepStrictEqual(d.live(), []);
});

test('bad requests are refused without writing', () => {
  const { d, post } = setup();
  const base = { action: 'backup.save', id: 'b4', name: 'meal-prep-x.json', part: 0, parts: 1, enc: 'base64', data: 'e30=' };
  assert.strictEqual(post({ ...base, name: '../evil.json' }).error, 'bad-name');
  assert.strictEqual(post({ ...base, enc: 'zip' }).error, 'bad-enc');
  assert.strictEqual(post({ ...base, part: 1 }).error, 'bad-part');
  assert.strictEqual(post({ ...base, data: 'x'.repeat(350001) }).error, 'bad-data');
  assert.strictEqual(post({ ...base, data: '<script>' }).error, 'bad-data');
  assert.strictEqual(post({ ...base, part: 1, parts: 2 }).error, 'missing-part');
  assert.strictEqual(d.live().filter(f => f._folder._name === 'Meal Prep backups').length, 0);
});

test('the wrong key is refused before any backup action', () => {
  const { g } = setup();
  const r = JSON.parse(g.doPost({ postData: { contents: JSON.stringify({ key: 'wrong', action: 'backup.list' }) } }).text);
  assert.strictEqual(r.error, 'refused');
});

test('an unknown action fails cleanly instead of looking like an empty change batch', () => {
  const { post } = setup();
  const r = post({ action: 'backup.restore' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, 'unknown action');
  assert.strictEqual(r.results, undefined);
  assert.strictEqual(post({ changes: [] }).ok, true, 'a plain change batch still works');
});

test('retention keeps the newest of each of the last 7 days and of each of the last 4 calendar weeks', () => {
  const { g } = setup();
  const now = Date.UTC(2026, 9, 19, 12), files = [];   // Monday 19 October 2026
  // two backups a day for 40 days: 08:00 and 20:00 (today only has 08:00 so far)
  for (let ago = 0; ago < 40; ago++) for (const h of [8, 20]) { const at = Date.UTC(2026, 9, 19 - ago, h); if (at <= now) files.push({ fileId: ago + '@' + h, at }); }
  const kept = Object.keys(plain(g.backupKeep_(files, now, { daily: 7, weekly: 4 }, 'UTC'))).sort((a, b) => parseInt(a) - parseInt(b));
  // days 0-6: the newest that day. Weeks: this one and last one are already covered; then Sunday 11 Oct and Sunday 4 Oct.
  assert.deepStrictEqual(kept, ['0@8', '1@20', '2@20', '3@20', '4@20', '5@20', '6@20', '8@20', '15@20']);
});

test('retention with a gap keeps the newest backup of each week that has one', () => {
  const { g } = setup();
  const now = Date.UTC(2026, 9, 19, 12), at = ago => Date.UTC(2026, 9, 19 - ago, 9);
  // 10 and 12 days ago share the week of 5 Oct; 16 is the week of 28 Sep; 26, 30 and 60 are more than 4 weeks back
  const files = [10, 12, 16, 26, 30, 60].map(a => ({ fileId: 'd' + a, at: at(a) }));
  assert.deepStrictEqual(Object.keys(plain(g.backupKeep_(files, now, { daily: 7, weekly: 4 }, 'UTC'))).sort(), ['d10', 'd16']);
});

test('the time zone decides which day a backup belongs to', () => {
  const { g } = setup();
  g.Utilities.formatDate = (d, tz, f) => new Date(d.getTime() + (tz === 'America/Chicago' ? -5 : 0) * 36e5).toISOString().slice(0, 10);
  const now = Date.UTC(2026, 9, 19, 12);
  // 02:00 and 04:00 UTC on the 19th are both the evening of the 18th in Chicago, so only the later one stays
  const files = [{ fileId: 'a', at: Date.UTC(2026, 9, 19, 2) }, { fileId: 'b', at: Date.UTC(2026, 9, 19, 4) }, { fileId: 'c', at: Date.UTC(2026, 9, 19, 11) }];
  assert.deepStrictEqual(Object.keys(plain(g.backupKeep_(files, now, { daily: 7, weekly: 4 }, 'America/Chicago'))).sort(), ['b', 'c']);
});

test('saving applies retention and never deletes the file it just wrote', () => {
  const { d, post, setNow } = setup();
  const start = Date.UTC(2026, 8, 1, 7);
  for (let i = 0; i < 50; i++) { setNow(start + i * DAY); save(post, { id: 'r' + i, name: 'meal-prep-r' + i + '.json', obj: { i } }); }
  const names = d.live().filter(f => f._folder._name === 'Meal Prep backups').map(f => f._name);
  assert.ok(names.includes('meal-prep-r49.json'));
  // last one is Tuesday 20 Oct: 14-20 Oct daily, then Sunday 11 Oct and Sunday 4 Oct for the weeks before
  assert.deepStrictEqual(names.sort(), [33, 40, 43, 44, 45, 46, 47, 48, 49].map(i => 'meal-prep-r' + i + '.json').sort());
  assert.deepStrictEqual(d.live().filter(f => f._folder._name === '_parts'), [], 'no parts left behind');
  // the same name sent again replaces the file rather than adding a second one
  save(post, { id: 'r49', name: 'meal-prep-r49.json', obj: { i: 'again' } });
  assert.strictEqual(d.live().filter(f => f._name === 'meal-prep-r49.json').length, 1);
});
