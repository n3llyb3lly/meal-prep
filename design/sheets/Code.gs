/**
 * Meal Prep: Google Sheets back end
 * =================================
 * Paste this whole file into Extensions > Apps Script (replace everything in Code.gs).
 *
 * What it does
 *  - doGet:  the app asks for the catalog. This builds it from the Items, Categories, Recipes,
 *            Ingredients and Receipt aliases sheets, in the same layout as catalog.json.
 *  - doPost: the app sends changes made on the phone. Each one is applied once, logged in
 *            "Change log", and answered (applied / already applied / sheet kept / refused).
 *  - A "Meal Prep" menu in the spreadsheet: check the data, set up sheets and dropdowns,
 *    set the app key, and show the app address.
 *  - onEdit: when you edit a row of Items or Recipes (or a recipe's Ingredients), it stamps
 *    last_changed and changed_by = sheet. That is how "the sheet wins" is decided.
 *
 * Columns are found by their header name, so you can reorder columns or add your own.
 * Nothing here needs editing. The secret key is stored with "Meal Prep > Set the app key".
 */

// ---------------------------------------------------------------- settings

var SHEETS = {
  items: 'Items', categories: 'Categories', recipes: 'Recipes', ingredients: 'Ingredients',
  aliases: 'Receipt aliases', lists: 'Lists', log: 'Change log', idmap: 'Id map', cache: '_catalog',
  offers: 'Offers', nodes: 'Nodes', stores: 'Stores', favorites: 'Favorites'
};
var MEALS = ['breakfast', 'lunch', 'snack', 'dinner'];
var STORAGE = ['fridge', 'freezer', 'pantry', 'counter'];
var TRACKING = ['quantity', 'staple', 'stocked'];
var SOLD_BY = ['pack', 'weight'];
var SCHEMA = 2;                 // newest catalog format; ?schema=1 (the default) serves the version 5.3 shape
var LEVELS = { 1: 'Category', 2: 'Type', 3: 'Form', 4: 'Variety', 5: 'Style' };
var OFFER_HEADERS = ['item', 'store', 'price', 'pack', 'unit', 'pkg', 'numbers', 'price_date', 'price_source', 'last_changed', 'changed_by'];
var NODE_HEADERS = ['id', 'name', 'parent', 'level', 'last_changed', 'changed_by'];
var STORE_HEADERS = ['id', 'name', 'num_digits', 'num_where'];
var FAVORITE_HEADERS = ['node', 'item', 'last_changed'];
var DEFAULT_STORES = [['aldi', 'Aldi', '6', 'before'], ['sams', "Sam's Club", '9;10', 'before'], ['walmart', 'Walmart', '12', 'after'], ['cub', 'Cub', '11;12', 'after'], ['target', 'Target', '9', 'before']];
// Prices live in the Offers tab once "Meal Prep > Move prices to Offers" has run. Before that, the Items
// price columns are the Aldi offer.
function migrated_() { return PropertiesService.getScriptProperties().getProperty('OFFERS_MIGRATED') === 'yes'; }
var MAX_BATCH = 100;            // changes accepted in one request
var LOG_HEADERS = ['received_at', 'change_id', 'type', 'target_id', 'result', 'message', 'data'];
var IDMAP_HEADERS = ['phone_id', 'sheet_id', 'kind', 'created_at'];

// ---------------------------------------------------------------- small helpers

function norm_(s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, '_'); }
function blank_(v) { return v == null || String(v).trim() === ''; }
function num_(v) { return blank_(v) || isNaN(+v) ? null : +v; }
function str_(v) { return blank_(v) ? '' : String(v).trim(); }
// Y/N cells. Checkboxes (true/false) count as Y/N too.
function yn_(v) { if (v === true) return 'Y'; if (v === false) return 'N'; return blank_(v) ? null : String(v).trim().toUpperCase(); }
function tz_() { return SpreadsheetApp.getActive().getSpreadsheetTimeZone(); }
function dateStr_(v) {
  if (blank_(v)) return null;
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v) ? null : Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  var m = String(v).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  var d = new Date(v); return isNaN(d) ? null : Utilities.formatDate(d, tz_(), 'yyyy-MM-dd');
}
function iso_(v) { return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v) ? v.toISOString() : (blank_(v) ? null : String(v)); }
function nname_(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function slug_(s) { return nname_(s).replace(/ /g, '_').slice(0, 40); }
function r3_(n) { return Math.round(n * 1000) / 1000; }
// Aldi numbers in a cell: "382147; 382148" -> ['382147','382148']
function nums_(v) { return str_(v).split(/[;,\s]+/).map(function (x) { return x.trim(); }).filter(String); }
function hex_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}

// Finds a sheet by name, ignoring capitals and extra spaces ("Receipt Aliases " finds "Receipt aliases").
function sheet_(name) {
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(name); if (sh) return sh;
  var k = norm_(name), all = ss.getSheets();
  for (var i = 0; i < all.length; i++) if (norm_(all[i].getName()) === k) return all[i];
  return null;
}

// A sheet as a table: header names (normalised), rows, and helpers to read and write by header.
function table_(name) {
  var sh = sheet_(name);
  if (!sh) return null;
  var values = sh.getDataRange().getValues();
  var headers = (values[0] || []).map(norm_);
  var col = {}; headers.forEach(function (h, i) { if (h && col[h] == null) col[h] = i; });
  return {
    sheet: sh, headers: headers, col: col, rows: values.slice(1),
    // row objects keyed by header, with the sheet row number in _row
    objects: function () {
      var self = this;
      return self.rows.map(function (r, i) {
        var o = { _row: i + 2 }; self.headers.forEach(function (h, j) { if (h && !(h in o)) o[h] = r[j]; }); return o;
      });
    },
    get: function (rowObj, h) { return rowObj[h]; },
    set: function (rowNum, h, value) {
      if (this.col[h] == null) throw new Error(name + ' has no "' + h + '" column. Run Meal Prep > Set up sheets and dropdowns.');
      this.sheet.getRange(rowNum, this.col[h] + 1).setValue(value);
      var r = this.rows[rowNum - 2]; if (r) r[this.col[h]] = value;
    },
    append: function (obj) {
      var self = this;
      var row = self.headers.map(function (h) { return h && obj[h] !== undefined ? obj[h] : ''; });
      self.sheet.appendRow(row); self.rows.push(row);
      return self.rows.length + 1;
    }
  };
}

// ---------------------------------------------------------------- building the catalog

/**
 * Reads the sheets and returns {catalog, errors, warnings}, using the same rules as the
 * catalog builder page (tools/catalog-builder.html), plus Aldi number checks.
 * prev = the last good catalog, used to catch items deleted instead of retired.
 */
function buildCatalog_(prev) {
  var errors = [], warnings = [];
  function E(m) { errors.push(m); } function W(m) { warnings.push(m); }
  var tI = table_(SHEETS.items), tR = table_(SHEETS.recipes), tG = table_(SHEETS.ingredients),
      tA = table_(SHEETS.aliases), tL = table_(SHEETS.lists), tC = table_(SHEETS.categories);
  if (!tI) E('No "Items" sheet found.'); if (!tR) E('No "Recipes" sheet found.'); if (!tG) E('No "Ingredients" sheet found.');
  if (errors.length) return { errors: errors, warnings: warnings };
  var itemsR = tI.objects(), recR = tR.objects(), ingR = tG.objects(), aliasR = tA ? tA.objects() : [], listR = tL ? tL.objects() : null, catR = tC ? tC.objects() : null;
  var tO = table_(SHEETS.offers), tN = table_(SHEETS.nodes), tS = table_(SHEETS.stores), tF = table_(SHEETS.favorites);
  var MIG = migrated_();

  // Stores
  var stores = [], ST = {};
  (tS ? tS.objects() : DEFAULT_STORES.map(function (x) { return { id: x[0], name: x[1], num_digits: x[2], num_where: x[3], _row: 0 }; })).forEach(function (r) {
    var id = str_(r.id).toLowerCase(); if (!id) return;
    if (ST[id]) { E('Stores row ' + r._row + ': store "' + id + '" is listed twice.'); return; }
    var digits = str_(r.num_digits).split(/[;,\s]+/).map(function (x) { return parseInt(x, 10); }).filter(function (n) { return n > 0; });
    var where = str_(r.num_where).toLowerCase() === 'after' ? 'after' : 'before';
    var st = { id: id, name: str_(r.name) || id, num: { digits: digits, where: where } }; ST[id] = st; stores.push(st);
  });
  if (!ST.aldi) E('The Stores tab has no "aldi" row. Older phones need it.');

  // Nodes (the item tree): 1 Category, 2 Type, 3 Form, 4 Variety, 5 Style. A node may skip levels.
  var nodes = [], ND = {};
  (tN ? tN.objects() : []).forEach(function (r) {
    var id = str_(r.id), line = 'Nodes row ' + r._row; if (!id) return;
    if (ND[id]) { E(line + ': node "' + id + '" is listed twice.'); return; }
    if (!/^n_[a-z0-9_]+$/.test(id)) E(line + ': node id "' + id + '" should start with n_ and use lowercase letters, numbers and _.');
    var level = num_(r.level); if (!(level >= 1 && level <= 5 && level === Math.round(level))) E(line + ' (' + id + '): level must be 1 to 5.');
    var n = { id: id, name: str_(r.name) || id, parent: str_(r.parent) || null, level: level || 1, changed: iso_(r.last_changed) };
    ND[id] = n; nodes.push(n);
  });
  nodes.forEach(function (n) {
    if (n.parent && !ND[n.parent]) E('Node ' + n.id + ': parent "' + n.parent + '" isn\'t on the Nodes tab.');
    else if (n.parent && ND[n.parent].level >= n.level) E('Node ' + n.id + ' (level ' + n.level + ') sits under ' + n.parent + ' (level ' + ND[n.parent].level + '). A parent must have a lower level.');
    if (n.level === 1 && n.parent) E('Node ' + n.id + ' is level 1 but has a parent.');
    var seenUp = {}, cur = n, hops = 0;
    while (cur && cur.parent && hops++ < 10) { if (seenUp[cur.id]) break; seenUp[cur.id] = 1; cur = ND[cur.parent]; if (cur && cur.id === n.id) { E('Node ' + n.id + ' is its own ancestor (a loop in parent).'); break; } }
  });

  // Offers: one row per item per store
  var OF = {};
  (tO ? tO.objects() : []).forEach(function (r) {
    var item = str_(r.item), store = str_(r.store).toLowerCase(), line = 'Offers row ' + r._row; if (!item && !store) return;
    if (!store || !ST[store]) { E(line + ' (' + item + '): store "' + (r.store || '') + '" isn\'t on the Stores tab.'); return; }
    var o = { store: store, price: num_(r.price), pack: str_(r.pack), unit: str_(r.unit), pkg: num_(r.pkg), nums: nums_(r.numbers),
              priceDate: dateStr_(r.price_date), src: str_(r.price_source), changed: iso_(r.last_changed), _line: line, _item: item };
    var list = OF[item] || (OF[item] = []);
    if (list.some(function (x) { return x.store === store; })) { E(line + ': ' + item + ' has two rows for ' + store + '. Keep one.'); return; }
    list.push(o);
  });
  var today = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');

  var TAGS = null;
  if (listR) { var t = listR.map(function (r) { return str_(r.tags).toLowerCase(); }).filter(String); if (t.length) TAGS = t.reduce(function (s, x) { s[x] = 1; return s; }, {}); }

  // Categories
  var categories = [], CATS = {};
  if (catR) catR.forEach(function (r) {
    var name = str_(r.category); if (!name) return; var line = 'Categories row ' + r._row;
    if (CATS[name.toLowerCase()]) { E(line + ': category "' + name + '" is listed twice.'); return; }
    var storage = str_(r.storage).toLowerCase() || 'pantry'; if (STORAGE.indexOf(storage) < 0) E(line + ' (' + name + '): storage "' + r.storage + '" isn\'t one of ' + STORAGE.join(', ') + '.');
    var tr = str_(r.tracking_default).toLowerCase() || 'quantity'; if (TRACKING.indexOf(tr) < 0) E(line + ' (' + name + '): tracking_default "' + r.tracking_default + '" isn\'t one of ' + TRACKING.join(', ') + '.');
    var c = { name: name, section: str_(r.store_section) || name, storage: storage, fridge: num_(r.fridge_days), freezer: num_(r.freezer_days), pantry: num_(r.pantry_days), tracking: tr, staple: yn_(r.staple_default) === 'Y' };
    CATS[name.toLowerCase()] = c; categories.push(c);
  });
  else W('No "Categories" sheet. Items you add on the phone will use built-in defaults.');

  // Items
  var items = [], seen = {}, noSold = [];
  itemsR.forEach(function (r) {
    var id = str_(r.item_id), line = 'Items row ' + r._row; if (!id) return;
    if (seen[id]) { E(line + ': duplicate item_id "' + id + '".'); return; } seen[id] = 1;
    if (!/^[a-z0-9_]+$/.test(id)) E(line + ': item_id "' + id + '" should be lowercase letters, numbers and underscores.');
    var retired = yn_(r.retired) === 'Y';
    ['staple', 'retired'].forEach(function (k) { if (!blank_(r[k]) && ['Y', 'N'].indexOf(yn_(r[k])) < 0) E(line + ' (' + id + '): ' + k + ' must be Y or N.'); });
    var storage = str_(r.storage).toLowerCase() || null; if (storage && STORAGE.indexOf(storage) < 0) E(line + ' (' + id + '): storage "' + r.storage + '" isn\'t one of ' + STORAGE.join(', ') + '.');
    var price = num_(r.price), pkg = num_(r.package_qty);
    var catName = str_(r.category) || 'Pantry'; if (catR && !CATS[catName.toLowerCase()]) E(line + ' (' + id + '): category "' + catName + '" isn\'t on the Categories sheet.');
    var sb = str_(r.sold_by).toLowerCase(); if (!retired && !sb) noSold.push(id); else if (sb && SOLD_BY.indexOf(sb) < 0) E(line + ' (' + id + '): sold_by "' + r.sold_by + '" must be pack or weight.');
    var tr = str_(r.tracking_default).toLowerCase(); if (tr && TRACKING.indexOf(tr) < 0) E(line + ' (' + id + '): tracking_default "' + r.tracking_default + '" isn\'t one of ' + TRACKING.join(', ') + '.');
    var it = {
      id: id, name: str_(r.name) || id, cat: catName, family: str_(r.family).toLowerCase() || null, soldBy: sb || null,
      altSizes: str_(r.alt_sizes).split(/[;,]/).map(function (s) { return +s.trim(); }).filter(function (n) { return n > 0; }),
      tracking: tr || null, pack: str_(r.package_label), unit: str_(r.unit) || 'each', pkg: pkg || 1, price: price || 0,
      src: str_(r.price_source), priceDate: dateStr_(r.price_date), staple: yn_(r.staple) === 'Y', storage: storage,
      fridge: num_(r.fridge_days), freezer: num_(r.freezer_days), pantry: num_(r.pantry_days), aldi: str_(r.aldi_product),
      nums: nums_(r.aldi_numbers), retired: retired, replacedBy: str_(r.replaced_by) || null,
      changed: iso_(r.last_changed),   // extra: when the row last changed; the app sends it back as the "base"
      brand: str_(r.brand) || null, node: str_(r.node) || null, offers: []
    };
    // Offers: rows from the Offers tab. Before the move to Offers, the Items price columns are the Aldi offer.
    var rows = (OF[id] || []).map(function (o) {
      return { store: o.store, price: o.price, pack: o.pack || it.pack, unit: o.unit || it.unit, pkg: o.pkg || it.pkg, nums: o.nums, priceDate: o.priceDate, src: o.src, changed: o.changed };
    });
    if (!MIG && price != null && !rows.some(function (o) { return o.store === 'aldi'; }))
      rows.unshift({ store: 'aldi', price: price, pack: it.pack, unit: it.unit, pkg: pkg || 1, nums: nums_(r.aldi_numbers), priceDate: it.priceDate, src: it.src, changed: it.changed });
    rows.sort(function (a, b) { return a.store === 'aldi' ? -1 : b.store === 'aldi' ? 1 : 0; });
    it.offers = rows;
    // Top-level price fields mirror the Aldi offer, else the first offer with a price (version 5.3 phones read only these).
    var mirror = rows.filter(function (o) { return o.store === 'aldi' && o.price > 0; })[0] || rows.filter(function (o) { return o.price > 0; })[0];
    if (mirror) { it.price = mirror.price; it.pack = mirror.pack; it.unit = mirror.unit; it.pkg = mirror.pkg; it.priceDate = mirror.priceDate; it.src = mirror.src; it.nums = mirror.nums; }
    else { it.nums = (rows.filter(function (o) { return o.store === 'aldi'; })[0] || { nums: MIG ? [] : it.nums }).nums; }
    if (!retired && !(it.price > 0)) E(line + ' (' + id + '): price is missing, zero or not a number' + (MIG ? ' (add a price on the Offers tab).' : '.'));
    if (!retired && !(it.pkg > 0)) E(line + ' (' + id + '): package_qty is missing or zero.');
    if (it.node && !ND[it.node]) E(line + ' (' + id + '): node "' + it.node + '" isn\'t on the Nodes tab.');
    if (!retired && !it.staple && (storage === 'fridge' || storage === 'counter') && it.fridge == null && it.pantry == null) W(id + ': perishable with no shelf-life days.');
    if (!retired && (!it.priceDate || (new Date(today) - new Date(it.priceDate)) / 864e5 > 30)) W(id + ': price_date ' + (it.priceDate || 'missing') + ' is over 30 days old.');
    it.offers.forEach(function (o) {
      o.nums.forEach(function (n) {
        if (!/^\d{4,14}$/.test(n)) E(line + ' (' + id + '): ' + (ST[o.store] ? ST[o.store].name : o.store) + ' number "' + n + '" isn\'t 4 to 14 digits.');
        else if (ST[o.store] && ST[o.store].num.digits.length && ST[o.store].num.digits.indexOf(n.length) < 0) W(id + ': ' + ST[o.store].name + ' number ' + n + ' has ' + n.length + ' digits; that store usually prints ' + ST[o.store].num.digits.join(' or ') + '.');
      });
    });
    items.push(it);
  });
  Object.keys(OF).forEach(function (item) { if (!seen[item]) OF[item].forEach(function (o) { E(o._line + ': item "' + item + '" isn\'t on the Items tab.'); }); });
  var numOwner = {};
  items.forEach(function (it) { it.offers.forEach(function (o) { o.nums.forEach(function (n) { var k = o.store + '|' + n;
    if (numOwner[k] && numOwner[k] !== it.id) E((ST[o.store] ? ST[o.store].name : o.store) + ' number ' + n + ' is on both ' + numOwner[k] + ' and ' + it.id + '. Keep it on one item.'); numOwner[k] = it.id; }); }); });
  if (catR && noSold.length) W(noSold.length + ' item' + (noSold.length === 1 ? '' : 's') + ' have no sold_by (pack or weight): ' + noSold.slice(0, 12).join(', ') + (noSold.length > 12 ? ', …' : '') + '.');
  var I = {}; items.forEach(function (x) { I[x.id] = x; });
  items.forEach(function (it) { if (it.replacedBy && !I[it.replacedBy]) E(it.id + ': replaced_by "' + it.replacedBy + '" isn\'t an item_id.'); });
  if (prev && prev.items) prev.items.forEach(function (p) { if (!I[p.id]) E('Item "' + p.id + '" was in the last catalog and is now gone. Mark it retired instead of deleting it.'); });

  // Recipes
  var recipes = [], rSeen = {}, R = {};
  recR.forEach(function (r) {
    var id = str_(r.recipe_id), line = 'Recipes row ' + r._row; if (!id) return;
    if (rSeen[id]) { E(line + ': duplicate recipe_id "' + id + '".'); return; } rSeen[id] = 1;
    var active = yn_(r.active) !== 'N';
    ['reheats', 'freezes', 'active'].forEach(function (k) { if (!blank_(r[k]) && ['Y', 'N'].indexOf(yn_(r[k])) < 0) E(line + ' (' + id + '): ' + k + ' must be Y or N.'); });
    var meal = str_(r.meal).toLowerCase(), serv = num_(r.servings), total = num_(r.total_min), hands = num_(r.hands_on_min);
    var tags = str_(r.tags).split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(String);
    if (active) {
      if (MEALS.indexOf(meal) < 0) E(line + ' (' + id + '): meal "' + (r.meal || '') + '" isn\'t one of ' + MEALS.join(', ') + '.');
      if (!(serv > 0)) E(line + ' (' + id + '): servings missing.'); if (!(total > 0)) E(line + ' (' + id + '): total_min missing.');
      if (hands != null && total != null && hands > total) W(id + ': hands_on_min (' + hands + ') is more than total_min (' + total + ').');
      if (TAGS) tags.forEach(function (t) { if (!TAGS[t]) E(line + ' (' + id + '): tag "' + t + '" isn\'t on the Lists sheet.'); });
    }
    var src = str_(r.source);
    var rec = {
      id: id, meal: meal, name: str_(r.name) || id, tags: tags, serv: serv || 1, link: str_(r.link), source: src.split(' · ')[0],
      rating: src.split(' · ').slice(1).join(' · '), ing: [], notes: str_(r.notes), hands: hands != null ? hands : total, total: total,
      keeps: num_(r.keeps_days) != null ? num_(r.keeps_days) : 1, reheats: yn_(r.reheats) === 'Y', freezes: yn_(r.freezes) === 'Y',
      changed: iso_(r.last_changed), active: active
    };
    R[id] = rec; recipes.push(rec);
  });

  // Ingredients: qty in the sheet is for the whole recipe; the catalog stores it per serving.
  var seenLine = {};
  ingR.forEach(function (r) {
    var rid = str_(r.recipe_id), iid = str_(r.item_id), line = 'Ingredients row ' + r._row; if (!rid && !iid) return;
    var rec = R[rid]; if (!rec) { E(line + ': recipe_id "' + rid + '" isn\'t on the Recipes sheet.'); return; }
    if (/^n_/.test(iid) ? !ND[iid] : !I[iid]) { E(line + ' (' + rid + '): ' + (/^n_/.test(iid) ? 'node "' + iid + '" isn\'t on the Nodes tab.' : 'item_id "' + iid + '" isn\'t on the Items sheet.')); return; }
    if (!blank_(r.optional) && ['Y', 'N'].indexOf(yn_(r.optional)) < 0) E(line + ' (' + rid + '): optional must be Y or N.');
    var k = rid + '|' + iid; if (seenLine[k] && rec.active) E(line + ': ' + rid + ' lists ' + iid + ' twice. Add the amounts into one row.'); seenLine[k] = 1;
    var qps = num_(r.qty_per_serving), q = num_(r.qty); if (qps == null && q != null) qps = q / (rec.serv || 1);
    if (qps == null || !(qps > 0)) { E(line + ' (' + rid + ', ' + iid + '): qty missing.'); return; }
    if (rec.active && I[iid] && qps > 3 * I[iid].pkg) W(rid + ': ' + iid + ' uses ' + Math.round(qps * 100) / 100 + ' ' + I[iid].unit + ' per serving, more than 3 packages. Check the unit.');
    if (rec.active && I[iid] && I[iid].retired) W(rid + ': uses retired item ' + iid + (I[iid].replacedBy ? ' (replaced by ' + I[iid].replacedBy + ')' : '') + '.');
    var opt = yn_(r.optional) === 'Y';
    rec.ing.push(opt ? [iid, qps, str_(r.as_written), 1] : [iid, qps, str_(r.as_written)]);
  });
  recipes.forEach(function (rec) { if (rec.active && !rec.ing.length) E(rec.id + ': no ingredients.'); });
  var bare = recipes.filter(function (r) { return r.active && !r.link && !r.notes; }).map(function (r) { return r.id; });
  if (bare.length) W(bare.length + ' recipe' + (bare.length === 1 ? ' has' : 's have') + ' no notes and no link: ' + bare.slice(0, 10).join(', ') + (bare.length > 10 ? ', …' : '') + '.');
  var used = {}; recipes.forEach(function (rec) { if (rec.active) rec.ing.forEach(function (x) { used[x[0]] = 1; }); });
  var unused = items.filter(function (it) { return !it.retired && !it.staple && !used[it.id]; }).map(function (it) { return it.id; });
  if (unused.length) W(unused.length + ' item' + (unused.length === 1 ? '' : 's') + ' no active recipe uses: ' + unused.join(', ') + '.');

  var aliases = aliasR.map(function (r) { return { text: str_(r.receipt_text), item: str_(r.item_id), store: str_(r.store).toLowerCase() }; }).filter(function (a) { return a.text && a.item; });
  aliases.forEach(function (a) {
    if (a.item !== 'ignore' && !I[a.item]) E('Receipt alias "' + a.text + '" points to unknown item "' + a.item + '".');
    if (a.store && !ST[a.store]) E('Receipt alias "' + a.text + '": store "' + a.store + '" isn\'t on the Stores tab.');
  });

  // Favorites: one item per node. The item must sit under that node (at it or below it).
  var favorites = {};
  var under = function (nodeId, target) { var cur = ND[nodeId], hops = 0; while (cur && hops++ < 10) { if (cur.id === target) return true; cur = cur.parent ? ND[cur.parent] : null; } return false; };
  (tF ? tF.objects() : []).forEach(function (r) {
    var node = str_(r.node), item = str_(r.item); if (!node) return;
    if (!ND[node]) { W('Favorites row ' + r._row + ': node "' + node + '" isn\'t on the Nodes tab.'); return; }
    if (!item) return;
    if (!I[item]) { W('Favorites row ' + r._row + ': item "' + item + '" isn\'t on the Items tab.'); return; }
    if (!I[item].node || !under(I[item].node, node)) W('Favorites row ' + r._row + ': ' + item + ' isn\'t placed under ' + node + ' (its node is ' + (I[item].node || 'blank') + ').');
    favorites[node] = item;
  });
  if (MIG) items.forEach(function (it) { var r = itemsR.filter(function (x) { return str_(x.item_id) === it.id; })[0]; if (r && !blank_(r.price) && it.offers.length && Math.abs(num_(r.price) - (it.offers[0].price || 0)) > 0.005 && it.offers[0].store === 'aldi') W(it.id + ': the Items price column (' + r.price + ') differs from the Aldi offer (' + it.offers[0].price + '). Prices now come from the Offers tab.'); });

  var catalog = {
    schemaVersion: SCHEMA, catalogVersion: null, builtAt: null, categories: categories, stores: stores,
    nodes: nodes.map(function (n) { return { id: n.id, name: n.name, parent: n.parent, level: n.level }; }), items: items,
    recipes: recipes.filter(function (r) { return r.active; }).map(function (r) { var o = {}; for (var k in r) if (k !== 'active') o[k] = r[k]; return o; }),
    aliases: aliases, favorites: favorites
  };
  return { catalog: catalog, errors: errors, warnings: warnings };
}

// The last good catalog is kept in a hidden "_catalog" sheet, so a mistake in the sheet never
// leaves the phone without a catalog. Cells hold at most 50,000 characters, so it is split.
function cacheSheet_() {
  var ss = SpreadsheetApp.getActive(), sh = sheet_(SHEETS.cache);
  if (!sh) { sh = ss.insertSheet(SHEETS.cache); sh.hideSheet(); }
  return sh;
}
function readGood_() {
  var sh = cacheSheet_(); var v = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  var meta = String(v[0] || ''); if (!meta) return null;
  try { var m = JSON.parse(meta); return { hash: m.hash, catalog: JSON.parse(v.slice(1).join('')) }; } catch (e) { return null; }
}
function writeGood_(hash, catalog) {
  var sh = cacheSheet_(), text = JSON.stringify(catalog), parts = [JSON.stringify({ hash: hash, at: new Date().toISOString() })];
  for (var i = 0; i < text.length; i += 45000) parts.push(text.slice(i, i + 45000));
  sh.clear(); sh.getRange(1, 1, 1, parts.length).setNumberFormat('@').setValues([parts]);
}

/**
 * The current catalog for the app. If the sheet has errors, the last good catalog is served
 * and the errors are listed, so the app can say "the sheet has problems; using the last good copy".
 * catalogVersion changes only when the content changes: date first seen + a short fingerprint.
 */
function currentCatalog_() {
  var good = readGood_();
  var b = buildCatalog_(good && good.catalog);
  if (b.errors.length) {
    return { catalog: good ? good.catalog : null, errors: b.errors, warnings: b.warnings, stale: !!good };
  }
  var hash = hex_(JSON.stringify(b.catalog)).slice(0, 8);
  if (good && good.hash === hash) return { catalog: good.catalog, errors: [], warnings: b.warnings, stale: false };
  var now = new Date();
  b.catalog.catalogVersion = Utilities.formatDate(now, tz_(), 'yyyy.MM.dd') + '-' + hash;
  b.catalog.builtAt = now.toISOString();
  writeGood_(hash, b.catalog);
  return { catalog: b.catalog, errors: [], warnings: b.warnings, stale: false };
}

/**
 * The catalog in the version 1 shape that version 5.3 phones understand: no stores, nodes, offers or
 * favorites, and recipe ingredients that point to a node replaced by the favorite product under it,
 * otherwise the cheapest per unit. An ingredient with no product under its node is left out.
 */
function toV1_(c) {
  var I = {}; c.items.forEach(function (x) { I[x.id] = x; });
  var kids = {}; (c.nodes || []).forEach(function (n) { if (n.parent) (kids[n.parent] = kids[n.parent] || []).push(n.id); });
  var below = function (id) { var out = [id], q = [id], hops = 0; while (q.length && hops++ < 500) { var k = kids[q.shift()] || []; k.forEach(function (x) { if (out.indexOf(x) < 0) { out.push(x); q.push(x); } }); } return out; };
  var depth = {}; (c.nodes || []).forEach(function (n) { depth[n.id] = n.level; });
  // The favorite, else the cheapest per unit among products in the unit most products under the node use
  // (ties: the unit of the product placed highest), so the recipe's amount keeps its meaning.
  var pick = function (nodeId) {
    var fav = (c.favorites || {})[nodeId]; if (fav && I[fav] && !I[fav].retired) return fav;
    var set = below(nodeId), cands = c.items.filter(function (it) { return !it.retired && it.node && set.indexOf(it.node) >= 0 && it.price > 0 && it.pkg > 0; });
    if (!cands.length) return null;
    var units = {}; cands.forEach(function (it) { var u = units[it.unit] || (units[it.unit] = { n: 0, top: 9 }); u.n++; u.top = Math.min(u.top, depth[it.node] || 9); });
    var unit = Object.keys(units).sort(function (a, b) { return units[b].n - units[a].n || units[a].top - units[b].top || (a < b ? -1 : 1); })[0];
    var best = null, bestPer = Infinity;
    cands.forEach(function (it) { if (it.unit !== unit) return; var per = it.price / it.pkg;
      if (per < bestPer - 1e-9 || (Math.abs(per - bestPer) < 1e-9 && best && it.name < I[best].name)) { best = it.id; bestPer = per; } });
    return best;
  };
  var V1_ITEM = ['id', 'name', 'cat', 'family', 'soldBy', 'altSizes', 'tracking', 'pack', 'unit', 'pkg', 'price', 'src', 'priceDate', 'staple', 'storage', 'fridge', 'freezer', 'pantry', 'aldi', 'nums', 'retired', 'replacedBy', 'changed'];
  return {
    schemaVersion: 1, catalogVersion: c.catalogVersion, builtAt: c.builtAt, categories: c.categories,
    items: c.items.map(function (it) { var o = {}; V1_ITEM.forEach(function (k) { o[k] = it[k] === undefined ? null : it[k]; }); return o; }),
    recipes: c.recipes.map(function (r) {
      var o = {}; for (var k in r) o[k] = r[k];
      o.ing = r.ing.map(function (x) { if (!/^n_/.test(x[0])) return x; var id = pick(x[0]); return id ? [id].concat(x.slice(1)) : null; }).filter(Boolean);
      return o;
    }),
    aliases: (c.aliases || []).filter(function (a) { return !a.store || a.store === 'aldi'; }).map(function (a) { return { text: a.text, item: a.item }; })
  };
}

// ---------------------------------------------------------------- the web app

function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

// Compares the key without stopping at the first wrong character.
function keyOk_(given) {
  var key = PropertiesService.getScriptProperties().getProperty('APP_KEY');
  if (!key || !given) return false;
  given = String(given); var diff = key.length ^ given.length;
  for (var i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ given.charCodeAt(i % Math.max(1, given.length));
  return diff === 0;
}

/**
 * GET  <app address>?key=SECRET               -> the catalog in the version 1 shape (version 5.3 phones)
 *      <app address>?key=SECRET&schema=2      -> the catalog in the version 2 shape (stores, nodes, offers, favorites)
 *      <app address>?key=SECRET&have=VERSION  -> {notModified:true} if nothing changed
 *      <app address>?key=SECRET&ping=1        -> a quick "it works" check
 */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!keyOk_(p.key)) return json_({ ok: false, error: 'refused', message: 'Wrong or missing key.' });
  if (p.ping) return json_({ ok: true, app: 'meal-prep-sheet', at: new Date().toISOString() });
  var c = currentCatalog_();
  var problems = { errors: c.errors, warnings: c.warnings, stale: c.stale };
  if (!c.catalog) return json_({ ok: false, error: 'sheet-errors', message: 'The sheet has errors and there is no earlier good copy.', problems: problems });
  if (p.have && p.have === c.catalog.catalogVersion) return json_({ ok: true, notModified: true, version: c.catalog.catalogVersion, problems: problems });
  // Version 5.3 phones send no schema and get the version 1 shape. Version 6 sends schema=2.
  var cat = String(p.schema || '1') === '2' ? c.catalog : toV1_(c.catalog);
  return json_({ ok: true, version: c.catalog.catalogVersion, schema: cat.schemaVersion, catalog: cat, problems: problems });
}

/**
 * POST body (sent as plain text, see the app instructions):
 *   {"key":"SECRET","device":"pixel","changes":[{"id":"c_…","type":"price.set","at":"…","data":{…},"base":{…}}, …]}
 * Reply:
 *   {"ok":true,"results":[{"id":"c_…","status":"applied|duplicate|conflict|rejected|error","message":"…","sheet":{…}}],
 *    "idMap":{"u_greek_yogurt_tub":"greek_yogurt_tub","edit:d_tacos":"d_tacos_mine"},"version":"…"}
 */
function doPost(e) {
  var body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return json_({ ok: false, error: 'bad-json', message: 'The request was not valid JSON.' }); }
  if (!keyOk_(body.key)) return json_({ ok: false, error: 'refused', message: 'Wrong or missing key.' });
  var changes = Array.isArray(body.changes) ? body.changes.slice(0, MAX_BATCH) : [];
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return json_({ ok: false, error: 'busy', message: 'The sheet is busy. Try again in a minute.' });
  try {
    var ctx = context_();
    var results = changes.map(function (ch) { return applyOne_(ctx, ch, body.device); });
    SpreadsheetApp.flush();
    var version = null;
    try { var c = currentCatalog_(); version = c.catalog && c.catalog.catalogVersion; } catch (err) { }
    return json_({ ok: true, results: results, idMap: ctx.idMap, version: version });
  } finally { lock.releaseLock(); }
}

// ---------------------------------------------------------------- applying phone changes

// Everything one request needs, read once.
function context_() {
  var log = ensureSheet_(SHEETS.log, LOG_HEADERS), idm = ensureSheet_(SHEETS.idmap, IDMAP_HEADERS);
  var ctx = { items: table_(SHEETS.items), recipes: table_(SHEETS.recipes), ingredients: table_(SHEETS.ingredients), aliases: table_(SHEETS.aliases), log: table_(SHEETS.log), idm: table_(SHEETS.idmap), idMap: {} };
  ctx.done = {}; ctx.log.objects().forEach(function (r) { if (r.change_id) ctx.done[String(r.change_id)] = r; });
  ctx.map = {}; ctx.idm.objects().forEach(function (r) { if (r.phone_id) ctx.map[String(r.phone_id)] = String(r.sheet_id); });
  ctx.itemRow = {}; ctx.items.objects().forEach(function (r) { if (r.item_id) ctx.itemRow[String(r.item_id)] = r; });
  ctx.recRow = {}; ctx.recipes.objects().forEach(function (r) { if (r.recipe_id) ctx.recRow[String(r.recipe_id)] = r; });
  ensureSheet_(SHEETS.offers, OFFER_HEADERS); ensureSheet_(SHEETS.nodes, NODE_HEADERS); ensureSheet_(SHEETS.favorites, FAVORITE_HEADERS); ensureStores_();
  ctx.offers = table_(SHEETS.offers); ctx.nodes = table_(SHEETS.nodes); ctx.favs = table_(SHEETS.favorites);
  ctx.offerRow = {}; ctx.offers.objects().forEach(function (r) { if (r.item && r.store) ctx.offerRow[String(r.item) + '|' + String(r.store).toLowerCase()] = r; });
  ctx.nodeRow = {}; ctx.nodes.objects().forEach(function (r) { if (r.id) ctx.nodeRow[String(r.id)] = r; });
  ctx.storeIds = {}; ctx.storeName = {}; table_(SHEETS.stores).objects().forEach(function (r) { if (r.id) { var k = String(r.id).toLowerCase(); ctx.storeIds[k] = 1; ctx.storeName[k] = str_(r.name) || k; } });
  ctx.migrated = migrated_();
  return ctx;
}

// The value in a row object's cell as it is now (after earlier changes in this batch).
function cell_(t, r, h) { return t.col[h] == null ? null : t.rows[r._row - 2][t.col[h]]; }
function storeOf_(d) { return String(d.store || 'aldi').toLowerCase(); }
function dateVal_(d) { return d ? new Date(d + 'T12:00:00') : new Date(); }

// Creates or updates one Offers row. fields use Offers column names.
function setOffer_(ctx, item, store, fields) {
  var key = item + '|' + store, r = ctx.offerRow[key];
  if (r) { for (var h in fields) if (ctx.offers.col[h] != null) ctx.offers.set(r._row, h, fields[h]); stampRow_(ctx.offers, r._row); return r; }
  var it = ctx.itemRow[item] || {};
  var row = { item: item, store: store, price: '', pack: cell_(ctx.items, it, 'package_label') || '', unit: cell_(ctx.items, it, 'unit') || '', pkg: cell_(ctx.items, it, 'package_qty') || '',
              numbers: '', price_date: '', price_source: '', last_changed: new Date(), changed_by: 'phone' };
  for (var k in fields) row[k] = fields[k];
  var n = ctx.offers.append(row); ctx.offerRow[key] = { _row: n, item: item, store: store };
  return ctx.offerRow[key];
}
// After the move to Offers, the Items price columns copy the Aldi offer so the sheet stays readable.
function mirrorAldi_(ctx, item) {
  var o = ctx.offerRow[item + '|aldi'], r = ctx.itemRow[item]; if (!o || !r || !ctx.migrated) return;
  ['price', 'price_date', 'price_source'].forEach(function (h) { if (ctx.items.col[h] != null) ctx.items.set(r._row, h, cell_(ctx.offers, o, h)); });
}
function ensureStores_() {
  var sh = sheet_(SHEETS.stores); if (sh) return sh;
  sh = ensureSheet_(SHEETS.stores, STORE_HEADERS);
  sh.getRange(2, 1, DEFAULT_STORES.length, 4).setValues(DEFAULT_STORES);
  return sh;
}

// A phone id (u_…) or merged id -> the sheet's id.
function resolve_(ctx, id) { id = String(id || ''); var seen = 0; while (ctx.map[id] && seen++ < 5) id = ctx.map[id]; return id; }

function stampRow_(t, rowNum) { if (t.col.last_changed != null) t.set(rowNum, 'last_changed', new Date()); if (t.col.changed_by != null) t.set(rowNum, 'changed_by', 'phone'); }

function logChange_(ctx, ch, target, result, message) {
  var data = JSON.stringify({ data: ch.data, base: ch.base, at: ch.at }); if (data.length > 45000) data = data.slice(0, 45000);
  ctx.log.append({ received_at: new Date(), change_id: String(ch.id), type: ch.type, target_id: target || '', result: result, message: message || '', data: data });
}

function applyOne_(ctx, ch, device) {
  if (!ch || !ch.id || !ch.type) return { id: ch && ch.id, status: 'rejected', message: 'Change without an id or type.' };
  var prior = ctx.done[String(ch.id)];
  if (prior) {  // sent before: answer again without changing anything
    var pid = ch.data && ch.data.id; if (pid && ctx.map[pid]) ctx.idMap[pid] = resolve_(ctx, pid);
    if (ch.type === 'recipe.edit' && ch.data && ch.data.orig && ctx.map['edit:' + ch.data.orig]) ctx.idMap['edit:' + ch.data.orig] = ctx.map['edit:' + ch.data.orig];
    return { id: ch.id, status: 'duplicate', message: 'Already applied on ' + Utilities.formatDate(new Date(prior.received_at), tz_(), 'MMM d') + ' (' + prior.result + ').' };
  }
  var out;
  try {
    var fn = HANDLERS[ch.type];
    out = fn ? fn(ctx, ch.data || {}, ch.base || {}) : { status: 'rejected', message: 'Unknown change type "' + ch.type + '".' };
  } catch (err) { out = { status: 'error', message: String(err && err.message || err) }; }
  if (out.status !== 'error') logChange_(ctx, ch, out.target, out.status, out.message);   // errors are not logged, so a retry can apply them
  ctx.done[String(ch.id)] = { received_at: new Date(), result: out.status };
  var res = { id: ch.id, status: out.status, message: out.message || '' }; if (out.sheet) res.sheet = out.sheet;
  return res;
}

function newId_(base, taken) { var id = base || 'item', n = 2; while (taken[id]) id = base + '_' + (n++); return id; }
function addIdMap_(ctx, phoneId, sheetId, kind) {
  ctx.idm.append({ phone_id: phoneId, sheet_id: sheetId, kind: kind, created_at: new Date() });
  ctx.map[phoneId] = sheetId; ctx.idMap[phoneId] = sheetId;
}
function sameVal_(a, b) {
  if (blank_(a) && blank_(b)) return true;
  if (!isNaN(+a) && !isNaN(+b) && !blank_(a) && !blank_(b)) return Math.abs(+a - +b) < 0.005;
  return String(a).trim() === String(b).trim();
}

// Phone field name -> Items column. Only these can be changed from the phone.
var ITEM_FIELDS = { name: 'name', cat: 'category', pack: 'package_label', pkg: 'package_qty', unit: 'unit', aldi: 'aldi_product', storage: 'storage', soldBy: 'sold_by', notes: 'notes' };

var HANDLERS = {

  // A new item added on the phone. data = the phone's item {id:'u_…', name, cat, pack, unit, pkg, price, …}
  'item.add': function (ctx, d) {
    if (!d.id || !d.name) return { status: 'rejected', message: 'Item without an id or name.' };
    if (ctx.map[d.id]) { ctx.idMap[d.id] = resolve_(ctx, d.id); return { status: 'duplicate', target: ctx.idMap[d.id], message: 'Already in the sheet as ' + ctx.idMap[d.id] + '.' }; }
    var byName = null; for (var k in ctx.itemRow) if (nname_(ctx.itemRow[k].name) === nname_(d.name)) { byName = k; break; }
    if (byName) { addIdMap_(ctx, d.id, byName, 'item'); return { status: 'applied', target: byName, message: d.name + ' is already in the sheet as ' + byName + '. Linked to it.' }; }
    var base = String(d.id).replace(/^u_/, ''); if (!/^[a-z0-9_]+$/.test(base)) base = slug_(d.name) || 'item';
    var id = newId_(base, ctx.itemRow);
    var nums = (d.nums || []).filter(function (n) { return /^\d{4,8}$/.test(String(n)); });
    var row = ctx.items.append({
      item_id: id, name: d.name, category: d.cat || 'Other', package_label: d.pack || '', unit: d.unit || 'each', package_qty: d.pkg || 1,
      price: d.price, price_source: d.src === 'estimate' ? 'estimate' : 'phone', price_date: d.priceDate ? new Date(d.priceDate + 'T12:00:00') : new Date(),
      staple: d.staple ? 'Y' : 'N', storage: d.storage || '', fridge_days: d.fridge == null ? '' : d.fridge, freezer_days: d.freezer == null ? '' : d.freezer,
      pantry_days: d.pantry == null ? '' : d.pantry, family: d.family || '', sold_by: d.soldBy || 'pack', alt_sizes: '', tracking_default: d.tracking || '',
      aldi_product: d.aldi || '', aldi_numbers: nums.join('; '), retired: 'N', replaced_by: '', notes: 'Added on the phone',
      last_changed: new Date(), changed_by: 'phone'
    });
    ctx.itemRow[id] = { _row: row, item_id: id, name: d.name, aldi_numbers: nums.join('; '), price: d.price };
    if (ctx.items.col.brand != null && d.brand) ctx.items.set(row, 'brand', d.brand);
    var node = d.node ? resolve_(ctx, d.node) : ''; if (node && ctx.nodeRow[node] && ctx.items.col.node != null) ctx.items.set(row, 'node', node);
    // Offers: every store's offer goes to the Offers tab. Before the move to Offers the Aldi offer stays in the Items columns.
    var offers = (d.offers || []).slice();
    if (ctx.migrated && !offers.length && +d.price > 0) offers.unshift({ store: 'aldi', price: d.price, pack: d.pack, unit: d.unit, pkg: d.pkg, nums: d.nums, priceDate: d.priceDate, src: d.src });
    if (ctx.migrated && nums.length && ctx.items.col.aldi_numbers != null) ctx.items.set(row, 'aldi_numbers', '');
    offers.forEach(function (o) {
      var st = storeOf_(o); if (!ctx.storeIds[st] || (st === 'aldi' && !ctx.migrated)) return;
      var on = (o.nums || []).map(String).filter(function (n) { return /^\d{4,14}$/.test(n); });
      setOffer_(ctx, id, st, { price: o.price != null ? +o.price : '', pack: o.pack || d.pack || '', unit: o.unit || d.unit || '', pkg: o.pkg || d.pkg || '', numbers: on.join('; '),
        price_date: o.priceDate ? dateVal_(o.priceDate) : '', price_source: o.src === 'estimate' ? 'estimate' : (o.src === 'receipt' ? 'receipt' : 'phone') });
    });
    addIdMap_(ctx, d.id, id, 'item');
    return { status: 'applied', target: id, message: 'Added ' + d.name + ' as ' + id + '.' };
  },

  // Changed details of an item. data = {item, fields:{name, pack, pkg, …}}, base = {fields as the phone last saw them}
  // Version 6: data = {id, fields:{name?, brand?, pack?, unit?, pkg?, cat?, node?}}, base = {changed}. Conflict if the row changed in the sheet since.
  'item.update': function (ctx, d, base) {
    if (d.id && !d.item) return itemUpdate6_(ctx, d, base);
    var id = resolve_(ctx, d.item), r = ctx.itemRow[id]; if (!r) return { status: 'rejected', target: id, message: 'No item ' + id + ' in the sheet.' };
    var applied = [], kept = {}, f = d.fields || {}, bf = base.fields || {};
    for (var k in f) {
      var colName = ITEM_FIELDS[k]; if (!colName || ctx.items.col[colName] == null) continue;
      var now = ctx.items.rows[r._row - 2][ctx.items.col[colName]];
      if (k in bf && !sameVal_(now, bf[k])) { kept[k] = now; continue; }   // changed in the sheet since: the sheet wins
      ctx.items.set(r._row, colName, f[k]); applied.push(k);
    }
    if (applied.length) stampRow_(ctx.items, r._row);
    if (Object.keys(kept).length) return { status: 'conflict', target: id, sheet: kept, message: r.name + ': the sheet\'s ' + Object.keys(kept).join(', ') + ' was kept' + (applied.length ? '; the rest was saved.' : '.') };
    return { status: 'applied', target: id, message: 'Updated ' + applied.join(', ') + ' on ' + id + '.' };
  },

  // A price from a receipt or a hand correction. data = {item, price, date:'yyyy-mm-dd', via:'receipt'|'edited', store?}, base = {price, priceDate}
  // Sets that store's offer (creating it). Before the move to Offers, the Aldi price is in the Items columns.
  'price.set': function (ctx, d, base) {
    var store = storeOf_(d);
    if (store !== 'aldi' || ctx.migrated) return offerPrice_(ctx, d, base, store, false);
    return HANDLERS['price.legacy'](ctx, d, base);
  },

  // A full offer edit: data = {item, store, price, pack, unit, pkg, date, via}, base = {price, priceDate} or {}
  'offer.set': function (ctx, d, base) {
    var store = storeOf_(d);
    if (store === 'aldi' && !ctx.migrated) {   // before the move to Offers: the Items columns are the Aldi offer
      var out = HANDLERS['price.legacy'](ctx, d, base); if (out.status !== 'applied') return out;
      var r = ctx.itemRow[out.target];
      if (d.pack != null) ctx.items.set(r._row, 'package_label', d.pack); if (d.unit != null) ctx.items.set(r._row, 'unit', d.unit); if (d.pkg != null) ctx.items.set(r._row, 'package_qty', +d.pkg);
      return out;
    }
    return offerPrice_(ctx, d, base, store, true);
  },

  'price.legacy': function (ctx, d, base) {
    var id = resolve_(ctx, d.item), r = ctx.itemRow[id]; if (!r) return { status: 'rejected', target: id, message: 'No item ' + id + ' in the sheet.' };
    if (!(+d.price > 0)) return { status: 'rejected', target: id, message: 'Price must be more than 0.' };
    var row = ctx.items.rows[r._row - 2], nowPrice = row[ctx.items.col.price], nowDate = dateStr_(row[ctx.items.col.price_date]);
    var name = row[ctx.items.col.name];
    if ('price' in base && !sameVal_(nowPrice, base.price)) {
      return { status: 'conflict', target: id, sheet: { price: +nowPrice, priceDate: nowDate }, message: name + ': the sheet\'s price $' + (+nowPrice).toFixed(2) + ' was kept.' };
    }
    if (nowDate && d.date && d.date < nowDate) return { status: 'conflict', target: id, sheet: { price: +nowPrice, priceDate: nowDate }, message: name + ': the sheet has a newer price ($' + (+nowPrice).toFixed(2) + ' on ' + nowDate + ').' };
    ctx.items.set(r._row, 'price', +d.price);
    if (ctx.items.col.price_source != null) ctx.items.set(r._row, 'price_source', d.via === 'receipt' ? 'receipt' : 'edited');
    ctx.items.set(r._row, 'price_date', d.date ? new Date(d.date + 'T12:00:00') : new Date());
    stampRow_(ctx.items, r._row);
    return { status: 'applied', target: id, message: name + ' now $' + (+d.price).toFixed(2) + '.' };
  },

  // A store's item number linked to an item. data = {num, item, store?}. Conflict if the number is on a
  // different item at the same store.
  'number.link': function (ctx, d) {
    var store = storeOf_(d);
    if (store !== 'aldi' || ctx.migrated) {
      var n2 = String(d.num || '').replace(/\D/g, ''), id2 = resolve_(ctx, d.item);
      if (!/^\d{4,14}$/.test(n2)) return { status: 'rejected', target: id2, message: 'Number "' + d.num + '" isn\'t 4 to 14 digits.' };
      if (!ctx.itemRow[id2]) return { status: 'rejected', target: id2, message: 'No item ' + id2 + ' in the sheet.' };
      if (!ctx.storeIds[store]) return { status: 'rejected', target: id2, message: 'No store "' + store + '" on the Stores tab.' };
      for (var key in ctx.offerRow) {
        var o = ctx.offerRow[key]; if (key.split('|')[1] !== store) continue;
        if (nums_(cell_(ctx.offers, o, 'numbers')).indexOf(n2) >= 0) {
          var owner = key.split('|')[0];
          if (owner === id2) return { status: 'applied', target: id2, message: n2 + ' was already on ' + id2 + ' at ' + store + '.' };
          return { status: 'conflict', target: id2, sheet: { item: owner }, message: 'Number ' + n2 + ' is on ' + (ctx.itemRow[owner] ? ctx.itemRow[owner].name : owner) + ' at ' + store + ' in the sheet. The sheet was kept.' };
        }
      }
      var cur2 = ctx.offerRow[id2 + '|' + store] ? nums_(cell_(ctx.offers, ctx.offerRow[id2 + '|' + store], 'numbers')) : [];
      cur2.push(n2); setOffer_(ctx, id2, store, { numbers: cur2.join('; ') });
      return { status: 'applied', target: id2, message: 'Added ' + store + ' number ' + n2 + ' to ' + id2 + '.' };
    }
    var n = String(d.num || '').replace(/\D/g, ''), id = resolve_(ctx, d.item), r = ctx.itemRow[id];
    if (!/^\d{4,8}$/.test(n)) return { status: 'rejected', target: id, message: 'Aldi number "' + d.num + '" isn\'t 4 to 8 digits.' };
    if (!r) return { status: 'rejected', target: id, message: 'No item ' + id + ' in the sheet.' };
    for (var k in ctx.itemRow) {
      var has = nums_(ctx.items.rows[ctx.itemRow[k]._row - 2][ctx.items.col.aldi_numbers]);
      if (has.indexOf(n) >= 0) {
        if (k === id) return { status: 'applied', target: id, message: n + ' was already on ' + id + '.' };
        return { status: 'conflict', target: id, sheet: { item: k }, message: 'Number ' + n + ' is on ' + ctx.itemRow[k].name + ' in the sheet. The sheet was kept.' };
      }
    }
    var cur = nums_(ctx.items.rows[r._row - 2][ctx.items.col.aldi_numbers]); cur.push(n);
    ctx.items.set(r._row, 'aldi_numbers', cur.join('; ')); stampRow_(ctx.items, r._row);
    return { status: 'applied', target: id, message: 'Added number ' + n + ' to ' + id + '.' };
  },

  // Receipt wording for an item. data = {text, item, store?}; item "__ignore" means "not food".
  'alias.add': function (ctx, d) {
    if (d.store) return aliasForStore_(ctx, d);
    var text = String(d.text || '').toUpperCase().replace(/\s+/g, ' ').trim(); if (!text) return { status: 'rejected', message: 'Empty receipt text.' };
    var item = d.item === '__ignore' || d.item === 'ignore' ? 'ignore' : resolve_(ctx, d.item);
    if (item !== 'ignore' && !ctx.itemRow[item]) return { status: 'rejected', target: item, message: 'No item ' + item + ' in the sheet.' };
    if (!ctx.aliases) return { status: 'error', message: 'No "Receipt aliases" sheet.' };
    var rows = ctx.aliases.objects();
    for (var i = 0; i < rows.length; i++) if (String(rows[i].receipt_text).toUpperCase().trim() === text) {
      if (String(rows[i].item_id) === item) return { status: 'applied', target: item, message: '"' + text + '" was already there.' };
      return { status: 'conflict', target: item, sheet: { item: String(rows[i].item_id) }, message: '"' + text + '" means ' + rows[i].item_id + ' in the sheet. The sheet was kept.' };
    }
    ctx.aliases.append({ receipt_text: text, item_id: item });
    return { status: 'applied', target: item, message: 'Added receipt name "' + text + '".' };
  },

  // A phone item later linked to a catalog item. data = {from:'u_…', to:'catalogId'}
  'item.merge': function (ctx, d) {
    var to = resolve_(ctx, d.to); if (!ctx.itemRow[to]) return { status: 'rejected', target: to, message: 'No item ' + to + ' in the sheet.' };
    var was = ctx.map[d.from];
    if (was && was !== to && ctx.itemRow[was]) {  // it had been added to the sheet on its own: retire that row
      ctx.items.set(ctx.itemRow[was]._row, 'retired', 'Y'); ctx.items.set(ctx.itemRow[was]._row, 'replaced_by', to); stampRow_(ctx.items, ctx.itemRow[was]._row);
    }
    addIdMap_(ctx, d.from, to, 'merge');
    return { status: 'applied', target: to, message: 'Linked ' + d.from + ' to ' + to + (was && was !== to ? '; ' + was + ' is now retired.' : '.') };
  },

  // Places an item in the tree. data = {item, node}. Not a conflict if the sheet's node was blank.
  'item.place': function (ctx, d) {
    var id = resolve_(ctx, d.item), node = resolve_(ctx, d.node), r = ctx.itemRow[id];
    if (!r) return { status: 'rejected', target: id, message: 'No item ' + id + ' in the sheet.' };
    if (!ctx.nodeRow[node]) return { status: 'rejected', target: id, message: 'No node ' + node + ' on the Nodes tab.' };
    if (ctx.items.col.node == null) return { status: 'error', target: id, message: 'Items has no "node" column. Run Meal Prep > Set up sheets and dropdowns.' };
    var now = str_(cell_(ctx.items, r, 'node'));
    if (now === node) return { status: 'applied', target: id, message: id + ' was already under ' + node + '.' };
    if (now) return { status: 'conflict', target: id, sheet: { node: now }, message: (r.name || id) + ' is under ' + now + ' in the sheet. The sheet was kept.' };
    ctx.items.set(r._row, 'node', node); stampRow_(ctx.items, r._row);
    return { status: 'applied', target: id, message: 'Placed ' + id + ' under ' + node + '.' };
  },

  // A new node. data = {id:'u_n_…', name, parent, level}; parent may be a phone id sent earlier in the batch.
  'node.add': function (ctx, d) {
    if (!d.id || !d.name) return { status: 'rejected', message: 'Node without an id or name.' };
    if (ctx.map[d.id]) { ctx.idMap[d.id] = resolve_(ctx, d.id); return { status: 'duplicate', target: ctx.idMap[d.id], message: 'Already on the Nodes tab as ' + ctx.idMap[d.id] + '.' }; }
    var level = +d.level, parent = d.parent ? resolve_(ctx, d.parent) : '';
    if (!(level >= 1 && level <= 5 && level === Math.round(level))) return { status: 'rejected', message: 'Level must be 1 to 5.' };
    if (parent && !ctx.nodeRow[parent]) return { status: 'rejected', message: 'Parent ' + parent + ' isn\'t on the Nodes tab.' };
    if (!parent && level !== 1) return { status: 'rejected', message: 'Only a level 1 node can have no parent.' };
    if (parent && +cell_(ctx.nodes, ctx.nodeRow[parent], 'level') >= level) return { status: 'rejected', message: 'The parent must have a lower level.' };
    for (var k in ctx.nodeRow) { var r = ctx.nodeRow[k];
      if (nname_(cell_(ctx.nodes, r, 'name')) === nname_(d.name) && str_(cell_(ctx.nodes, r, 'parent')) === parent) { addIdMap_(ctx, d.id, k, 'node'); return { status: 'applied', target: k, message: d.name + ' is already on the Nodes tab as ' + k + '. Linked to it.' }; } }
    var base = 'n_' + (String(d.id).replace(/^u_(n_)?/, '').replace(/[^a-z0-9_]/g, '') || slug_(d.name)); var id = newId_(base, ctx.nodeRow);
    var row = ctx.nodes.append({ id: id, name: d.name, parent: parent, level: level, last_changed: new Date(), changed_by: 'phone' });
    ctx.nodeRow[id] = { _row: row, id: id, name: d.name, parent: parent, level: level };
    addIdMap_(ctx, d.id, id, 'node');
    return { status: 'applied', target: id, message: 'Added ' + LEVELS[level].toLowerCase() + ' ' + d.name + ' as ' + id + '.' };
  },

  // The favorite product under a node. data = {node, item}; item null clears it. Last write wins.
  'favorite.set': function (ctx, d) {
    var node = resolve_(ctx, d.node); if (!ctx.nodeRow[node]) return { status: 'rejected', message: 'No node ' + node + ' on the Nodes tab.' };
    var item = d.item ? resolve_(ctx, d.item) : null; if (item && !ctx.itemRow[item]) return { status: 'rejected', target: item, message: 'No item ' + item + ' in the sheet.' };
    var t = ctx.favs, ri = -1; for (var i = 0; i < t.rows.length; i++) if (String(t.rows[i][t.col.node]) === node) { ri = i; break; }
    if (!item) { if (ri >= 0) { t.sheet.deleteRow(ri + 2); t.rows.splice(ri, 1); } return { status: 'applied', target: node, message: 'Cleared the favorite for ' + node + '.' }; }
    if (ri >= 0) { t.set(ri + 2, 'item', item); t.set(ri + 2, 'last_changed', new Date()); }
    else t.append({ node: node, item: item, last_changed: new Date() });
    return { status: 'applied', target: node, message: item + ' is the favorite for ' + node + '.' };
  },

  // A recipe written on the phone. data = the phone's recipe {id:'u_…', meal, name, tags, serv, ing:[[item, qtyPerServing, asWritten, optional]], total, hands, keeps, reheats, link, notes}
  'recipe.add': function (ctx, d) {
    if (!d.id || !d.name) return { status: 'rejected', message: 'Recipe without an id or name.' };
    if (ctx.map[d.id]) { ctx.idMap[d.id] = ctx.map[d.id]; return { status: 'duplicate', target: ctx.map[d.id], message: 'Already in the sheet as ' + ctx.map[d.id] + '.' }; }
    for (var k in ctx.recRow) if (nname_(ctx.recRow[k].name) === nname_(d.name)) { addIdMap_(ctx, d.id, k, 'recipe'); return { status: 'applied', target: k, message: d.name + ' is already in the sheet as ' + k + '. Linked to it.' }; }
    var bad = badIngredients_(ctx, d); if (bad) return { status: 'rejected', message: bad };
    var base = (String(d.meal || 'x')[0]) + '_' + (String(d.id).replace(/^u_/, '').replace(/[^a-z0-9_]/g, '') || slug_(d.name));
    var id = newId_(base, ctx.recRow);
    writeRecipe_(ctx, id, d, { source: 'My recipe', notes: d.notes || 'Written on the phone' }, null);
    addIdMap_(ctx, d.id, id, 'recipe');
    return { status: 'applied', target: id, message: 'Added recipe ' + d.name + ' as ' + id + '.' };
  },

  // The phone changed a recipe that is already in the sheet (its own recipe, or its "my version").
  // data = the full recipe with its sheet id; base = {changed: the last_changed the phone saw}
  'recipe.update': function (ctx, d, base) {
    var id = resolve_(ctx, d.id), r = ctx.recRow[id]; if (!r) return { status: 'rejected', target: id, message: 'No recipe ' + id + ' in the sheet.' };
    if (sheetEditedSince_(ctx.recipes, r, base.changed)) return { status: 'conflict', target: id, message: r.name + ' was changed in the sheet. The sheet\'s version was kept.' };
    var bad = badIngredients_(ctx, d); if (bad) return { status: 'rejected', target: id, message: bad };
    writeRecipe_(ctx, id, d, null, r);
    return { status: 'applied', target: id, message: 'Updated recipe ' + id + '.' };
  },

  // "My version" of a catalog recipe. data = {orig:'d_tacos', recipe:{…}}, base = {changed} for an existing _mine row.
  // Saved as a second recipe ORIGID_mine; the original is never touched.
  'recipe.edit': function (ctx, d, base) {
    var orig = String(d.orig || ''), rec = d.recipe || {}; if (!orig || !rec.name) return { status: 'rejected', message: 'Edit without the original recipe or a name.' };
    var id = orig + '_mine', name = String(rec.name).replace(/ \(my version\)$/, '') + ' (my version)';
    var bad = badIngredients_(ctx, rec); if (bad) return { status: 'rejected', target: id, message: bad };
    var r = ctx.recRow[id];
    if (r) {
      if (sheetEditedSince_(ctx.recipes, r, base.changed)) { ctx.idMap['edit:' + orig] = id; return { status: 'conflict', target: id, message: name + ' was changed in the sheet. The sheet\'s version was kept.' }; }
      writeRecipe_(ctx, id, merge_(rec, { name: name }), null, r);
    } else {
      writeRecipe_(ctx, id, merge_(rec, { name: name }), { source: 'My version', notes: 'My version of ' + orig + (rec.notes ? '. ' + rec.notes : '') }, null);
    }
    if (ctx.map['edit:' + orig] !== id) addIdMap_(ctx, 'edit:' + orig, id, 'edit'); else ctx.idMap['edit:' + orig] = id;
    return { status: 'applied', target: id, message: 'Saved ' + name + ' as ' + id + '.' };
  }
};

// price.set / offer.set for a store's offer on the Offers tab.
function offerPrice_(ctx, d, base, store, full) {
  var id = resolve_(ctx, d.item), r = ctx.itemRow[id]; if (!r) return { status: 'rejected', target: id, message: 'No item ' + id + ' in the sheet.' };
  if (!ctx.storeIds[store]) return { status: 'rejected', target: id, message: 'No store "' + store + '" on the Stores tab.' };
  if (!(+d.price > 0)) return { status: 'rejected', target: id, message: 'Price must be more than 0.' };
  var o = ctx.offerRow[id + '|' + store], name = (r.name || id) + (store === 'aldi' ? '' : ' at ' + (ctx.storeName[store] || store));
  var nowPrice = o ? cell_(ctx.offers, o, 'price') : null, nowDate = o ? dateStr_(cell_(ctx.offers, o, 'price_date')) : null;
  if (o && !blank_(nowPrice) && base && 'price' in base && !sameVal_(nowPrice, base.price))
    return { status: 'conflict', target: id, sheet: { price: +nowPrice, priceDate: nowDate, store: store }, message: name + ': the sheet\'s price $' + (+nowPrice).toFixed(2) + ' was kept.' };
  if (nowDate && d.date && d.date < nowDate)
    return { status: 'conflict', target: id, sheet: { price: +nowPrice, priceDate: nowDate, store: store }, message: name + ': the sheet has a newer price ($' + (+nowPrice).toFixed(2) + ' on ' + nowDate + ').' };
  var f = { price: +d.price, price_date: dateVal_(d.date), price_source: d.via === 'receipt' ? 'receipt' : 'edited' };
  if (full) { if (d.pack != null) f.pack = d.pack; if (d.unit != null) f.unit = d.unit; if (d.pkg != null) f.pkg = +d.pkg; }
  setOffer_(ctx, id, store, f);
  if (store === 'aldi') mirrorAldi_(ctx, id);
  return { status: 'applied', target: id, message: name + ' now $' + (+d.price).toFixed(2) + '.' };
}

function aliasForStore_(ctx, d) {
  var store = storeOf_(d), text = String(d.text || '').toUpperCase().replace(/\s+/g, ' ').trim(); if (!text) return { status: 'rejected', message: 'Empty receipt text.' };
  var item = d.item === '__ignore' || d.item === 'ignore' ? 'ignore' : resolve_(ctx, d.item);
  if (item !== 'ignore' && !ctx.itemRow[item]) return { status: 'rejected', target: item, message: 'No item ' + item + ' in the sheet.' };
  if (!ctx.aliases) return { status: 'error', message: 'No "Receipt aliases" sheet.' };
  var rows = ctx.aliases.objects(), any = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].receipt_text).toUpperCase().trim() !== text) continue;
    var rs = str_(rows[i].store).toLowerCase();
    if (rs === store) {
      if (String(rows[i].item_id) === item) return { status: 'applied', target: item, message: '"' + text + '" was already there for ' + store + '.' };
      return { status: 'conflict', target: item, sheet: { item: String(rows[i].item_id) }, message: '"' + text + '" means ' + rows[i].item_id + ' at ' + store + ' in the sheet. The sheet was kept.' };
    }
    if (!rs) any = rows[i];
  }
  if (any && String(any.item_id) === item) return { status: 'applied', target: item, message: '"' + text + '" was already there for every store.' };
  ctx.aliases.append({ receipt_text: text, item_id: item, store: store });
  return { status: 'applied', target: item, message: 'Added receipt name "' + text + '" for ' + store + '.' };
}

var ITEM_FIELDS6 = { name: 'name', brand: 'brand', pack: 'package_label', unit: 'unit', pkg: 'package_qty', cat: 'category', node: 'node' };
function itemUpdate6_(ctx, d, base) {
  var id = resolve_(ctx, d.id), r = ctx.itemRow[id]; if (!r) return { status: 'rejected', target: id, message: 'No item ' + id + ' in the sheet.' };
  if (sheetEditedSince_(ctx.items, r, base && base.changed)) return { status: 'conflict', target: id, message: (r.name || id) + ' was changed in the sheet. The sheet\'s version was kept.' };
  var f = d.fields || {}, done = [];
  for (var k in f) {
    var h = ITEM_FIELDS6[k]; if (!h || ctx.items.col[h] == null) continue;
    var v = f[k]; if (k === 'node') { v = v ? resolve_(ctx, v) : ''; if (v && !ctx.nodeRow[v]) return { status: 'rejected', target: id, message: 'No node ' + v + ' on the Nodes tab.' }; }
    if (k === 'pkg') v = +v;
    ctx.items.set(r._row, h, v); done.push(k);
  }
  if (done.length) stampRow_(ctx.items, r._row);
  return { status: 'applied', target: id, message: 'Updated ' + (done.join(', ') || 'nothing') + ' on ' + id + '.' };
}

function merge_(a, b) { var o = {}; for (var k in a) o[k] = a[k]; for (var j in b) o[j] = b[j]; return o; }

function sheetEditedSince_(t, r, seenIso) {
  if (String(r.changed_by || '') !== 'sheet' || !r.last_changed) return false;
  var lc = new Date(r.last_changed); if (isNaN(lc)) return false;
  return !seenIso || lc.getTime() > new Date(seenIso).getTime() + 1000;
}

function badIngredients_(ctx, d) {
  var missing = (d.ing || []).map(function (x) { return resolve_(ctx, x[0]); }).filter(function (id) { return !ctx.itemRow[id]; });
  return missing.length ? (d.name || 'Recipe') + ' uses items the sheet doesn\'t have: ' + missing.join(', ') + '. Send those items first.' : null;
}

// Writes a Recipes row and replaces its Ingredients rows. extra = {source, notes} for a new row; existing = the row being replaced.
function writeRecipe_(ctx, id, d, extra, existing) {
  var serv = +d.serv || 1;
  var fields = {
    recipe_id: id, meal: d.meal || 'dinner', name: d.name, tags: (d.tags || []).join(', '), servings: serv, total_min: d.total == null ? '' : d.total,
    hands_on_min: d.hands == null ? '' : d.hands, keeps_days: d.keeps == null ? '' : d.keeps, reheats: d.reheats === false ? 'N' : 'Y',
    freezes: d.freezes == null ? '' : (d.freezes ? 'Y' : 'N'), link: d.link || '', active: 'Y', last_changed: new Date(), changed_by: 'phone'
  };
  if (existing) {
    for (var h in fields) if (h !== 'recipe_id' && ctx.recipes.col[h] != null) ctx.recipes.set(existing._row, h, fields[h]);
    if (d.notes != null && ctx.recipes.col.notes != null) ctx.recipes.set(existing._row, 'notes', d.notes);
  } else {
    fields.source = extra.source; fields.notes = extra.notes;
    var row = ctx.recipes.append(fields); ctx.recRow[id] = { _row: row, recipe_id: id, name: d.name };
  }
  // Ingredients: remove this recipe's rows (bottom up), then add the new ones with whole-recipe qty.
  var t = ctx.ingredients, ridCol = t.col.recipe_id;
  for (var i = t.rows.length - 1; i >= 0; i--) if (String(t.rows[i][ridCol]) === id) { t.sheet.deleteRow(i + 2); t.rows.splice(i, 1); }
  (d.ing || []).forEach(function (x) {
    t.append({ recipe_id: id, item_id: resolve_(ctx, x[0]), qty: r3_(x[1] * serv), as_written: x[2] || '', optional: x[3] ? 'Y' : 'N' });
  });
}

// ---------------------------------------------------------------- stamping edits made in the sheet

/** Runs by itself whenever you edit a cell. Marks the row as changed in the sheet. */
function onEdit(e) {
  try {
    var sh = e.range.getSheet(), name = sh.getName(), key = norm_(name), r0 = e.range.getRow(), n = e.range.getNumRows();
    if ([SHEETS.items, SHEETS.recipes, SHEETS.ingredients, SHEETS.offers, SHEETS.nodes, SHEETS.favorites].map(norm_).indexOf(key) < 0) return;
    var lastCol = sh.getLastColumn(), headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(norm_);
    if (key === norm_(SHEETS.ingredients)) {  // an ingredient change counts as a change to its recipe
      var rc = headers.indexOf('recipe_id'); if (rc < 0) return;
      var ids = sh.getRange(Math.max(2, r0), rc + 1, n).getValues().map(function (v) { return String(v[0]); });
      var rec = sheet_(SHEETS.recipes); if (!rec) return; var rh = rec.getRange(1, 1, 1, rec.getLastColumn()).getValues()[0].map(norm_);
      var lc = rh.indexOf('last_changed'), cb = rh.indexOf('changed_by'), idc = rh.indexOf('recipe_id'); if (lc < 0 || idc < 0) return;
      var all = rec.getRange(2, idc + 1, Math.max(1, rec.getLastRow() - 1)).getValues();
      all.forEach(function (v, i) { if (ids.indexOf(String(v[0])) >= 0) { rec.getRange(i + 2, lc + 1).setValue(new Date()); if (cb >= 0) rec.getRange(i + 2, cb + 1).setValue('sheet'); } });
      return;
    }
    var lcol = headers.indexOf('last_changed'), ccol = headers.indexOf('changed_by'); if (lcol < 0) return;
    var c0 = e.range.getColumn(), c1 = c0 + e.range.getNumColumns() - 1;
    if (c0 >= lcol + 1 && c1 <= Math.max(lcol, ccol) + 1) return;   // editing the stamp columns themselves
    for (var r = Math.max(2, r0); r < r0 + n; r++) {
      sh.getRange(r, lcol + 1).setValue(new Date());
      if (ccol >= 0) sh.getRange(r, ccol + 1).setValue('sheet');
    }
    // After the move to Offers, a price typed on Items goes to the item's Aldi offer, so both stay in step.
    if (key === norm_(SHEETS.items) && migrated_()) {
      var pc = ['price', 'price_date', 'price_source'].map(function (h) { return headers.indexOf(h); });
      if (pc.some(function (c) { return c >= 0 && c + 1 >= c0 && c + 1 <= c1; })) syncAldiFromItems_(sh, headers, Math.max(2, r0), r0 + n - 1);
    }
  } catch (err) { /* never block an edit */ }
}

function syncAldiFromItems_(sh, headers, fromRow, toRow) {
  var t = table_(SHEETS.offers); if (!t) return;
  var at = {}; t.objects().forEach(function (o) { if (String(o.store).toLowerCase() === 'aldi') at[String(o.item)] = o; });
  var vals = sh.getRange(fromRow, 1, toRow - fromRow + 1, headers.length).getValues();
  vals.forEach(function (v) {
    var id = String(v[headers.indexOf('item_id')] || ''); if (!id) return;
    var f = { price: v[headers.indexOf('price')], price_date: v[headers.indexOf('price_date')], price_source: headers.indexOf('price_source') >= 0 ? v[headers.indexOf('price_source')] : '' };
    var o = at[id];
    if (o) { ['price', 'price_date', 'price_source'].forEach(function (h) { if (t.col[h] != null) t.set(o._row, h, f[h]); }); t.set(o._row, 'last_changed', new Date()); if (t.col.changed_by != null) t.set(o._row, 'changed_by', 'sheet'); }
    else if (!blank_(f.price)) t.append({ item: id, store: 'aldi', price: f.price, pack: v[headers.indexOf('package_label')], unit: v[headers.indexOf('unit')], pkg: v[headers.indexOf('package_qty')], numbers: '', price_date: f.price_date, price_source: f.price_source, last_changed: new Date(), changed_by: 'sheet' });
  });
}

// ---------------------------------------------------------------- the Meal Prep menu

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Meal Prep')
    .addItem('Check data', 'menuCheck')
    .addItem('Set up sheets and dropdowns', 'menuSetup')
    .addItem('Move prices to Offers', 'menuMoveToOffers')
    .addSeparator()
    .addItem('Set the app key', 'menuSetKey')
    .addItem('Show the app address and key', 'menuShowAddress')
    .addToUi();
}

/** Meal Prep > Check data: lists every problem in a "Data check" sheet. */
function menuCheck() {
  var ui = SpreadsheetApp.getUi(), good = readGood_(), b = buildCatalog_(good && good.catalog);
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName('Data check') || ss.insertSheet('Data check');
  sh.clear();
  var rows = [['kind', 'problem']].concat(b.errors.map(function (m) { return ['Error', m]; }), b.warnings.map(function (m) { return ['Warning', m]; }));
  sh.getRange(1, 1, rows.length, 2).setValues(rows); sh.setFrozenRows(1); sh.setColumnWidth(2, 900); sh.getRange(1, 1, 1, 2).setFontWeight('bold');
  if (!b.errors.length) currentCatalog_();
  ui.alert(b.errors.length ? b.errors.length + ' error(s) and ' + b.warnings.length + ' warning(s). The app keeps using the last good catalog until the errors are fixed. See the "Data check" sheet.'
    : 'No errors. ' + b.warnings.length + ' warning(s) are listed in the "Data check" sheet. ' + (b.catalog ? b.catalog.items.length + ' items, ' + b.catalog.recipes.length + ' active recipes.' : ''));
}

/** Meal Prep > Set the app key: stores the secret key the app must send. Leave blank to make one up. */
function menuSetKey() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('App key', 'Type a key, or leave this blank and press OK to create a random one. You will type the same key into the app.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var key = r.getResponseText().trim() || Utilities.getUuid().replace(/-/g, '').slice(0, 24);
  if (key.length < 12) { ui.alert('Use at least 12 characters.'); return; }
  PropertiesService.getScriptProperties().setProperty('APP_KEY', key);
  ui.alert('Key saved:\n\n' + key + '\n\nType it into the app under Settings > Google Sheet. Anyone with this key and the app address can read and change your catalog, so keep it private.');
}

function menuShowAddress() {
  var url = ScriptApp.getService().getUrl(), key = PropertiesService.getScriptProperties().getProperty('APP_KEY');
  SpreadsheetApp.getUi().alert('App address:\n' + (url || 'Not deployed yet. Use Deploy > New deployment first.') + '\n\nKey:\n' + (key || 'Not set yet. Use Meal Prep > Set the app key.'));
}

/** Meal Prep > Set up sheets and dropdowns. Safe to run again at any time. */
function menuSetup() {
  var ss = SpreadsheetApp.getActive(), notes = [];
  ensureSheet_(SHEETS.log, LOG_HEADERS); ensureSheet_(SHEETS.idmap, IDMAP_HEADERS); cacheSheet_();
  [SHEETS.log, SHEETS.idmap].forEach(function (n) {
    var sh = sheet_(n); if (!sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) sh.protect().setWarningOnly(true).setDescription('Written by the Meal Prep script');
  });
  [SHEETS.items, SHEETS.recipes].forEach(function (n) { ensureColumns_(n, ['last_changed', 'changed_by'], notes); });
  ensureColumns_(SHEETS.items, ['aldi_numbers'], notes);
  ensureListColumn_('price_source', ['photo', 'inventory', 'estimate', 'receipt', 'edited', 'phone']);
  // Version 6: stores, offers, the item tree and favorites
  ensureColumns_(SHEETS.items, ['brand', 'node'], notes); ensureColumns_(SHEETS.aliases, ['store'], notes);
  if (!sheet_(SHEETS.stores)) { ensureStores_(); notes.push('Added the Stores tab with Aldi, Sam\'s Club, Walmart, Cub and Target.'); }
  if (!sheet_(SHEETS.offers)) { ensureSheet_(SHEETS.offers, OFFER_HEADERS); notes.push('Added the Offers tab. Use Meal Prep > Move prices to Offers to fill it.'); }
  if (!sheet_(SHEETS.favorites)) { ensureSheet_(SHEETS.favorites, FAVORITE_HEADERS); notes.push('Added the Favorites tab.'); }
  if (!sheet_(SHEETS.nodes)) { var nn = seedNodes_(); notes.push('Added the Nodes tab with ' + nn + ' starter nodes.'); }
  var off = colRange_(SHEETS.offers, 'numbers'); if (off) off.setNumberFormat('@');

  // Each rule: [sheet, column, kind, source, help]. kind "list" = dropdown from a range ([sheet, column] of the source).
  // A rule whose column or source can't be found is skipped and named in the message, instead of stopping the setup.
  var IT = SHEETS.items, RE = SHEETS.recipes, IN = SHEETS.ingredients, CA = SHEETS.categories, AL = SHEETS.aliases, LI = SHEETS.lists;
  var YN = [LI, 'yes_no'];
  var specs = [
    [IT, 'category', 'list', [CA, 'category'], 'Pick a category from the Categories sheet.'],
    [IT, 'price_source', 'list', [LI, 'price_source']], [IT, 'staple', 'list', YN], [IT, 'retired', 'list', YN],
    [IT, 'storage', 'list', [LI, 'storage']], [IT, 'sold_by', 'list', [LI, 'sold_by']], [IT, 'tracking_default', 'list', [LI, 'tracking']],
    [IT, 'replaced_by', 'list', [IT, 'item_id']], [IT, 'changed_by', 'values', ['sheet', 'phone']],
    [IT, 'price', 'gte', 0, 'Price must be 0 or more.'], [IT, 'package_qty', 'gt', 0, 'Package amount must be more than 0.'],
    [IT, 'fridge_days', 'gte', 0], [IT, 'freezer_days', 'gte', 0], [IT, 'pantry_days', 'gte', 0],
    [IT, 'price_date', 'date', null, 'Use a date such as 2026-10-03.'],
    [IT, 'item_id', 'formula', function (c, all) { return '=AND(COUNTIF(' + all + ',' + c + ')=1,REGEXMATCH(' + c + ',"^[a-z0-9_]+$"))'; }, 'item_id must be unique and use only lowercase letters, numbers and _.'],
    [IT, 'aldi_numbers', 'formula', function (c) { return '=OR(' + c + '="",REGEXMATCH(TO_TEXT(' + c + '),"^\\d{4,8}(;\\s*\\d{4,8})*$"))'; }, 'Aldi numbers are 4 to 8 digits. Separate several with semicolons, e.g. 382147; 382148'],
    [CA, 'storage', 'list', [LI, 'storage']], [CA, 'tracking_default', 'list', [LI, 'tracking']], [CA, 'staple_default', 'list', YN],
    [RE, 'meal', 'list', [LI, 'meal']], [RE, 'reheats', 'list', YN], [RE, 'freezes', 'list', YN], [RE, 'active', 'list', YN],
    [RE, 'servings', 'gt', 0], [RE, 'total_min', 'gte', 0], [RE, 'hands_on_min', 'gte', 0], [RE, 'keeps_days', 'gte', 0],
    [RE, 'recipe_id', 'formula', function (c, all) { return '=COUNTIF(' + all + ',' + c + ')=1'; }, 'recipe_id must be unique.'],
    [IN, 'recipe_id', 'list', [RE, 'recipe_id']], [IN, 'item_id', 'list', [IT, 'item_id']], [IN, 'optional', 'list', YN], [IN, 'qty', 'gt', 0],
    [AL, 'item_id', 'list', [IT, 'item_id'], 'An item_id, or ignore for lines that are not food.'],
    [AL, 'store', 'list', [SHEETS.stores, 'id'], 'Blank means any store.'],
    [IT, 'node', 'list', [SHEETS.nodes, 'id'], 'The most specific node this item belongs under.'],
    [SHEETS.offers, 'item', 'list', [IT, 'item_id']], [SHEETS.offers, 'store', 'list', [SHEETS.stores, 'id']],
    [SHEETS.offers, 'price', 'gte', 0], [SHEETS.offers, 'pkg', 'gt', 0], [SHEETS.offers, 'price_date', 'date', null],
    [SHEETS.offers, 'price_source', 'list', [LI, 'price_source']],
    [SHEETS.offers, 'numbers', 'formula', function (c) { return '=OR(' + c + '="",REGEXMATCH(TO_TEXT(' + c + '),"^\\d{4,14}(;\\s*\\d{4,14})*$"))'; }, 'Digits only (4 to 14). Separate several with semicolons.'],
    [SHEETS.nodes, 'parent', 'list', [SHEETS.nodes, 'id'], 'Blank for a level 1 node.'],
    [SHEETS.nodes, 'level', 'values', ['1', '2', '3', '4', '5'], '1 Category, 2 Type, 3 Form, 4 Variety, 5 Style'],
    [SHEETS.nodes, 'id', 'formula', function (c, all) { return '=AND(COUNTIF(' + all + ',' + c + ')=1,REGEXMATCH(' + c + ',"^n_[a-z0-9_]+$"))'; }, 'Starts with n_; lowercase letters, numbers and _; unique.'],
    [SHEETS.favorites, 'node', 'list', [SHEETS.nodes, 'id']], [SHEETS.favorites, 'item', 'list', [IT, 'item_id']],
    [SHEETS.stores, 'num_where', 'values', ['before', 'after']]
  ];
  var n = 0, skipped = [];
  specs.forEach(function (x) {
    var target = colRange_(x[0], x[1]);
    if (!target) { skipped.push(x[0] + ' > ' + x[1] + ' (no such sheet or column)'); return; }
    var b = SpreadsheetApp.newDataValidation().setAllowInvalid(x[0] === AL);
    if (x[2] === 'list') {
      var src = colRange_(x[3][0], x[3][1]);
      if (!src) { skipped.push(x[0] + ' > ' + x[1] + ' (its list ' + x[3][0] + ' > ' + x[3][1] + ' is missing)'); return; }
      b.requireValueInRange(src, true);
    } else if (x[2] === 'values') b.requireValueInList(x[3], true);
    else if (x[2] === 'gte') b.requireNumberGreaterThanOrEqualTo(x[3]);
    else if (x[2] === 'gt') b.requireNumberGreaterThan(x[3]);
    else if (x[2] === 'date') b.requireDate();
    else if (x[2] === 'formula') { var letter = target.getA1Notation().replace(/\d+.*$/, ''); b.requireFormulaSatisfied(x[3](letter + '2', '$' + letter + '$2:$' + letter)); }
    if (x[4]) b.setHelpText(x[4]);
    try { target.setDataValidation(b.build()); n++; } catch (err) { skipped.push(x[0] + ' > ' + x[1] + ' (' + err.message + ')'); }
  });
  var aldi = colRange_(SHEETS.items, 'aldi_numbers'); if (aldi) aldi.setNumberFormat('@');
  SpreadsheetApp.getUi().alert('Set up ' + n + ' dropdowns and checks.' + (notes.length ? '\n\n' + notes.join('\n') : '') +
    (skipped.length ? '\n\nSkipped ' + skipped.length + ' (check the header names in row 1):\n' + skipped.join('\n') : '') +
    '\n\nRecipes > tags is left for you: select the tags column, Data > Data validation > Add rule > Dropdown (from a range) =Lists!D2:D, and tick "Allow multiple selections".');
}

/**
 * Meal Prep > Move prices to Offers. For every Items row with a price, adds an Offers row for Aldi and
 * moves aldi_numbers into it. Safe to run again: items that already have an Aldi offer are skipped.
 */
function menuMoveToOffers() {
  var ui = SpreadsheetApp.getUi(), lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { ui.alert('The sheet is busy. Try again in a minute.'); return; }
  try {
    ensureSheet_(SHEETS.offers, OFFER_HEADERS); ensureStores_();
    var tI = table_(SHEETS.items), tO = table_(SHEETS.offers), have = {}, added = 0, skipped = 0, nums = 0;
    tO.objects().forEach(function (r) { if (r.item) have[String(r.item) + '|' + String(r.store).toLowerCase()] = 1; });
    var rows = [];
    tI.objects().forEach(function (r) {
      var id = str_(r.item_id); if (!id || num_(r.price) == null) return;
      if (have[id + '|aldi']) { skipped++; return; }
      var n = nums_(r.aldi_numbers); nums += n.length;
      rows.push(OFFER_HEADERS.map(function (h) {
        return ({ item: id, store: 'aldi', price: num_(r.price), pack: str_(r.package_label), unit: str_(r.unit), pkg: num_(r.package_qty), numbers: n.join('; '),
                  price_date: r.price_date || '', price_source: str_(r.price_source), last_changed: new Date(), changed_by: 'sheet' })[h];
      }));
      if (n.length && tI.col.aldi_numbers != null) tI.set(r._row, 'aldi_numbers', '');
      added++;
    });
    if (rows.length) {
      var sh = sheet_(SHEETS.offers), start = sh.getLastRow() + 1;
      sh.getRange(start, 1, rows.length, OFFER_HEADERS.length).setValues(rows);
      sh.getRange(2, OFFER_HEADERS.indexOf('numbers') + 1, Math.max(1, sh.getMaxRows() - 1)).setNumberFormat('@');
    }
    PropertiesService.getScriptProperties().setProperty('OFFERS_MIGRATED', 'yes');
    ui.alert('Added ' + added + ' Aldi offers' + (nums ? ' and moved ' + nums + ' Aldi numbers into them' : '') + '.' + (skipped ? ' ' + skipped + ' items already had one.' : '') +
      '\n\nPrices now live on the Offers tab. A price you type on Items is copied to that item\'s Aldi offer, and an Aldi price from the phone is copied back to Items.');
  } finally { lock.releaseLock(); }
}

// Level 1 from the categories, plus a starter level 2-3 for Meat, Produce and Dairy.
function seedNodes_() {
  var sh = ensureSheet_(SHEETS.nodes, NODE_HEADERS), tC = table_(SHEETS.categories), rows = [], now = new Date();
  var idOf = function (name) { return 'n_' + slug_(name.replace(/&/g, ' ')); };
  var cats = tC ? tC.objects().map(function (r) { return str_(r.category); }).filter(String) : ['Produce', 'Meat', 'Dairy & eggs', 'Bakery & frozen', 'Pantry', 'Drinks', 'Other'];
  cats.forEach(function (c) { rows.push([idOf(c), c, '', 1, now, 'sheet']); });
  var find = function (word) { var c = cats.filter(function (x) { return x.toLowerCase().indexOf(word) >= 0; })[0]; return c ? idOf(c) : null; };
  var tree = [
    [find('meat'), [['Chicken', ['Breasts', 'Thighs', 'Wings', 'Ground chicken']], ['Beef', ['Ground beef', 'Steak', 'Stew meat']], ['Pork', ['Chops', 'Sausage', 'Bacon']]]],
    [find('produce'), [['Fruit', ['Apples', 'Berries', 'Citrus', 'Bananas']], ['Vegetables', ['Leafy greens', 'Onions and garlic', 'Potatoes', 'Peppers', 'Tomatoes']]]],
    [find('dairy'), [['Milk', ['Whole milk', 'Dairy-free milk']], ['Cheese', ['Shredded cheese', 'Sliced cheese', 'Block cheese']], ['Yogurt', ['Plain yogurt', 'Greek yogurt']]]]
  ];
  tree.forEach(function (t) {
    if (!t[0]) return;
    t[1].forEach(function (type) {
      var tid = 'n_' + slug_(type[0]); rows.push([tid, type[0], t[0], 2, now, 'sheet']);
      type[1].forEach(function (form) { rows.push(['n_' + slug_(type[0] + ' ' + form.replace(new RegExp('\\b' + type[0].replace(/s$/, '') + '\\b', 'i'), '').trim()), form, tid, 3, now, 'sheet']); });
    });
  });
  var seen = {}; rows = rows.filter(function (r) { if (seen[r[0]]) return false; seen[r[0]] = 1; return true; });
  sh.getRange(2, 1, rows.length, NODE_HEADERS.length).setValues(rows);
  return rows.length;
}

function ensureSheet_(name, headers) {
  var ss = SpreadsheetApp.getActive(), sh = sheet_(name);
  if (!sh) { sh = ss.insertSheet(name); sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold'); sh.setFrozenRows(1); }
  return sh;
}
function ensureColumns_(sheetName, headers, notes) {
  var sh = sheet_(sheetName); if (!sh) return;
  var have = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(norm_);
  headers.forEach(function (h) {
    if (have.indexOf(h) >= 0) return;
    var c = sh.getLastColumn() + 1; sh.getRange(1, c).setValue(h).setFontWeight('bold'); have.push(h);
    if (h === 'last_changed') sh.getRange(2, c, Math.max(1, sh.getMaxRows() - 1)).setNumberFormat('yyyy-mm-dd hh:mm');
    notes.push('Added column ' + h + ' to ' + sheetName + '.');
  });
}
function ensureListColumn_(header, values) {
  var sh = sheet_(SHEETS.lists); if (!sh) return;
  var have = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(norm_); if (have.indexOf(header) >= 0) return;
  var c = sh.getLastColumn() + 1; sh.getRange(1, c, values.length + 1).setValues([[header]].concat(values.map(function (v) { return [v]; })));
}
// The data cells (row 2 down) of a column, found by header. null if the sheet or column is missing.
function colRange_(sheetName, header) {
  var sh = sheet_(sheetName); if (!sh) return null;
  var c = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(norm_).indexOf(header); if (c < 0) return null;
  return sh.getRange(2, c + 1, Math.max(1, sh.getMaxRows() - 1));
}
function listRange_(header) { return colRange_(SHEETS.lists, header); }

// ---------------------------------------------------------------- for testing from the editor

/** Run this from the editor (select testBuild, then Run) to see counts and problems in the log. */
function testBuild() {
  var b = buildCatalog_(null);
  Logger.log('Errors: ' + b.errors.length + '\n' + b.errors.slice(0, 20).join('\n'));
  Logger.log('Warnings: ' + b.warnings.length + '\n' + b.warnings.slice(0, 20).join('\n'));
  if (b.catalog) Logger.log(b.catalog.items.length + ' items, ' + b.catalog.recipes.length + ' active recipes, ' + b.catalog.categories.length + ' categories, ' + b.catalog.aliases.length + ' aliases.');
}
