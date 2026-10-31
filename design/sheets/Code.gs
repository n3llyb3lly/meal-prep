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
 *  - A "Meal Prep" menu in the spreadsheet: check the data, set up sheets and dropdowns, fetch recipe photos and steps
 *    (which also guesses each recipe's kind), suggest side pairings, mark cooking basics as staples, set the app key, and show the app address.
 *  - Drive backups (6.6): the app saves its data to a "Meal Prep backups" folder in your Google Drive.
 *  - Possible ingredients (script version 7): items a recipe needs that Aldi doesn't sell. Items > possible = Y,
 *    price left blank, and where = the store you noted on the phone. A real price for one clears possible.
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
  offers: 'Offers', nodes: 'Nodes', stores: 'Stores', favorites: 'Favorites', variants: 'Variants', learned: 'Learned',
  pairings: 'Pairings', suggested: 'Suggested pairings', pairLists: '_pairing_lists'
};
var MEALS = ['breakfast', 'lunch', 'snack', 'dinner'];
var STORAGE = ['fridge', 'freezer', 'pantry', 'counter'];
var TRACKING = ['quantity', 'staple', 'stocked'];
var SOLD_BY = ['pack', 'weight'];
var SCHEMA = 2;                 // newest catalog format; ?schema=1 (the default) serves the version 5.3 shape
// The script's own version, sent in every reply as "script". The app sends possible ingredients (item.add with
// possible, item.where) only to a script that reports 7 or more. Scripts before 7 send no number.
var SCRIPT_VERSION = 7;
// Version 7: possible ingredients. Added after the existing Items columns; nothing is reordered.
var POSSIBLE_COLS = ['possible', 'where'];
var LEVELS = { 1: 'Category', 2: 'Type', 3: 'Form', 4: 'Variety', 5: 'Style' };
var OFFER_HEADERS = ['item', 'store', 'price', 'pack', 'unit', 'pkg', 'numbers', 'price_date', 'price_source', 'last_changed', 'changed_by'];
var NODE_HEADERS = ['id', 'name', 'parent', 'level', 'last_changed', 'changed_by'];
var STORE_HEADERS = ['id', 'name', 'num_digits', 'num_where'];
var FAVORITE_HEADERS = ['node', 'item', 'last_changed'];
// Version 6.3: brands and flavors of one item (three ice creams under "Ice cream"). One row per variant and store;
// numbers are that store's item numbers for the variant. A variant with no numbers yet has a row with a blank store.
var VARIANT_HEADERS = ['item_id', 'variant_id', 'brand', 'flavor', 'store', 'numbers', 'last_price', 'last_date', 'last_changed', 'changed_by'];
// Learning step 4: what phones learned from receipts. One row per kind, key and value; count adds up across phones.
// Only these kinds are accepted. Never prices, dates or quantities.
var LEARNED_HEADERS = ['kind', 'key', 'value', 'count', 'last_seen'];
var LEARN_KINDS = ['word', 'name', 'brand', 'group', 'number'];
var LEARN_MAX = 50;             // records in one learn.batch change
var DEFAULT_STORES = [['aldi', 'Aldi', '6', 'before'], ['sams', "Sam's Club", '9;10', 'before'], ['walmart', 'Walmart', '12', 'after'], ['cub', 'Cub', '11;12', 'after'], ['target', 'Target', '9', 'before']];
// Prices live in the Offers tab once "Meal Prep > Move prices to Offers" has run. Before that, the Items
// price columns are the Aldi offer.
function migrated_() { return PropertiesService.getScriptProperties().getProperty('OFFERS_MIGRATED') === 'yes'; }
var MAX_BATCH = 100;            // changes accepted in one request
var LOG_HEADERS = ['received_at', 'change_id', 'type', 'target_id', 'result', 'message', 'data'];
var IDMAP_HEADERS = ['phone_id', 'sheet_id', 'kind', 'created_at'];
// Version 6.1: what a food contains (Items > food_types, several separated by ; or ,) and household items
// (Items > group plus the columns below). Same names as tools/house-core.js in the app.
var FOOD_TYPES = ['pork', 'beef', 'poultry', 'fish', 'shellfish', 'dairy', 'egg', 'gluten', 'peanut', 'tree_nut', 'soy', 'sesame'];
var HOUSE_GROUPS = ['kitchen', 'paper', 'cleaning', 'personal'];
var HOUSE_COLS = ['food_types', 'group', 'unit_label', 'units_per_package', 'typical_days', 'scales_with_people'];
// The app's starter household items: [group, name, unit, units per package, typical days per unit, price, scales with people]
var STARTER_HOUSE = [
  ['kitchen', 'Kitchen trash bags', 'bag', 40, 4, 5.49], ['kitchen', 'Large trash bags', 'bag', 20, 10, 6.99], ['kitchen', 'Parchment paper', 'roll', 1, 45, 3.49],
  ['kitchen', 'Aluminum foil', 'roll', 1, 40, 3.99], ['kitchen', 'Plastic wrap', 'roll', 1, 60, 2.99], ['kitchen', 'Sandwich bags', 'bag', 100, 30, 2.49],
  ['kitchen', 'Gallon bags', 'bag', 30, 30, 2.99], ['kitchen', 'Dish soap', 'bottle', 1, 30, 2.29], ['kitchen', 'Dishwasher pods', 'pod', 40, 1, 8.99],
  ['kitchen', 'Sponges', 'sponge', 6, 14, 2.99],
  ['paper', 'Paper towels', 'roll', 6, 9, 7.99, true], ['paper', 'Toilet paper', 'roll', 12, 4, 8.49, true], ['paper', 'Facial tissues', 'box', 4, 10, 4.99, true],
  ['paper', 'Napkins', 'pack', 1, 30, 2.49, true],
  ['cleaning', 'Laundry detergent', 'bottle', 1, 40, 8.99, true], ['cleaning', 'Dryer sheets', 'box', 1, 60, 3.49, true], ['cleaning', 'All-purpose cleaner', 'bottle', 1, 45, 2.99],
  ['cleaning', 'Hand soap', 'bottle', 1, 21, 1.99, true],
  ['personal', 'Toothpaste', 'tube', 1, 40, 2.49, true], ['personal', 'Toothbrushes', 'brush', 2, 90, 2.99, true], ['personal', 'Floss', 'pack', 1, 60, 1.99, true],
  ['personal', 'Mouthwash', 'bottle', 1, 30, 3.99, true], ['personal', 'Shampoo', 'bottle', 1, 45, 3.99, true], ['personal', 'Conditioner', 'bottle', 1, 50, 3.99, true],
  ['personal', 'Body wash', 'bottle', 1, 30, 3.99, true], ['personal', 'Deodorant', 'stick', 1, 45, 2.99], ['personal', 'Razors', 'razor', 4, 28, 6.99]
];
var HOUSE_CATEGORY = 'Household';

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
    if (!blank_(r.possible) && ['Y', 'N'].indexOf(yn_(r.possible)) < 0) E(line + ' (' + id + '): possible must be Y or N.');
    var possible = !retired && yn_(r.possible) === 'Y';
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
    if (str_(r.flavor)) it.flavor = str_(r.flavor);
    // Version 7: where to buy an item Aldi doesn't sell. Left out when blank, so other items keep their fingerprint.
    if (str_(r.where)) it.where = str_(r.where);
    // 6.1: food types and household fields
    var ft = str_(r.food_types != null ? r.food_types : r.flags).toLowerCase().split(/[;,]/).map(function (x) { return x.trim().replace(/[\s-]+/g, '_'); }).filter(String);
    ft.forEach(function (f) { if (FOOD_TYPES.indexOf(f) < 0) E(line + ' (' + id + '): food type "' + f + '" isn\'t one of ' + FOOD_TYPES.join(', ') + '.'); });
    if (ft.length) it.flags = ft.filter(function (f, i) { return FOOD_TYPES.indexOf(f) >= 0 && ft.indexOf(f) === i; }).join(';');
    var grp = str_(r.group).toLowerCase();
    if (grp && HOUSE_GROUPS.indexOf(grp) < 0) E(line + ' (' + id + '): group "' + r.group + '" isn\'t one of ' + HOUSE_GROUPS.join(', ') + ' (blank for food).');
    var upp = num_(r.units_per_package), days = num_(r.typical_days), sc = yn_(r.scales_with_people);
    if (!blank_(r.units_per_package) && !(upp >= 1 && upp === Math.round(upp))) E(line + ' (' + id + '): units_per_package must be a whole number, 1 or more.');
    if (!blank_(r.typical_days) && !(days > 0)) E(line + ' (' + id + '): typical_days must be more than 0.');
    if (sc && ['Y', 'N'].indexOf(sc) < 0) E(line + ' (' + id + '): scales_with_people must be Y or N.');
    if (grp && HOUSE_GROUPS.indexOf(grp) >= 0) {
      it.group = grp; it.unit_label = str_(r.unit_label) || 'unit'; it.units_per_package = upp >= 1 ? Math.round(upp) : 1;
      it.typical_days = days > 0 ? days : 14; it.scales_with_people = sc === 'Y' ? 'Y' : 'N';
      if (ft.length) W(id + ': household item with food types. Food types only matter for food.');
    } else if (!grp && ['unit_label', 'units_per_package', 'typical_days', 'scales_with_people'].some(function (k) { return !blank_(r[k]); }))
      W(id + ': has household columns filled in but no group, so the app treats it as food.');
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
    // Version 7: a possible ingredient has no price until someone buys it. Once it has one, it is an ordinary item.
    if (possible && it.price > 0) W(id + ': possible is Y but it has a price, so the app treats it as an ordinary item. Set possible to N.');
    else if (possible) it.possible = true;
    if (!retired && !it.possible && !(it.price > 0)) E(line + ' (' + id + '): price is missing, zero or not a number' + (MIG ? ' (add a price on the Offers tab).' : '.') + ' For an item Aldi doesn\'t sell, set possible to Y.');
    if (!retired && !(it.pkg > 0)) E(line + ' (' + id + '): package_qty is missing or zero.');
    if (it.node && !ND[it.node]) E(line + ' (' + id + '): node "' + it.node + '" isn\'t on the Nodes tab.');
    if (!retired && !it.staple && (storage === 'fridge' || storage === 'counter') && it.fridge == null && it.pantry == null) W(id + ': perishable with no shelf-life days.');
    if (!retired && !it.group && !it.possible && (!it.priceDate || (new Date(today) - new Date(it.priceDate)) / 864e5 > 30)) W(id + ': price_date ' + (it.priceDate || 'missing') + ' is over 30 days old.');
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
    // Optional (Fetch photos and steps): left out when empty, so older phones and the catalog fingerprint don't change.
    var photo = cssSafeUrl_(r.photo_url), steps = stepsCell_(r.steps);
    if (/^https:\/\/\S+$/i.test(photo)) rec.photo = photo;
    if (steps.length) rec.steps = steps;
    // 6.5: kind is always written (blank is main); alsoBreakfast only when ticked on a main.
    var kind = kindOf_(r.kind);
    if (KINDS.indexOf(kind) < 0) { W(line + ' (' + id + '): kind "' + r.kind + '" isn\'t one of ' + KINDS.join(', ') + '. Read as main.'); kind = 'main'; }
    rec.kind = kind;
    if (truthy_(r.also_breakfast)) { if (kind === 'main') rec.alsoBreakfast = true; else if (active) W(id + ': also_breakfast is ticked, but it is a ' + kind + '. Only a main can also be breakfast.'); }
    R[id] = rec; recipes.push(rec);
  });
  kindChecks_(recipes, R, pairingsOf_(recR), W);

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
  var unused = items.filter(function (it) { return !it.retired && !it.staple && !it.group && !used[it.id]; }).map(function (it) { return it.id; });
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

  // Variants, in the phone's layer shape: {itemId: [{vid, brand, flavor, nums: {store: [num]}, last: {price, date, store}}]}
  var tV = table_(SHEETS.variants), variants = variantsOf_(tV ? tV.objects() : [], I, ST, W);
  // Learned from the phone: [kind, key, value, count, last_seen], most counted first.
  var tL = table_(SHEETS.learned), learned = learnedOf_(tL ? tL.objects() : []);

  var catalog = {
    schemaVersion: SCHEMA, catalogVersion: null, builtAt: null, categories: categories, stores: stores,
    nodes: nodes.map(function (n) { return { id: n.id, name: n.name, parent: n.parent, level: n.level }; }), items: items,
    recipes: recipes.filter(function (r) { return r.active; }).map(function (r) { var o = {}; for (var k in r) if (k !== 'active') o[k] = r[k]; return o; }),
    aliases: aliases, favorites: favorites, variants: variants, learned: learned
  };
  return { catalog: catalog, errors: errors, warnings: warnings };
}

// Pairings into recipe.sides (mains only, real sides only), plus the kind counts and the side basics still missing.
var SIDE_BASICS = [['white rice', /\brice\b|\barroz\b/i], ['black beans', /black beans|frijoles negros/i], ['tortillas', /tortillas?/i], ['garlic bread', /garlic bread/i], ['green salad', /green salad|garden salad|side salad|mixed greens/i]];
function kindChecks_(recipes, R, pairs, W) {
  Object.keys(pairs).forEach(function (mid) {
    var m = R[mid]; if (!m) { W('Pairings: main "' + mid + '" isn\'t on the Recipes sheet.'); return; }
    if (m.kind !== 'main') { W('Pairings: ' + mid + ' is a ' + m.kind + ', not a main. Its sides were left out.'); return; }
    var ok = pairs[mid].filter(function (sid) {
      if (!R[sid]) { W('Pairings: ' + mid + ' lists side "' + sid + '", which isn\'t on the Recipes sheet.'); return false; }
      if (!R[sid].active) { W('Pairings: ' + mid + ' lists ' + sid + ', which isn\'t active.'); return false; }
      if (R[sid].kind !== 'side') { W('Pairings: ' + mid + ' lists ' + sid + ', which is a ' + R[sid].kind + ', not a side.'); return false; }
      return true;
    });
    if (ok.length) m.sides = ok;
  });
  var act = recipes.filter(function (r) { return r.active; }), kc = kindCounts_(act);
  W('Recipe kinds: ' + KINDS.map(function (k) { return (kc[k] || 0) + ' ' + k; }).join(', ') + '.');
  var sideNames = act.filter(function (r) { return r.kind === 'side'; }).map(function (r) { return r.name; });
  var missing = SIDE_BASICS.filter(function (b) { return !sideNames.some(function (n) { return b[1].test(n); }); }).map(function (b) { return b[0]; });
  if (missing.length) W('No side recipe yet for: ' + missing.join(', ') + '. Mains have only ' + sideNames.length + ' side' + (sideNames.length === 1 ? '' : 's') + ' to pair with.');
}
function kindCounts_(recipes) { var kc = {}; recipes.forEach(function (r) { kc[r.kind] = (kc[r.kind] || 0) + 1; }); return kc; }

function learnKey_(kind, key, value) { return str_(kind) + '|' + str_(key) + '|' + str_(value); }
// Learned rows -> [[kind, key, value, count, last_seen]]. Unknown kinds are left out; at most 3000 rows, most counted first.
function learnedOf_(rows) {
  var out = [];
  rows.forEach(function (r) {
    var kind = str_(r.kind), key = str_(r.key), value = str_(r.value); if (LEARN_KINDS.indexOf(kind) < 0 || !key || !value) return;
    out.push([kind, key, value, Math.max(1, Math.round(num_(r.count) || 1)), dateStr_(r.last_seen) || '']);
  });
  return out.sort(function (a, b) { return b[3] - a[3]; }).slice(0, 3000);
}

// Variants rows -> {itemId: [variant]}. Rows of one variant_id are merged; the newest last_date wins for last.
function variantsOf_(rows, I, ST, W) {
  var out = {}, byVid = {};
  rows.forEach(function (r) {
    var vid = str_(r.variant_id), item = str_(r.item_id); if (!vid && !item) return;
    if (!vid) { W('Variants row ' + r._row + ': no variant_id.'); return; }
    if (!I[item]) { W('Variants row ' + r._row + ' (' + vid + '): item "' + item + '" isn\'t on the Items tab.'); return; }
    var v = byVid[vid];
    if (v && v._item !== item) { W('Variants row ' + r._row + ': ' + vid + ' is under ' + v._item + ' on an earlier row, not ' + item + '. This row was skipped.'); return; }
    if (!v) { v = byVid[vid] = { _item: item, vid: vid, brand: str_(r.brand) || null, flavor: str_(r.flavor) || null, nums: {}, last: null }; (out[item] = out[item] || []).push(v); }
    if (!v.brand && str_(r.brand)) v.brand = str_(r.brand); if (!v.flavor && str_(r.flavor)) v.flavor = str_(r.flavor);
    var store = str_(r.store).toLowerCase();
    if (store) {
      if (!ST[store]) W('Variants row ' + r._row + ' (' + vid + '): store "' + store + '" isn\'t on the Stores tab.');
      var ns = nums_(r.numbers); if (ns.length) v.nums[store] = (v.nums[store] || []).concat(ns.filter(function (n) { return (v.nums[store] || []).indexOf(n) < 0; }));
    }
    var lp = num_(r.last_price), ld = dateStr_(r.last_date);
    if (lp != null && (!v.last || (ld || '') > (v.last.date || ''))) v.last = { price: lp, date: ld, store: store || null };
  });
  for (var k in out) out[k].forEach(function (v) { delete v._item; });
  return out;
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

// ---------------------------------------------------------------- staples and shelf life (6.6, Meal Prep > Mark staples and shelf life)

// Cooking basics the cook sheet treats as "you have it" (one collapsed line, never on the list by default). The app
// has the same words as a fallback (STAPLE_RE / NOT_STAPLE in v6.6); the sheet is the source of truth.
// Fresh garlic, onions and other perishables never match: only rows stored in the pantry are marked.
var STAPLE_RE_ = /\b(?:olive|vegetable|canola|avocado|sesame|coconut|cooking|frying|peanut|sunflower|grapeseed)\s+oil\b|\bcooking spray\b|\boil spray\b|\bvinegar\b|\bsalt\b|\b(?:black|white)\s+pepper\b|\bpeppercorns?\b|\bsugar\b|\bflour\b|\bbaking (?:soda|powder)\b|\bcorn ?starch\b|\bsoy sauce\b|\bvanilla extract\b|\bseasoning\b|\bspice\b|\b(?:ground|dried)\s+(?:basil|oregano|thyme|rosemary|parsley|dill|sage|marjoram|tarragon|bay|chives|mint|fenugreek|cumin|coriander|ginger|cinnamon|nutmeg|cloves|allspice|cardamom|mustard|turmeric|cayenne|chipotle|ancho|fennel|achiote|annatto|(?:black |white |red )?pepper)\b|\b(?:chili|curry|garlic|onion|ginger|mustard|cayenne)\s+powder\b|\b(?:paprika|cumin|cinnamon|oregano|turmeric|nutmeg|cayenne|allspice|cardamom|coriander|bay leaves|garam masala|ras el hanout|red pepper flakes|italian seasoning|old bay|saz[oó]n)\b/i;
var NOT_STAPLE_ = /\b(?:chips?|crisps|crackers?|popcorn|pretzels?|nuts?|snacks?|tortillas?|bread|buns?|rolls?|snap|free|cookies?|cake|muffin|brownie|cereal|candy|gum|(?<!baking )soda|drink|masa|tea|coffee|butter|cheese|fresh|frozen|salted caramel|salt water taffy|dressing|marinade|wings?)\b/i;

// Shelf-life days for shelf-stable food, used only where the pantry_days cell is blank. Same table as
// FirstCore.shelfGuess in the app. First match wins; no match leaves the cell blank, and the app then shows the item
// under "No date" instead of marking it expired.
var SHELF_GUESS_ = [
  [60, /\b(?:summer sausage|salami|pepperoni|beef sticks?|meat sticks?|snack sticks?|jerky)\b/i],
  [90, /\bcrackers?\b|\bgraham\b|\b(?:granola|protein|cereal|snack|breakfast|fruit|nut|energy|fiber|oat) bars?\b/i],
  [365, /\b(?:canned|can|cans|tinned)\b|\bin (?:water|juice|oil|syrup|brine|tomato sauce)\b|\b(?:tuna|chickpeas|garbanzo|black beans|kidney beans|pinto beans|cannellini|navy beans|refried beans|baked beans|diced tomatoes|crushed tomatoes|whole tomatoes|tomato sauce|tomato paste|evaporated milk|condensed milk|coconut milk|soup|chili beans|sweet corn|green beans|vienna sausages?|spam)\b/i],
  [180, /\b(?:marinara|pasta sauce|spaghetti sauce|alfredo|pizza sauce|salsa|queso dip|enchilada sauce|curry paste|pesto|jarred|jar)\b/i],
  [180, /\b(?:sparkling water|seltzer|(?<!baking )soda|cola|juice|bottled water|spring water|lemonade|sports drink|energy drink|iced tea|coconut water)\b/i],
  [365, /\b(?:spaghetti|penne|rotini|rigatoni|ziti|macaroni|linguine|fettuccine|farfalle|lasagna|angel hair|orzo|egg noodles|lo mein|ramen|pasta|rice|couscous|quinoa)\b/i]
];
var NOT_SHELF_ = /\b(?:fresh|refrigerated|frozen|deli|tortellini|ravioli|gnocchi|rice vinegar|rice wine|rice cakes?|rice milk|chips|tortillas?|cereal|kombucha|cold brew|milk(?! chocolate))\b/i;

function shelfGuess_(name) {
  name = String(name || '');
  if (NOT_SHELF_.test(name) && !/\b(?:evaporated|condensed|coconut) milk\b/i.test(name)) return null;
  for (var i = 0; i < SHELF_GUESS_.length; i++) if (SHELF_GUESS_[i][1].test(name)) return SHELF_GUESS_[i][0];
  return null;
}
function isStaple_(name) { name = String(name || ''); return STAPLE_RE_.test(name) && !NOT_STAPLE_.test(name); }

// What "Mark staples and shelf life" would change: [{row, id, name, field, from, to}]. Only N -> Y and blank -> days;
// a Y is never cleared and a filled cell is never changed. Retired rows and household rows are skipped.
function staplePlan_() {
  var tI = table_(SHEETS.items), tC = table_(SHEETS.categories), CATS = {}, out = [];
  if (!tI) return out;
  if (tC) tC.objects().forEach(function (r) { var n = str_(r.category).toLowerCase(); if (n) CATS[n] = str_(r.storage).toLowerCase(); });
  tI.objects().forEach(function (r) {
    var id = str_(r.item_id), name = str_(r.name) || id; if (!id || yn_(r.retired) === 'Y' || str_(r.group)) return;
    var cat = str_(r.category).toLowerCase(); if (cat === HOUSE_CATEGORY.toLowerCase()) return;
    var storage = str_(r.storage).toLowerCase() || CATS[cat] || 'pantry';
    if (storage !== 'pantry') return;
    if (yn_(r.staple) !== 'Y' && tI.col.staple != null && isStaple_(name)) out.push({ row: r._row, id: id, name: name, field: 'staple', from: str_(r.staple) || '(blank)', to: 'Y' });
    if (tI.col.pantry_days != null && blank_(r.pantry_days)) { var d = shelfGuess_(name); if (d) out.push({ row: r._row, id: id, name: name, field: 'pantry_days', from: '(blank)', to: d }); }
  });
  return out;
}

function menuStaples() {
  var ui = SpreadsheetApp.getUi(), plan = staplePlan_();
  if (!plan.length) { ui.alert('Nothing to change. Every cooking basic is already a staple and no shelf-stable row is missing its pantry days.'); return; }
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName('Staple changes') || ss.insertSheet('Staple changes');
  sh.clear();
  var rows = [['Items row', 'item_id', 'name', 'column', 'was', 'becomes']].concat(plan.map(function (p) { return [p.row, p.id, p.name, p.field, p.from, p.to]; }));
  sh.getRange(1, 1, rows.length, 6).setValues(rows); sh.setFrozenRows(1); sh.getRange(1, 1, 1, 6).setFontWeight('bold');
  var st = plan.filter(function (p) { return p.field === 'staple'; }).length;
  var r = ui.alert('Staples and shelf life', st + ' row(s) become staples and ' + (plan.length - st) + ' blank pantry_days cell(s) get filled. The list is in the "Staple changes" sheet. Apply them now?', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  var tI = table_(SHEETS.items);
  plan.forEach(function (p) {
    tI.set(p.row, p.field, p.to);
    if (tI.col.last_changed != null) tI.set(p.row, 'last_changed', new Date());
    if (tI.col.changed_by != null) tI.set(p.row, 'changed_by', 'sheet');
  });
  ui.alert('Done. ' + plan.length + ' cell(s) changed. Phones pick them up with the next catalog.');
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
  if (p.ping) return json_({ ok: true, app: 'meal-prep-sheet', script: SCRIPT_VERSION, at: new Date().toISOString() });
  var c = currentCatalog_();
  var problems = { errors: c.errors, warnings: c.warnings, stale: c.stale };
  if (!c.catalog) return json_({ ok: false, error: 'sheet-errors', message: 'The sheet has errors and there is no earlier good copy.', problems: problems });
  if (p.have && p.have === c.catalog.catalogVersion) return json_({ ok: true, notModified: true, version: c.catalog.catalogVersion, script: SCRIPT_VERSION, problems: problems });
  // Version 5.3 phones send no schema and get the version 1 shape. Version 6 sends schema=2.
  var cat = String(p.schema || '1') === '2' ? c.catalog : toV1_(c.catalog);
  return json_({ ok: true, version: c.catalog.catalogVersion, schema: cat.schemaVersion, script: SCRIPT_VERSION, catalog: cat, problems: problems });
}

/**
 * POST body (sent as plain text, see the app instructions):
 *   {"key":"SECRET","device":"pixel","changes":[{"id":"c_…","type":"price.set","at":"…","data":{…},"base":{…}}, …]}
 * Reply:
 *   {"ok":true,"results":[{"id":"c_…","status":"applied|duplicate|conflict|rejected|error","message":"…","sheet":{…}}],
 *    "idMap":{"u_greek_yogurt_tub":"greek_yogurt_tub","edit:d_tacos":"d_tacos_mine"},"version":"…","script":7}
 *   Every reply to a key that works carries "script" (SCRIPT_VERSION). Scripts before version 7 leave it out.
 *   {"key":"SECRET","action":"recipe.fetch","url":"https://…"}  -> see recipeFetch_
 *   {"key":"SECRET","action":"recipe.fetchAll"}  -> fills photo_url and steps for every recipe, see fetchSteps_
 *   {"key":"SECRET","action":"backup.save|backup.list|backup.fetch", …}  -> Drive backups, see backup_
 *   any other action -> {ok:false, error:"unknown action"}
 */
function doPost(e) {
  var body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return json_({ ok: false, error: 'bad-json', message: 'The request was not valid JSON.' }); }
  if (!keyOk_(body.key)) return json_({ ok: false, error: 'refused', message: 'Wrong or missing key.' });
  if (body.action === 'recipe.fetch') return json_(recipeFetch_(body.url));
  if (body.action === 'recipe.fetchAll') return json_(startFetchAll_(20000));
  if (/^backup\.(save|list|fetch)$/.test(String(body.action))) return json_(backup_(body));
  // Before 6.6 an unknown action fell through to the changes below and came back {ok:true, results:[]}.
  if (body.action != null) return json_({ ok: false, error: 'unknown action', message: 'This script does not know "' + String(body.action).slice(0, 40) + '". Update your Google script.' });
  var changes = Array.isArray(body.changes) ? body.changes.slice(0, MAX_BATCH) : [];
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return json_({ ok: false, error: 'busy', message: 'The sheet is busy. Try again in a minute.' });
  try {
    var ctx = context_();
    var results = changes.map(function (ch) { return applyOne_(ctx, ch, body.device); });
    SpreadsheetApp.flush();
    var version = null;
    try { var c = currentCatalog_(); version = c.catalog && c.catalog.catalogVersion; } catch (err) { }
    return json_({ ok: true, results: results, idMap: ctx.idMap, version: version, script: SCRIPT_VERSION });
  } finally { lock.releaseLock(); }
}

// ---------------------------------------------------------------- Drive backups (6.6: backup.save, backup.list, backup.fetch)

// The phone sends its whole saved state in 350,000-character base64 parts. Each part is kept as its own file in
// "Meal Prep backups/_parts" until the last one arrives; then they are joined into one JSON file in "Meal Prep backups"
// and old backups are thinned out (backupKeep_). The app strips the key before sending; a backup that still
// contains it is refused. Neither the data nor the key is ever logged.
//   file content: {id, at, enc, size, meta, data}   file description: the same without data, plus len (data length)
var BACKUP_FOLDER = 'Meal Prep backups';
var BACKUP_PARTS = '_parts';
var BACKUP_CHUNK = 350000;           // characters in one part, both ways
var BACKUP_MAX_PARTS = 60;           // about 21 MB of base64
var BACKUP_KEEP = { daily: 7, weekly: 4 };   // Nelson's choice (the work order said 14 and 8)
var BACKUP_ENCS = ['gzip-base64', 'base64'];
var BACKUP_NAME_RE = /^[A-Za-z0-9._-]{1,120}\.json$/;
var BACKUP_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

function backup_(body) {
  try {
    if (body.action === 'backup.save') return backupSave_(body);
    if (body.action === 'backup.list') return backupList_();
    return backupFetch_(body);
  } catch (err) { return { ok: false, error: 'backup-failed', message: 'Google Drive said: ' + String(err && err.message || err).slice(0, 200) }; }
}

function backupFolder_(sub) {
  var P = PropertiesService.getScriptProperties(), id = P.getProperty('BACKUP_FOLDER_ID'), f = null;
  if (id) { try { f = DriveApp.getFolderById(id); if (f.isTrashed()) f = null; } catch (err) { f = null; } }
  if (!f) {
    var it = DriveApp.getFoldersByName(BACKUP_FOLDER);
    while (it.hasNext()) { var c = it.next(); if (!c.isTrashed()) { f = c; break; } }
    if (!f) f = DriveApp.createFolder(BACKUP_FOLDER);
    P.setProperty('BACKUP_FOLDER_ID', f.getId());
  }
  if (!sub) return f;
  var s = f.getFoldersByName(sub);
  return s.hasNext() ? s.next() : f.createFolder(sub);
}

function filesIn_(folder) { var out = [], it = folder.getFiles(); while (it.hasNext()) { var f = it.next(); if (!f.isTrashed()) out.push(f); } return out; }
function trashNamed_(folder, name) { filesIn_(folder).forEach(function (f) { if (f.getName() === name) f.setTrashed(true); }); }

function backupSave_(b) {
  var part = b.part, parts = b.parts, data = b.data;
  if (!BACKUP_ID_RE.test(String(b.id || ''))) return { ok: false, error: 'bad-id', message: 'The backup has no usable id.' };
  if (!BACKUP_NAME_RE.test(String(b.name || ''))) return { ok: false, error: 'bad-name', message: 'The backup file name is not allowed.' };
  if (BACKUP_ENCS.indexOf(b.enc) < 0) return { ok: false, error: 'bad-enc', message: 'enc must be gzip-base64 or base64.' };
  if (!(parts >= 1 && parts <= BACKUP_MAX_PARTS && parts % 1 === 0 && part >= 0 && part < parts && part % 1 === 0)) return { ok: false, error: 'bad-part', message: 'part and parts do not add up.' };
  if (typeof data !== 'string' || data.length > BACKUP_CHUNK || !/^[A-Za-z0-9+/=]*$/.test(data)) return { ok: false, error: 'bad-data', message: 'Each part must be base64 of at most ' + BACKUP_CHUNK + ' characters.' };
  var tmp = backupFolder_(BACKUP_PARTS), pname = b.id + '.part' + part;
  trashNamed_(tmp, pname);      // a part sent again replaces the first copy
  tmp.createFile(pname, data, 'text/plain');
  if (part !== parts - 1) return { ok: true, action: 'backup.save', part: part, parts: parts };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: 'busy', message: 'Another backup is being written. Try again in a minute.' };
  try {
    var mine = {}, prefix = b.id + '.part';
    filesIn_(tmp).forEach(function (f) { var n = f.getName(); if (n.indexOf(prefix) === 0) mine[n.slice(prefix.length)] = f; });
    var chunks = [];
    for (var i = 0; i < parts; i++) {
      if (!mine[i]) return { ok: false, error: 'missing-part', message: 'Part ' + (i + 1) + ' of ' + parts + ' never arrived. Back up again.' };
      chunks.push(mine[i].getBlob().getDataAsString());
    }
    var joined = chunks.join(''), dropParts = function () { for (var k in mine) mine[k].setTrashed(true); };
    var text;
    try {
      var bytes = Utilities.base64Decode(joined);
      text = b.enc === 'gzip-base64' ? Utilities.ungzip(Utilities.newBlob(bytes, 'application/x-gzip')).getDataAsString() : Utilities.newBlob(bytes).getDataAsString();
    } catch (err) { dropParts(); return { ok: false, error: 'bad-data', message: 'The backup could not be read back. Back up again.' }; }
    var key = PropertiesService.getScriptProperties().getProperty('APP_KEY');
    if (key && (text.indexOf(key) >= 0 || JSON.stringify(b.meta || null).indexOf(key) >= 0)) { dropParts(); return { ok: false, error: 'has-key', message: 'The backup still contains the app key, so it was not saved.' }; }
    var at = Date.now(), info = { id: b.id, at: at, enc: b.enc, size: +b.size || text.length, meta: b.meta == null ? null : b.meta };
    var folder = backupFolder_();
    trashNamed_(folder, b.name);
    var file = folder.createFile(b.name, JSON.stringify(merge_(info, { data: joined })), 'application/json');
    try { file.setDescription(JSON.stringify(merge_(info, { len: joined.length }))); } catch (err) { }   // list reads this instead of every file
    dropParts();
    // parts older than a day belong to uploads that never finished
    filesIn_(tmp).forEach(function (f) { if (at - f.getDateCreated().getTime() > 864e5) f.setTrashed(true); });
    var keep = b.keep && b.keep.daily >= 1 && b.keep.weekly >= 0 ? { daily: Math.min(31, b.keep.daily | 0), weekly: Math.min(52, b.keep.weekly | 0) } : BACKUP_KEEP;
    var all = backupFiles_(folder), kept = backupKeep_(all, at, keep), deleted = 0;
    kept[file.getId()] = true;
    all.forEach(function (x) { if (!kept[x.fileId]) { x.file.setTrashed(true); deleted++; } });
    return { ok: true, action: 'backup.save', part: part, parts: parts, saved: true, name: b.name, fileId: file.getId(), deleted: deleted };
  } finally { lock.releaseLock(); }
}

// Backups in the folder, newest first: {fileId, file, id, name, at, size, enc, meta, len}
function backupFiles_(folder) {
  return filesIn_(folder).filter(function (f) { return BACKUP_NAME_RE.test(f.getName()); }).map(function (f) {
    var d = null;
    try { d = JSON.parse(f.getDescription() || 'null'); } catch (err) { }
    if (!d || d.len == null) { try { var c = JSON.parse(f.getBlob().getDataAsString()); d = { id: c.id, at: c.at, enc: c.enc, size: c.size, meta: c.meta, len: String(c.data || '').length }; } catch (err) { return null; } }
    return { fileId: f.getId(), file: f, id: d.id || f.getId(), name: f.getName(), at: +d.at || f.getDateCreated().getTime(), size: d.size || null, enc: d.enc, meta: d.meta == null ? null : d.meta, len: d.len || 0 };
  }).filter(Boolean).sort(function (a, b) { return b.at - a.at; });
}

/**
 * Which backups to keep. Same rule as FirstCore.backupKeep in the app (design/source/tools/first-core.js), checked by
 * test/backup.test.js: the newest backup of each of the 7 most recent days that have one, plus the newest of each
 * week (fixed 7-day blocks counted from 1 Jan 1970, in UTC) for backups less than 4 weeks old. Fixed blocks keep a
 * week's copy stable from one day to the next; counting days that have a backup means a phone that was off for a
 * while still keeps its last 7 days of backups.
 * files: [{fileId, at}] (any order). Returns {fileId: true} for the ones to keep.
 */
function backupKeep_(files, now, keep) {
  var D = 864e5, daily = keep.daily || 7, weekly = keep.weekly || 4, out = {}, days = {}, nDays = 0, weeks = {};
  var s = files.slice().sort(function (a, b) { return b.at - a.at; });
  s.forEach(function (f) { var dk = Math.floor(f.at / D); if (nDays < daily && !days[dk]) { days[dk] = 1; nDays++; out[f.fileId] = true; } });
  s.forEach(function (f) { if (now - f.at > weekly * 7 * D) return; var wk = Math.floor(f.at / (7 * D)); if (!weeks[wk]) { weeks[wk] = 1; out[f.fileId] = true; } });
  return out;
}

function backupList_() {
  var files = backupFiles_(backupFolder_()).map(function (x) {
    return { id: x.id, fileId: x.fileId, name: x.name, at: x.at, size: x.size, enc: x.enc, meta: x.meta, parts: Math.max(1, Math.ceil(x.len / BACKUP_CHUNK)) };
  });
  return { ok: true, action: 'backup.list', files: files };
}

function backupFetch_(b) {
  var want = String(b.id || ''), part = b.part == null ? 0 : b.part;
  if (!want) return { ok: false, error: 'bad-id', message: 'Say which backup to fetch.' };
  var hit = backupFiles_(backupFolder_()).filter(function (x) { return x.id === want || x.fileId === want; })[0];
  if (!hit) return { ok: false, error: 'not-found', message: 'That backup is no longer in Google Drive.' };
  var c = JSON.parse(hit.file.getBlob().getDataAsString()), data = String(c.data || ''), parts = Math.max(1, Math.ceil(data.length / BACKUP_CHUNK));
  if (!(part >= 0 && part < parts && part % 1 === 0)) return { ok: false, error: 'bad-part', message: 'That backup has ' + parts + ' part(s).' };
  return { ok: true, action: 'backup.fetch', id: hit.id, part: part, parts: parts, enc: c.enc, size: c.size, data: data.slice(part * BACKUP_CHUNK, (part + 1) * BACKUP_CHUNK) };
}

// ---------------------------------------------------------------- recipe pages (recipe.fetch)

// The phone can't read another site's page (the browser blocks it), so the script fetches it and sends back the
// page's schema.org Recipe blocks as text, or the page text when there are none. The phone reads them
// (design/source/tools/recipe-core.js). Nothing is written to the sheet.
//   {ok:true, url, title, blocks:["{…}"]} | {ok:true, url, title, text:"…"} | {ok:false, error, message}
function recipeFetch_(url) {
  url = String(url || '').trim();
  if (!/^https?:\/\/[^\s"<>]+$/i.test(url) || url.length > 2000) return { ok: false, error: 'bad-url', message: 'That is not a web address.' };
  var res;
  try { res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) MealPrep' } }); }
  catch (err) { return { ok: false, error: 'fetch-failed', message: 'The page could not be opened.' }; }
  var code = res.getResponseCode();
  if (code >= 400) return { ok: false, error: 'http-' + code, message: 'The site answered with an error (' + code + ').' };
  var html = String(res.getContentText() || '').slice(0, 3000000);
  var title = ((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  var blocks = [], re = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi, m;
  while ((m = re.exec(html)) && blocks.length < 10) if (/Recipe/.test(m[1])) blocks.push(m[1].trim().slice(0, 300000));
  if (blocks.length) return { ok: true, url: url, title: title, blocks: blocks };
  var text = html.replace(/<(script|style|noscript|svg|head|nav|footer)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/li|\/h[1-6]|\/div|\/tr|\/dt|\/dd)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/[ \t\r\f]+/g, ' ').replace(/ *\n[ \n]*/g, '\n').trim();
  return { ok: true, url: url, title: title, text: text.slice(0, 60000) };
}

// ---------------------------------------------------------------- photos and steps (Meal Prep > Fetch photos and steps)

// For each Recipes row with a link and no steps, the script reads the page's schema.org Recipe block and writes the
// photo link and the steps (a JSON array of strings, as the site wrote them) into photo_url and steps. The catalog
// then carries them as recipe.photo and recipe.steps. The visible page is never scraped: a page with no block gets
// fetch_note = no-recipe-data. The same rules are in design/source/tools/recipe-core.js for "+ From the web".
var RECIPE_FETCH_HEADERS = ['photo_url', 'steps', 'fetched_at', 'fetch_note'];
var FETCH_BATCH = 20;                 // rows fetched between sheet writes
var FETCH_BUDGET_MS = 270000;         // stop well before the 6-minute limit, then continue from a trigger
var FETCH_GAP_MS = 1000;              // between two fetches to the same site
var FETCH_DONE_NOTES = ['no-recipe-data', 'no-steps'];   // not tried again until the link changes or the note is cleared
var HTML_ENT_ = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', frac12: '½', frac14: '¼', frac34: '¾', frac13: '⅓', frac23: '⅔', frac18: '⅛', deg: '°', ndash: '–', mdash: '—', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', eacute: 'é', egrave: 'è', ntilde: 'ñ', hellip: '…' };
var STEP_AD_ = /jump to (?:the )?recipe|print (?:the )?recipe|pin (?:it|this|for later)|advertisement|sponsored|subscribe|newsletter|sign up|click here|affiliate|watch the video|rate this recipe|leave a (?:comment|review|rating)|tag @|follow (?:me|us) on|tried this recipe|share (?:a|your) photo|this post may contain|as an amazon associate/i;
var STEP_HEAD_ = /^(?:for (?:the )?.{1,40}|to (?:make|serve|assemble|finish) .{1,40}|instructions|directions|method|steps|preparation|notes?|assembly|garnish|to serve)$/i;

function decodeHtml_(s) {
  return String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, function (m, e) {
    if (e[0] === '#') { var c = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1); return c ? String.fromCodePoint(c) : m; }
    var v = HTML_ENT_[e.toLowerCase()]; return v == null ? m : v;
  }).replace(/\s+/g, ' ').trim();
}
function cleanStep_(raw) {
  var s = decodeHtml_(decodeHtml_(raw)).replace(/\s+([.,;:!?)])/g, '$1').replace(/\(\s+/g, '(').trim();
  s = s.replace(/^(?:step\s*)?\d{1,2}\s*[.):-]\s+(?=\S)/i, '').replace(/^step\s*\d{1,2}\s*$/i, '');
  s = s.replace(/\s*\b(?:jump to (?:the )?recipe|print (?:the )?recipe|jump to video)\b[\s:!.]*/gi, ' ').trim();
  if (STEP_AD_.test(s)) s = (s.match(/[^.!?]+(?:[.!?]+|$)/g) || []).map(function (x) { return x.trim(); }).filter(function (x) { return x && !STEP_AD_.test(x); }).join(' ');
  if (!s || !/[a-z]/i.test(s)) return '';
  if (s.length <= 60 && /:$/.test(s)) return '';
  var bare = s.replace(/[:!]+$/, '').trim();
  if (bare.length <= 50 && !/[.,;]/.test(bare) && (STEP_HEAD_.test(bare) || (bare === bare.toUpperCase() && /[A-Z]{3}/.test(bare) && bare.split(' ').length <= 6))) return '';
  return s.slice(0, 1200);
}
function splitSteps_(t) {
  var parts = String(t || '').split(/<\/?(?:li|p|br|ol|ul|h[1-6]|div)\b[^>]*>|\r?\n+/i).map(function (x) { return x.trim(); }).filter(String);
  if (parts.length === 1) { var n = decodeHtml_(parts[0]).split(/\s+(?=(?:step\s*)?\d{1,2}[.)]\s+[A-Z])/i); if (n.length > 1) parts = n; }
  return parts;
}
function stepsOf_(n) {
  var out = [];
  function add(t) { splitSteps_(t).forEach(function (p) { var c = cleanStep_(p); if (c && c !== out[out.length - 1]) out.push(c); }); }
  function walk(v, d) {
    if (v == null || d > 6 || out.length >= 80) return;
    if (typeof v === 'string') { add(v); return; }
    if (Array.isArray(v)) { v.forEach(function (x) { walk(x, d + 1); }); return; }
    if (typeof v !== 'object') return;
    var kids = v.itemListElement || v.steps || v.step;
    if (kids && typeof kids === 'object') walk(kids, d + 1); else walk(v.text != null ? v.text : v.name != null ? v.name : v.description, d + 1);
  }
  walk(n && n.recipeInstructions, 0);
  return out.slice(0, 80);
}
// The app puts the photo in an inline style that is split on ";", so ; ' " ( ) \ and spaces are percent-encoded.
// Hearst sites (Delish) use "?crop=…;center,top" in image links.
function cssSafeUrl_(s) { return String(s == null ? '' : s).trim().replace(/[;'"()\\\s]/g, function (c) { return '%' + ('0' + c.charCodeAt(0).toString(16).toUpperCase()).slice(-2); }); }
function photoOf_(n, url) {
  var v = n && n.image;
  for (var i = 0; i < 3 && v && typeof v === 'object'; i++) v = Array.isArray(v) ? v[0] : (v.url || v.contentUrl || v['@id'] || '');
  var s = String(v || '').trim();
  if (/^\/\//.test(s)) s = 'https:' + s;
  else if (/^\/[^/]/.test(s)) { var h = String(url || '').match(/^https:\/\/[^/]+/i); s = h ? h[0] + s : ''; }
  s = cssSafeUrl_(s);
  return /^https:\/\/[^\s"<>]+$/i.test(s) && s.length <= 2000 ? s : '';
}
function isRecipeLd_(n) {
  var t = n && n['@type'], re = /^(schema:)?Recipe$/i;
  return Array.isArray(t) ? t.some(function (x) { return re.test(x); }) : re.test(String(t || ''));
}
// The first schema.org Recipe in a page's JSON-LD blocks, including @graph arrays. null if there is none.
function findRecipeLd_(html) {
  var re = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi, m, hit = null, seen = [];
  function walk(n) {
    if (hit || !n || typeof n !== 'object' || seen.indexOf(n) >= 0) return; seen.push(n);
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (isRecipeLd_(n)) { hit = n; return; }
    ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item', 'hasPart'].forEach(function (k) { if (n[k]) walk(n[k]); });
  }
  while (!hit && (m = re.exec(String(html || '')))) {
    var o; try { o = JSON.parse(m[1].trim().replace(/^\s*<!--|-->\s*$/g, '')); } catch (e) { continue; }
    walk(o);
  }
  return hit;
}
// {found, photo, steps} for one page.
function recipeSteps_(html, url) {
  var n = findRecipeLd_(html);
  if (!n) return { found: false, photo: '', steps: [] };
  return { found: true, photo: photoOf_(n, url), steps: stepsOf_(n) };
}
// The steps cell (JSON text) as an array of strings; anything unreadable is no steps.
function stepsCell_(v) {
  if (blank_(v)) return [];
  try { var a = JSON.parse(String(v)); return Array.isArray(a) ? a.map(function (x) { return str_(x); }).filter(String) : []; } catch (e) { return []; }
}
// fetch_note is a fetch code (no-steps, http-403, …), then "; kind guessed: …" when the kind was guessed in the same run.
function noteCode_(v) { var s = str_(v); return /^kind guessed/.test(s) ? '' : s.split(';')[0].trim(); }
function needsFetch_(r) {
  return /^https?:\/\//i.test(str_(r.link)) && blank_(r.steps) && FETCH_DONE_NOTES.indexOf(noteCode_(r.fetch_note)) < 0;
}

/** Meal Prep > Fetch photos and steps. Starts from the top; long catalogs carry on by themselves from a trigger. */
function menuFetchSteps() {
  var r = startFetchAll_(FETCH_BUDGET_MS);
  SpreadsheetApp.getUi().alert(r.message);
}
// recipe.fetchAll from the phone, or the menu. Runs what fits in budgetMs, then hands the rest to a trigger.
function startFetchAll_(budgetMs) {
  ensureColumns_(SHEETS.recipes, RECIPE_FETCH_HEADERS.concat(RECIPE_KIND_HEADERS), []);
  var props = PropertiesService.getScriptProperties();
  props.setProperty('FETCH_NEXT_ROW', '2'); props.setProperty('FETCH_STATS', JSON.stringify({ steps: 0, missed: [], kinds: [] }));
  return fetchSteps_(budgetMs);
}
/** The time trigger's entry point. Carries on where the last run stopped. */
function fetchStepsRun() { fetchSteps_(FETCH_BUDGET_MS); }

function fetchSteps_(budgetMs) {
  var t0 = Date.now(), props = PropertiesService.getScriptProperties(), lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { scheduleFetch_(); return { ok: true, done: false, message: 'The sheet is busy. Fetching will carry on in a minute.' }; }
  try {
    var t = table_(SHEETS.recipes); if (!t) return { ok: false, error: 'no-recipes', message: 'No "Recipes" sheet found.' };
    var H = RECIPE_FETCH_HEADERS.concat(RECIPE_KIND_HEADERS);
    if (H.some(function (h) { return t.col[h] == null; })) { ensureColumns_(SHEETS.recipes, H, []); t = table_(SHEETS.recipes); }
    var stats; try { stats = JSON.parse(props.getProperty('FETCH_STATS') || ''); } catch (e) { } if (!stats) stats = { steps: 0, missed: [] }; if (!stats.kinds) stats.kinds = [];
    var rows = t.objects(), next = Math.max(2, parseInt(props.getProperty('FETCH_NEXT_ROW') || '2', 10) || 2), last = {}, n = 0;
    for (var i = next - 2; i < rows.length; i++) {
      if (Date.now() - t0 > budgetMs) { props.setProperty('FETCH_NEXT_ROW', String(rows[i]._row)); props.setProperty('FETCH_STATS', JSON.stringify(stats)); scheduleFetch_();
        return { ok: true, done: false, steps: stats.steps, missed: stats.missed, message: 'Fetched ' + stats.steps + ' so far. The rest carry on by themselves in a minute.' }; }
      var r = rows[i]; if (!str_(r.recipe_id)) continue;
      // A row is fetched for its steps (none yet) or for its kind (kind cell empty). A kind-only fetch never touches the steps.
      var wantSteps = needsFetch_(r), wantKind = blank_(r.kind), link = str_(r.link);
      var canFetch = /^https?:\/\//i.test(link) && FETCH_DONE_NOTES.indexOf(noteCode_(r.fetch_note)) < 0;
      if (!wantSteps && !(wantKind && canFetch)) {
        if (wantKind) { var g0 = kindGuess_(null, r.name, r.meal); writeKind_(t, r, g0, noteCode_(r.fetch_note)); stats.kinds.push([str_(r.recipe_id), g0.kind, g0.why]); }
        continue;
      }
      var host = (link.match(/^https?:\/\/([^\/?#]+)/i) || [])[1] || '';
      var wait = last[host] ? FETCH_GAP_MS - (Date.now() - last[host]) : 0; if (wait > 0) Utilities.sleep(wait);
      var res = fetchOne_(link); last[host] = Date.now();
      var code = noteCode_(r.fetch_note);
      if (wantSteps) {
        t.set(r._row, 'photo_url', res.photo || ''); t.set(r._row, 'steps', res.steps.length ? JSON.stringify(res.steps) : '');
        t.set(r._row, 'fetched_at', new Date()); t.set(r._row, 'fetch_note', res.note || ''); code = res.note || '';
        if (res.steps.length) stats.steps++; else stats.missed.push([str_(r.recipe_id), res.note]);
      }
      if (wantKind) { var g = kindGuess_(res.ld, r.name, r.meal); writeKind_(t, r, g, code); stats.kinds.push([str_(r.recipe_id), g.kind, g.why]); }
      if (++n % FETCH_BATCH === 0) SpreadsheetApp.flush();
    }
    props.deleteProperty('FETCH_NEXT_ROW'); props.deleteProperty('FETCH_STATS'); clearFetchTriggers_();
    SpreadsheetApp.flush(); try { currentCatalog_(); } catch (e) { }
    var miss = stats.missed.map(function (x) { return x[0] + ' (' + x[1] + ')'; });
    var kc = {}; stats.kinds.forEach(function (x) { kc[x[1]] = (kc[x[1]] || 0) + 1; });
    var kinds = KINDS.filter(function (k) { return kc[k]; }).map(function (k) { return kc[k] + ' ' + k; });
    return { ok: true, done: true, steps: stats.steps, missed: stats.missed, kinds: stats.kinds,
      message: 'Done. ' + stats.steps + ' recipe' + (stats.steps === 1 ? '' : 's') + ' got steps.' + (miss.length ? '\n\nNo steps for ' + miss.length + ': ' + miss.slice(0, 30).join(', ') + (miss.length > 30 ? ', …' : '') : '') +
        (kinds.length ? '\n\nGuessed the kind of ' + stats.kinds.length + ' recipe' + (stats.kinds.length === 1 ? '' : 's') + ': ' + kinds.join(', ') + '. Check them in the kind column; fetch_note says why.' : '') };
  } finally { lock.releaseLock(); }
}
// {photo, steps, note, ld}. note: no-recipe-data, no-steps, http-403, fetch-failed. ld = the Recipe block, for the kind guess.
function fetchOne_(url) {
  var res;
  try { res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) MealPrep' } }); }
  catch (err) { return { photo: '', steps: [], note: 'fetch-failed', ld: null }; }
  var code = res.getResponseCode(); if (code >= 400) return { photo: '', steps: [], note: 'http-' + code, ld: null };
  var n = findRecipeLd_(String(res.getContentText() || '').slice(0, 3000000));
  if (!n) return { photo: '', steps: [], note: 'no-recipe-data', ld: null };
  var steps = stepsOf_(n);
  return { photo: photoOf_(n, url), steps: steps, note: steps.length ? '' : 'no-steps', ld: n };
}
function scheduleFetch_() { clearFetchTriggers_(); ScriptApp.newTrigger('fetchStepsRun').timeBased().after(60000).create(); }
function clearFetchTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (tr) { if (tr.getHandlerFunction() === 'fetchStepsRun') ScriptApp.deleteTrigger(tr); });
}
// Clears photo_url, steps, fetched_at and fetch_note on rows r0..r1, so the next fetch reads the new link.
function clearFetched_(sh, headers, r0, r1) {
  RECIPE_FETCH_HEADERS.forEach(function (h) {
    var c = headers.indexOf(h); if (c < 0) return;
    sh.getRange(r0, c + 1, r1 - r0 + 1).setValues(Array.from({ length: r1 - r0 + 1 }, function () { return ['']; }));
  });
}

// ---------------------------------------------------------------- recipe kinds and side pairings (6.5)

// Recipes > kind is one of KINDS (blank is read as main). also_breakfast (a checkbox) marks a main that is also good for
// breakfast. sides lists the side recipe ids paired with a main; it is copied from the Pairings tab, never typed.
// Fetch photos and steps fills an empty kind from the page's recipeCategory and keywords, and never changes a kind
// someone set. The app has its own guess (kindGuess in the app) for when the catalog has no kind.
var KINDS = ['main', 'side', 'dessert', 'drink', 'snack', 'sauce'];
var RECIPE_KIND_HEADERS = ['kind', 'also_breakfast', 'sides'];
var PAIRING_HEADERS = ['main_id', 'main_name', 'side_id', 'side_name', 'note'];
var KIND_RULES_ = [
  ['side', /side dish(?:es)?|\bsides?\b|accompaniments?/i],
  ['dessert', /desserts?|\bsweets?\b|\bcakes?\b|\bpies?\b|cookies?/i],
  ['drink', /\bdrinks?\b|beverages?|cocktails?|smoothies?|agua fresca/i],
  ['sauce', /sauces?|condiments?|\bsalsas?\b|dressings?|\bdips?\b/i],
  ['snack', /\bsnacks?\b|appetizers?/i]
];
// Names are only trusted when they don't also name a main: "Chicken pot pie" is not a dessert. Only the name before any
// "(…)" is read, so "Shakshuka (eggs in spiced tomato sauce)" stays a main.
var KIND_NAME_EXTRA_ = { side: /cucumber salad|green salad|plantains?|maduros|patacones|roasted vegetables|mashed potatoes|\brice\b|black beans|refried beans|tortillas|garlic bread|\bslaw\b|elote|cornbread/i,
  dessert: /tres leches|flan|brownies?|mousse|cobbler|\bcrisp\b|crumble|cheesecake|ice cream|pudding|lemon bars/i,
  drink: /horchata|lemonade|limonada|\bagua de\b|\bjugo\b|\bjuice\b|chicha|colada morada|iced tea/i, sauce: /\baj[ií](?![a-z])|chimichurri|pesto|vinaigrette|pickled|curtido|pico de gallo/i };
var KIND_NAME_MAIN_ = /\b(chicken|beef|pork|steak|fish|salmon|tuna|shrimp|turkey|sausage|tacos?|burritos?|enchiladas?|pupusas?|empanadas?|quesadillas?|pasta|lasagna|bowl|soup|stew|curry|fried rice|pot pie|shepherd)\b/i;

function ldText_(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.reduce(function (a, x) { return a.concat(ldText_(x)); }, []);
  if (typeof v === 'object') return ldText_(v.name || v['@value'] || '');
  return String(v).split(/\s*,\s*/).map(function (x) { return decodeHtml_(x); }).filter(String);
}
// {kind, why, breakfast} for a recipe from its JSON-LD block (ld, may be null), its name and its meal.
// recipeCategory first, then keywords (a keyword must be the kind word itself, so "sweet potato" isn't a dessert), then the
// name, then meal = snack (as the app does). Otherwise main.
function kindGuess_(ld, name, meal) {
  var cats = ldText_(ld && ld.recipeCategory), keys = ldText_(ld && ld.keywords), nm = str_(name).replace(/\s*\(.*$/, '');
  var breakfast = cats.some(function (c) { return /breakfast|brunch/i.test(c); });
  function hit(list, whole) {
    for (var i = 0; i < KIND_RULES_.length; i++) for (var j = 0; j < list.length; j++) {
      var t = list[j], re = KIND_RULES_[i][1];
      if (whole ? re.test(t) && t.replace(new RegExp(re.source, 'gi'), '').replace(/[^a-z]/gi, '') === '' : re.test(t)) return { kind: KIND_RULES_[i][0], text: t };
    }
    return null;
  }
  var h = hit(cats, false);
  if (h) return { kind: h.kind, why: 'recipeCategory "' + h.text + '"', breakfast: false };
  h = hit(keys, true);
  if (h) return { kind: h.kind, why: 'keywords "' + h.text + '"', breakfast: false };
  if (nm && !KIND_NAME_MAIN_.test(nm)) {
    h = hit([nm], false);
    if (!h) for (var k in KIND_NAME_EXTRA_) if (KIND_NAME_EXTRA_[k].test(nm)) { h = { kind: k }; break; }
    if (h) return { kind: h.kind, why: 'name "' + str_(name) + '"', breakfast: false };
  }
  if (str_(meal).toLowerCase() === 'snack') return { kind: 'snack', why: 'meal "snack"', breakfast: false };
  return { kind: 'main', why: cats.length ? 'recipeCategory "' + cats.join(', ') + '"' : ld ? 'no category' : 'no recipe data', breakfast: breakfast };
}
// Writes a guessed kind into an empty kind cell, and TRUE into an empty also_breakfast cell for a breakfast main.
// The guess goes in fetch_note after the fetch code, e.g. "no-steps; kind guessed: side (recipeCategory "Side Dish")".
function writeKind_(t, r, g, code) {
  t.set(r._row, 'kind', g.kind);
  if (g.kind === 'main' && g.breakfast && blank_(r.also_breakfast)) t.set(r._row, 'also_breakfast', true);
  var note = 'kind guessed: ' + g.kind + ' (' + g.why + ')';
  t.set(r._row, 'fetch_note', code ? code + '; ' + note : note);
}
function kindOf_(v) { var k = str_(v).toLowerCase(); return k || 'main'; }
function truthy_(v) { return v === true || /^(y|yes|true|1)$/i.test(str_(v)); }

// Pairings rows -> {main_id: [side_id, …]} in row order, without repeats. Rows missing either id are skipped.
function groupPairings_(rows) {
  var out = {};
  rows.forEach(function (r) {
    var m = str_(r.main_id), sd = str_(r.side_id); if (!m || !sd) return;
    var list = out[m] || (out[m] = []); if (list.indexOf(sd) < 0) list.push(sd);
  });
  return out;
}
// The pairings for the catalog: the Pairings tab when there is one, else the Recipes sides column.
function pairingsOf_(recR) {
  var tP = table_(SHEETS.pairings); if (tP) return groupPairings_(tP.objects());
  var out = {}; recR.forEach(function (r) { var ids = str_(r.sides).split(/[;,]/).map(function (x) { return x.trim(); }).filter(String); if (ids.length) out[str_(r.recipe_id)] = ids; });
  return out;
}

// The same rules as the app's sideScore, without ratings. 0 means no reason to pair them.
var CUISINE_TAGS = ['mexican', 'ecuadorian', 'salvadoran', 'peruvian', 'colombian', 'cuban', 'caribbean', 'latin', 'indian', 'chinese', 'asian', 'thai', 'korean', 'japanese', 'vietnamese',
  'filipino', 'italian', 'greek', 'mediterranean', 'middle eastern', 'french', 'spanish', 'american', 'southern', 'cajun', 'tex-mex'];
function sideScore_(main, side) {
  var sc = 0, why = [], mn = String(main.name).toLowerCase(), sn = String(side.name).toLowerCase();
  var shared = (side.tags || []).filter(function (t) { return CUISINE_TAGS.indexOf(t) >= 0 && (main.tags || []).indexOf(t) >= 0; });
  if (shared.length) { sc += 3; why.push('both ' + shared.join(', ')); }
  if (/curry|masala|stew|tinga|chili|guiso|seco|encebollado|stir fry|teriyaki|adobo/.test(mn) && /rice|arroz|naan|tortilla|bread/.test(sn)) { sc += 3; why.push('rice or bread with a saucy main'); }
  if (/taco|burrito|enchilada|fajita|carnitas/.test(mn) && /rice|beans|elote|slaw|salsa/.test(sn)) { sc += 3; why.push('goes with tacos'); }
  if (/steak|chicken|pork|salmon|fish|chop/.test(mn) && /salad|roasted|mashed|plantain|patacones|maduros|vegetables/.test(sn)) { sc += 2; why.push('a vegetable with meat'); }
  if (/pasta|lasagna|spaghetti/.test(mn) && /salad|garlic bread/.test(sn)) { sc += 3; why.push('goes with pasta'); }
  return { score: sc, why: why.join('; ') };
}
var SUGGEST_MAX = 4;   // suggested sides per main
// Suggested pairings for every active main, best first, leaving out pairs already on the Pairings tab.
function suggestPairings_() {
  var tR = table_(SHEETS.recipes); if (!tR) return { rows: [], mains: 0, sides: 0 };
  var recs = tR.objects().filter(function (r) { return str_(r.recipe_id) && yn_(r.active) !== 'N'; }).map(function (r) {
    return { id: str_(r.recipe_id), name: str_(r.name) || str_(r.recipe_id), kind: kindOf_(r.kind), tags: str_(r.tags).split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(String) };
  });
  var tP = table_(SHEETS.pairings), have = groupPairings_(tP ? tP.objects() : []);
  var mains = recs.filter(function (r) { return r.kind === 'main'; }), sides = recs.filter(function (r) { return r.kind === 'side'; }), rows = [];
  mains.forEach(function (m) {
    sides.map(function (sd) { var x = sideScore_(m, sd); return { sd: sd, score: x.score, why: x.why }; })
      .filter(function (x) { return x.score > 0 && (have[m.id] || []).indexOf(x.sd.id) < 0; })
      .sort(function (a, b) { return b.score - a.score || a.sd.name.localeCompare(b.sd.name); }).slice(0, SUGGEST_MAX)
      .forEach(function (x) { rows.push([m.id, m.name, x.sd.id, x.sd.name, x.why]); });
  });
  return { rows: rows, mains: mains.length, sides: sides.length };
}
/** Meal Prep > Suggest pairings. Writes the Suggested pairings tab; copy the rows you like to Pairings. */
function menuSuggestPairings() {
  var x = suggestPairings_(), ss = SpreadsheetApp.getActive();
  var sh = sheet_(SHEETS.suggested) || ss.insertSheet(SHEETS.suggested);
  sh.clear(); var rows = [PAIRING_HEADERS].concat(x.rows);
  sh.getRange(1, 1, rows.length, PAIRING_HEADERS.length).setValues(rows); sh.getRange(1, 1, 1, PAIRING_HEADERS.length).setFontWeight('bold'); sh.setFrozenRows(1);
  SpreadsheetApp.getUi().alert(x.sides ? 'Suggested ' + x.rows.length + ' pairing' + (x.rows.length === 1 ? '' : 's') + ' for ' + x.mains + ' mains from ' + x.sides + ' sides, in the "' + SHEETS.suggested +
    '" tab. Copy the rows you want to the Pairings tab. Nothing is paired until it is there.'
    : 'No recipe has kind side yet. Run Meal Prep > Fetch photos and steps to guess kinds, or set some in the Recipes kind column, then try again.');
}

// The hidden _pairing_lists tab holds the names the Pairings dropdowns offer: column A mains (blank kind counts), B sides.
function ensurePairingLists_() {
  var rec = sheet_(SHEETS.recipes); if (!rec) return null;
  var h = rec.getRange(1, 1, 1, rec.getLastColumn()).getValues()[0].map(norm_), nc = h.indexOf('name'), kc = h.indexOf('kind');
  if (nc < 0 || kc < 0) return null;
  var L = function (c) { return colLetter_(c + 1); }, q = "'" + rec.getName() + "'!", N = q + L(nc) + '2:' + L(nc), K = q + L(kc) + '2:' + L(kc);
  var sh = sheet_(SHEETS.pairLists); if (!sh) { sh = SpreadsheetApp.getActive().insertSheet(SHEETS.pairLists); sh.hideSheet(); }
  sh.clear();
  sh.getRange(1, 1, 2, 2).setValues([['mains', 'sides'], ['=IFERROR(SORT(FILTER(' + N + ',' + N + '<>"",(' + K + '="main")+(' + K + '=""))),"")', '=IFERROR(SORT(FILTER(' + N + ',' + K + '="side")),"")']]);
  return sh;
}
function colLetter_(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

// onEdit on Pairings: a name picked from the dropdown fills its id, then the Recipes sides column is rewritten.
function pairingEdited_(sh, r0, n) {
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(norm_);
  var tR = table_(SHEETS.recipes); if (!tR) return;
  var byName = {}; tR.objects().forEach(function (r) { var k = nname_(r.name); if (k && str_(r.recipe_id) && !byName[k]) byName[k] = str_(r.recipe_id); });
  [['main_name', 'main_id'], ['side_name', 'side_id']].forEach(function (p) {
    var nc = headers.indexOf(p[0]), ic = headers.indexOf(p[1]); if (nc < 0 || ic < 0) return;
    for (var r = Math.max(2, r0); r < r0 + n; r++) {
      var name = sh.getRange(r, nc + 1).getValues()[0][0];
      sh.getRange(r, ic + 1).setValue(blank_(name) ? '' : (byName[nname_(name)] || ''));
    }
  });
  syncSides_();
}
// Recipes > sides = the Pairings rows grouped by main_id, as "s_rice, s_plantains".
function syncSides_() {
  var tR = table_(SHEETS.recipes), tP = table_(SHEETS.pairings); if (!tR || !tP || tR.col.sides == null) return;
  var by = groupPairings_(tP.objects());
  tR.objects().forEach(function (r) { var v = (by[str_(r.recipe_id)] || []).join(', '); if (str_(r.sides) !== v) tR.set(r._row, 'sides', v); });
}

// ---------------------------------------------------------------- applying phone changes

// Everything one request needs, read once.
function context_() {
  var log = ensureSheet_(SHEETS.log, LOG_HEADERS), idm = ensureSheet_(SHEETS.idmap, IDMAP_HEADERS);
  ensureColumns_(SHEETS.recipes, RECIPE_FETCH_HEADERS.concat(RECIPE_KIND_HEADERS), []);
  ensureColumns_(SHEETS.items, POSSIBLE_COLS, []);
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
  ensureSheet_(SHEETS.variants, VARIANT_HEADERS); ctx.variants = table_(SHEETS.variants);
  ctx.varRows = {}; ctx.variants.objects().forEach(function (r) { if (r.variant_id) (ctx.varRows[String(r.variant_id)] = ctx.varRows[String(r.variant_id)] || []).push(r); });
  ensureSheet_(SHEETS.learned, LEARNED_HEADERS); ctx.learned = table_(SHEETS.learned);
  ctx.learnRow = {}; ctx.learned.objects().forEach(function (r) { if (r.kind) ctx.learnRow[learnKey_(r.kind, r.key, r.value)] = r; });
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
  // errors and deferred changes are not logged, so a retry can apply them
  if (out.status !== 'error' && out.status !== 'deferred') { logChange_(ctx, ch, out.target, out.status, out.message); ctx.done[String(ch.id)] = { received_at: new Date(), result: out.status }; }
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
    if (byName) {
      addIdMap_(ctx, d.id, byName, 'item');
      // A possible ingredient that is already there: keep the sheet's row, and fill in the store if the sheet has none.
      var br = ctx.itemRow[byName];
      if (truthy_(d.possible) && str_(d.where) && ctx.items.col.where != null && blank_(cell_(ctx.items, br, 'where'))) { ctx.items.set(br._row, 'where', str_(d.where)); stampRow_(ctx.items, br._row); }
      return { status: 'applied', target: byName, message: d.name + ' is already in the sheet as ' + byName + '. Linked to it.' };
    }
    // Version 7: an ingredient from a recipe that Aldi doesn't sell. No price yet, so price, date and source stay blank.
    // A receipt price the phone folded into a queued item.add (its price, or an offer at another store) makes it ordinary.
    var poss = truthy_(d.possible) && !(+d.price > 0) && !(d.offers || []).some(function (o) { return +o.price > 0; });
    var base = String(d.id).replace(/^u_/, ''); if (!/^[a-z0-9_]+$/.test(base)) base = slug_(d.name) || 'item';
    var id = newId_(base, ctx.itemRow);
    var nums = (d.nums || []).filter(function (n) { return /^\d{4,8}$/.test(String(n)); });
    var row = ctx.items.append({
      item_id: id, name: d.name, category: d.cat || 'Other', package_label: d.pack || '', unit: d.unit || 'each', package_qty: d.pkg || 1,
      price: poss ? '' : d.price, price_source: poss ? '' : (d.src === 'estimate' ? 'estimate' : (d.src === 'receipt' ? 'receipt' : 'phone')),
      price_date: poss ? '' : (d.priceDate ? new Date(d.priceDate + 'T12:00:00') : new Date()),
      staple: d.staple ? 'Y' : 'N', storage: d.storage || '', fridge_days: d.fridge == null ? '' : d.fridge, freezer_days: d.freezer == null ? '' : d.freezer,
      pantry_days: d.pantry == null ? '' : d.pantry, family: d.family || '', sold_by: d.soldBy || 'pack', alt_sizes: '', tracking_default: d.tracking || '',
      aldi_product: d.aldi || '', aldi_numbers: nums.join('; '), retired: 'N', replaced_by: '',
      notes: poss ? 'From a recipe; not sold at Aldi' : d.src === 'receipt' ? (d.unsorted ? 'Added from a receipt; not placed in the tree yet' : 'Added from a receipt') : 'Added on the phone',
      possible: poss ? 'Y' : 'N', where: str_(d.where),
      last_changed: new Date(), changed_by: 'phone'
    });
    ctx.itemRow[id] = { _row: row, item_id: id, name: d.name, aldi_numbers: nums.join('; '), price: poss ? '' : d.price };
    if (ctx.items.col.brand != null && d.brand) ctx.items.set(row, 'brand', d.brand);
    if (ctx.items.col.flavor != null && d.flavor) ctx.items.set(row, 'flavor', d.flavor);
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
    return { status: 'applied', target: id, message: 'Added ' + d.name + ' as ' + id + (poss ? ' (a possible ingredient, no price yet)' : '') + '.' };
  },

  // Version 7: where to buy a possible ingredient, changed on the phone after it was added. data = {id, where}, base = {changed}?
  'item.where': function (ctx, d, base) {
    var id = resolve_(ctx, d.id), r = ctx.itemRow[id]; if (!r) return { status: 'rejected', target: id, message: 'No item ' + id + ' in the sheet.' };
    if (sheetEditedSince_(ctx.items, r, base && base.changed)) return { status: 'conflict', target: id, sheet: { where: str_(cell_(ctx.items, r, 'where')) }, message: (r.name || id) + ' was changed in the sheet. The sheet\'s store was kept.' };
    var w = str_(d.where).slice(0, 200);
    if (sameVal_(cell_(ctx.items, r, 'where'), w)) return { status: 'applied', target: id, message: (r.name || id) + ': store was already ' + (w || 'blank') + '.' };
    ctx.items.set(r._row, 'where', w); stampRow_(ctx.items, r._row);
    return { status: 'applied', target: id, message: (r.name || id) + ': where to buy it is now ' + (w || 'blank') + '.' };
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
    clearPossible_(ctx, id);
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

  // A brand or flavor of an item. data = {item, vid, brand, flavor}. Conflict if the vid is under another item.
  'variant.add': function (ctx, d) {
    var vid = str_(d.vid), item = resolve_(ctx, d.item);
    if (!vid) return { status: 'rejected', target: item, message: 'Variant without a vid.' };
    if (!ctx.itemRow[item]) return { status: 'rejected', target: item, message: 'No item ' + item + ' in the sheet.' };
    var rows = ctx.varRows[vid] || [];
    if (rows.length) {
      var owner = String(cell_(ctx.variants, rows[0], 'item_id'));
      if (owner !== item) return { status: 'conflict', target: item, sheet: { item: owner }, message: 'Variant ' + vid + ' is under ' + owner + ' in the sheet. The sheet was kept.' };
      rows.forEach(function (r) {   // fill blanks only: the sheet's own brand and flavor win
        if (d.brand && blank_(cell_(ctx.variants, r, 'brand'))) ctx.variants.set(r._row, 'brand', d.brand);
        if (d.flavor && blank_(cell_(ctx.variants, r, 'flavor'))) ctx.variants.set(r._row, 'flavor', d.flavor);
      });
      return { status: 'applied', target: item, message: vid + ' was already under ' + item + '.' };
    }
    var n = ctx.variants.append({ item_id: item, variant_id: vid, brand: str_(d.brand), flavor: str_(d.flavor), store: '', numbers: '', last_price: '', last_date: '', last_changed: new Date(), changed_by: 'phone' });
    ctx.varRows[vid] = [{ _row: n, variant_id: vid }];
    return { status: 'applied', target: item, message: 'Added ' + [d.brand, d.flavor].filter(Boolean).join(' ') + ' (' + vid + ') under ' + item + '.' };
  },

  // What a phone learned from receipts. data = {records: [[kind, key, value, count], ...]}, at most 50.
  // Merged by kind + key + value: count adds up, last_seen is the day it arrived.
  'learn.batch': function (ctx, d) {
    var recs = Array.isArray(d.records) ? d.records : [];
    if (!recs.length) return { status: 'rejected', target: 'learned', message: 'No records.' };
    if (recs.length > LEARN_MAX) return { status: 'rejected', target: 'learned', message: recs.length + ' records; at most ' + LEARN_MAX + ' in one change.' };
    var today = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'), added = 0, merged = 0, skipped = 0;
    recs.forEach(function (r) {
      var kind = str_(r && r[0]), key = str_(r && r[1]), value = str_(r && r[2]), n = Math.max(1, Math.round(num_(r && r[3]) || 1));
      if (LEARN_KINDS.indexOf(kind) < 0 || !key || !value || key.length > 200 || value.length > 200 || (kind !== 'number' && /\d{4,}/.test(key + ' ' + value))) { skipped++; return; }
      var k = learnKey_(kind, key, value), row = ctx.learnRow[k];
      if (row) { ctx.learned.set(row._row, 'count', (num_(cell_(ctx.learned, row, 'count')) || 0) + n); ctx.learned.set(row._row, 'last_seen', today); merged++; }
      else { var nr = ctx.learned.append({ kind: kind, key: key, value: value, count: n, last_seen: today }); ctx.learnRow[k] = { _row: nr, kind: kind, key: key, value: value }; added++; }
    });
    if (!added && !merged) return { status: 'rejected', target: 'learned', message: 'None of the ' + recs.length + ' records could be used.' };
    return { status: 'applied', target: 'learned', message: added + ' new, ' + merged + ' counted again' + (skipped ? ', ' + skipped + ' skipped' : '') + '.' };
  },

  // A store's item number for a variant. data = {vid, store, num}. Conflict if the number is on another variant at that store.
  'variant.number': function (ctx, d) {
    var vid = str_(d.vid), store = storeOf_(d), n = String(d.num || '').replace(/\D/g, '');
    var rows = ctx.varRows[vid]; if (!rows || !rows.length) return { status: 'rejected', target: vid, message: 'No variant ' + vid + ' in the sheet. Send variant.add first.' };
    if (!/^\d{4,14}$/.test(n)) return { status: 'rejected', target: vid, message: 'Number "' + d.num + '" isn\'t 4 to 14 digits.' };
    if (!ctx.storeIds[store]) return { status: 'rejected', target: vid, message: 'No store "' + store + '" on the Stores tab.' };
    for (var other in ctx.varRows) {
      var hit = ctx.varRows[other].some(function (r) { return String(cell_(ctx.variants, r, 'store')).toLowerCase() === store && nums_(cell_(ctx.variants, r, 'numbers')).indexOf(n) >= 0; });
      if (!hit) continue;
      if (other === vid) return { status: 'applied', target: vid, message: n + ' was already on ' + vid + ' at ' + store + '.' };
      return { status: 'conflict', target: vid, sheet: { vid: other }, message: 'Number ' + n + ' is on variant ' + other + ' at ' + store + ' in the sheet. The sheet was kept.' };
    }
    var first = rows[0], row = null;
    rows.forEach(function (r) { if (!row && String(cell_(ctx.variants, r, 'store')).toLowerCase() === store) row = r; });
    if (!row) rows.forEach(function (r) { if (!row && blank_(cell_(ctx.variants, r, 'store'))) row = r; });   // the row variant.add made
    if (row) {
      var cur = nums_(cell_(ctx.variants, row, 'numbers')); cur.push(n);
      ctx.variants.set(row._row, 'store', store); ctx.variants.set(row._row, 'numbers', cur.join('; ')); stampRow_(ctx.variants, row._row);
    } else {
      var nr = ctx.variants.append({ item_id: cell_(ctx.variants, first, 'item_id'), variant_id: vid, brand: cell_(ctx.variants, first, 'brand'), flavor: cell_(ctx.variants, first, 'flavor'),
        store: store, numbers: n, last_price: '', last_date: '', last_changed: new Date(), changed_by: 'phone' });
      rows.push({ _row: nr, variant_id: vid });
    }
    return { status: 'applied', target: vid, message: 'Added ' + store + ' number ' + n + ' to ' + vid + '.' };
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

  // Places or moves an item in the tree. data = {item, node}. Not a conflict if the sheet's node was blank or the
  // row was last changed by the phone; a conflict if the row was last edited in the sheet.
  'item.place': function (ctx, d) {
    var id = resolve_(ctx, d.item), node = resolve_(ctx, d.node), r = ctx.itemRow[id];
    if (!r) return { status: 'rejected', target: id, message: 'No item ' + id + ' in the sheet.' };
    if (!ctx.nodeRow[node]) return { status: 'rejected', target: id, message: 'No node ' + node + ' on the Nodes tab.' };
    if (ctx.items.col.node == null) return { status: 'error', target: id, message: 'Items has no "node" column. Run Meal Prep > Set up sheets and dropdowns.' };
    var now = str_(cell_(ctx.items, r, 'node'));
    if (now === node) return { status: 'applied', target: id, message: id + ' was already under ' + node + '.' };
    // Moving an item that already has a node: the sheet wins only if that row was last edited in the sheet.
    if (now && String(cell_(ctx.items, r, 'changed_by') || '') === 'sheet') return { status: 'conflict', target: id, sheet: { node: now }, message: (r.name || id) + ' is under ' + now + ' in the sheet. The sheet was kept.' };
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

  // 6.5: kind or "also good for breakfast" changed on a recipe sheet. data = {id, kind, alsoBreakfast}
  // An own recipe (u_…) the sheet hasn't got yet answers deferred: the phone keeps it and sends it again after recipe.add.
  'recipe.kind': function (ctx, d, base) {
    var raw = String(d.id || ''), id = resolve_(ctx, raw), r = ctx.recRow[id], kind = String(d.kind || '').toLowerCase();
    if (!r) return /^u_/.test(raw) ? { status: 'deferred', target: raw, message: raw + ' isn\'t in the sheet yet. Sent again after the recipe is added.' }
      : { status: 'rejected', target: id, message: 'No recipe ' + (id || '(no id)') + ' in the sheet.' };
    if (KINDS.indexOf(kind) < 0) return { status: 'rejected', target: id, message: 'Kind "' + d.kind + '" isn\'t one of ' + KINDS.join(', ') + '.' };
    if (base && base.changed && sheetEditedSince_(ctx.recipes, r, base.changed)) return { status: 'conflict', target: id, message: r.name + ' was changed in the sheet. The sheet\'s kind was kept.', sheet: { kind: kindOf_(cell_(ctx.recipes, r, 'kind')), alsoBreakfast: truthy_(cell_(ctx.recipes, r, 'also_breakfast')) } };
    ctx.recipes.set(r._row, 'kind', kind); ctx.recipes.set(r._row, 'also_breakfast', kind === 'main' && !!d.alsoBreakfast);
    stampRow_(ctx.recipes, r._row);
    return { status: 'applied', target: id, message: (str_(r.name) || id) + ' is now a ' + kind + (kind === 'main' && d.alsoBreakfast ? ', also good for breakfast' : '') + '.' };
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
  clearPossible_(ctx, id);
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

// Version 7: an item with a real price (offer.set, price.set, a priced item.add) is no longer a possible ingredient.
function clearPossible_(ctx, id) {
  var r = ctx.itemRow[id]; if (!r || ctx.items.col.possible == null || yn_(cell_(ctx.items, r, 'possible')) !== 'Y') return false;
  ctx.items.set(r._row, 'possible', 'N'); stampRow_(ctx.items, r._row); return true;
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
  // Photo and steps from "+ From the web". A new link without them is fetched again by Fetch photos and steps.
  var steps = (Array.isArray(d.steps) ? d.steps : []).map(cleanStep_).filter(String).slice(0, 80), photo = /^https:\/\/\S+$/i.test(cssSafeUrl_(d.photo)) ? cssSafeUrl_(d.photo) : '';
  if (steps.length) { fields.photo_url = photo; fields.steps = JSON.stringify(steps); fields.fetched_at = new Date(); fields.fetch_note = ''; }
  else if (existing && str_(existing.link) !== fields.link) { fields.photo_url = ''; fields.steps = ''; fields.fetched_at = ''; fields.fetch_note = ''; }
  else if (photo && !(existing && str_(existing.photo_url))) fields.photo_url = photo;
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
    if (key === norm_(SHEETS.pairings)) { pairingEdited_(sh, r0, n); return; }
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
    // A new link on Recipes: clear the fetched photo and steps so the next Fetch photos and steps reads the new page.
    if (key === norm_(SHEETS.recipes)) { var lk = headers.indexOf('link'); if (lk >= 0 && lk + 1 >= c0 && lk + 1 <= c1) clearFetched_(sh, headers, Math.max(2, r0), r0 + n - 1); }
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
    .addItem('Add starter household items', 'menuAddHousehold')
    .addItem('Suggest food types', 'menuSuggestFoodTypes')
    .addItem('Fetch photos and steps', 'menuFetchSteps')
    .addItem('Suggest pairings', 'menuSuggestPairings')
    .addItem('Mark staples and shelf life', 'menuStaples')
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
    : 'No errors. ' + b.warnings.length + ' warning(s) are listed in the "Data check" sheet. ' + (b.catalog ? b.catalog.items.length + ' items, ' + b.catalog.recipes.length + ' active recipes (' +
      KINDS.map(function (k) { return (kindCounts_(b.catalog.recipes)[k] || 0) + ' ' + k; }).join(', ') + ').' : ''));
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
  // Version 6.1: food types and household items
  ensureColumns_(SHEETS.items, HOUSE_COLS, notes);
  ensureListColumn_('food_type', FOOD_TYPES); ensureListColumn_('household_group', HOUSE_GROUPS);
  // Version 6.3: flavor on Items, and the Variants tab
  ensureColumns_(SHEETS.items, ['flavor'], notes);
  if (!sheet_(SHEETS.variants)) { ensureSheet_(SHEETS.variants, VARIANT_HEADERS); notes.push('Added the Variants tab.'); }
  var vn = colRange_(SHEETS.variants, 'numbers'); if (vn) vn.setNumberFormat('@');
  // Version 6.4: recipe photos and steps (Meal Prep > Fetch photos and steps)
  ensureColumns_(SHEETS.recipes, RECIPE_FETCH_HEADERS, notes);
  // Learning step 4: the Learned tab
  if (!sheet_(SHEETS.learned)) { ensureSheet_(SHEETS.learned, LEARNED_HEADERS); notes.push('Added the Learned tab.'); }
  var lk = colRange_(SHEETS.learned, 'key'); if (lk) lk.setNumberFormat('@'); var lv = colRange_(SHEETS.learned, 'value'); if (lv) lv.setNumberFormat('@');
  // Version 6.5: recipe kinds, also good for breakfast, and the Pairings tab
  ensureColumns_(SHEETS.recipes, RECIPE_KIND_HEADERS, notes);
  if (!sheet_(SHEETS.pairings)) { ensureSheet_(SHEETS.pairings, PAIRING_HEADERS); notes.push('Added the Pairings tab. Meal Prep > Suggest pairings proposes rows for it.'); }
  ensurePairingLists_(); syncSides_();
  // Version 7: possible ingredients (items Aldi doesn't sell) and where to buy them
  ensureColumns_(SHEETS.items, POSSIBLE_COLS, notes);

  // Each rule: [sheet, column, kind, source, help]. kind "list" = dropdown from a range ([sheet, column] of the source).
  // A rule whose column or source can't be found is skipped and named in the message, instead of stopping the setup.
  var IT = SHEETS.items, RE = SHEETS.recipes, IN = SHEETS.ingredients, CA = SHEETS.categories, AL = SHEETS.aliases, LI = SHEETS.lists;
  var YN = [LI, 'yes_no'];
  var specs = [
    [IT, 'category', 'list', [CA, 'category'], 'Pick a category from the Categories sheet.'],
    [IT, 'price_source', 'list', [LI, 'price_source']], [IT, 'staple', 'list', YN], [IT, 'retired', 'list', YN],
    [IT, 'storage', 'list', [LI, 'storage']], [IT, 'sold_by', 'list', [LI, 'sold_by']], [IT, 'tracking_default', 'list', [LI, 'tracking']],
    [IT, 'replaced_by', 'list', [IT, 'item_id']], [IT, 'changed_by', 'values', ['sheet', 'phone']],
    [IT, 'price', 'gte', 0, 'Price must be 0 or more. Leave it blank for a possible ingredient.'],
    [IT, 'possible', 'list', YN, 'Y: a recipe needs it but Aldi doesn\'t sell it, so it has no price yet. A price from the phone sets it back to N.'],
    [IT, 'where', 'any', null, 'Where to buy a possible ingredient (a store or website). Edited on the phone under Settings > Items.'], [IT, 'package_qty', 'gt', 0, 'Package amount must be more than 0.'],
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
    [SHEETS.variants, 'item_id', 'list', [IT, 'item_id']], [SHEETS.variants, 'store', 'list', [SHEETS.stores, 'id'], 'Blank until the variant has a number at a store.'],
    [SHEETS.stores, 'num_where', 'values', ['before', 'after']],
    [IT, 'food_types', 'formula', function (c) { return '=OR(' + c + '="",REGEXMATCH(LOWER(' + c + '),"^\\s*(' + FOOD_TYPES.join('|') + ')\\s*([;,]\\s*(' + FOOD_TYPES.join('|') + ')\\s*)*$"))'; },
      'What this food contains, from: ' + FOOD_TYPES.join(', ') + '. Separate several with semicolons, e.g. beef; dairy. Blank if none.'],
    [IT, 'group', 'values', HOUSE_GROUPS, 'Household items only: kitchen, paper, cleaning or personal. Leave blank for food.'],
    [IT, 'units_per_package', 'formula', function (c) { return '=OR(' + c + '="",AND(ISNUMBER(' + c + '),' + c + '>=1,INT(' + c + ')=' + c + '))'; }, 'Household items: how many rolls, bags or bottles come in one package (a whole number).'],
    [IT, 'typical_days', 'gt', 0, 'Household items: about how many days one unit lasts.'],
    [IT, 'scales_with_people', 'list', YN, 'Household items: Y if more people use it up faster.'],
    [RE, 'kind', 'values', KINDS, 'main, side, dessert, drink, snack or sauce. Blank is main.'],
    [RE, 'also_breakfast', 'checkbox', null, 'Ticked: this main also shows up when choosing a breakfast.'],
    [SHEETS.pairings, 'main_name', 'list', [SHEETS.pairLists, 'mains'], 'Pick a main. Its id fills in by itself.'],
    [SHEETS.pairings, 'side_name', 'list', [SHEETS.pairLists, 'sides'], 'Pick a side. Its id fills in by itself.']
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
    else if (x[2] === 'checkbox') b.requireCheckbox();
    else if (x[2] === 'any') { try { target.offset(-1, 0, 1).setNote(x[4]); n++; } catch (err) { skipped.push(x[0] + ' > ' + x[1] + ' (' + err.message + ')'); } return; }   // no rule, just a header note
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

/**
 * Meal Prep > Add starter household items. Adds the app's 27 starter household items (trash bags, paper towels,
 * soap and so on) to Items, with an estimated price. Skips any whose name is already there. Safe to run again.
 */
function menuAddHousehold() {
  var ui = SpreadsheetApp.getUi(), lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { ui.alert('The sheet is busy. Try again in a minute.'); return; }
  try { var r = addHousehold_(); ui.alert(r.added ? 'Added ' + r.added + ' household items' + (r.skipped ? ' (' + r.skipped + ' were already there)' : '') + '. Their prices are estimates: change them on ' + (migrated_() ? 'the Offers tab' : 'Items') + ' when you know the real ones.' + (r.notes.length ? '\n\n' + r.notes.join('\n') : '')
    : 'All ' + r.skipped + ' starter household items are already on Items.'); }
  finally { lock.releaseLock(); }
}
function addHousehold_() {
  var notes = [];
  ensureColumns_(SHEETS.items, ['brand', 'node', 'last_changed', 'changed_by'].concat(HOUSE_COLS), notes);
  // A Household category (so the Items category check passes) and a Household node.
  var tC = table_(SHEETS.categories);
  if (tC && !tC.objects().some(function (r) { return str_(r.category).toLowerCase() === HOUSE_CATEGORY.toLowerCase(); })) {
    tC.append({ category: HOUSE_CATEGORY, store_section: HOUSE_CATEGORY, storage: 'pantry', fridge_days: '', freezer_days: '', pantry_days: '', tracking_default: 'quantity', staple_default: 'N' });
    notes.push('Added the ' + HOUSE_CATEGORY + ' category.');
  }
  var tN = table_(SHEETS.nodes), node = 'n_household';
  if (tN && !tN.objects().some(function (r) { return str_(r.id) === node; })) tN.append({ id: node, name: HOUSE_CATEGORY, parent: '', level: 1, last_changed: new Date(), changed_by: 'sheet' });
  if (!tN) node = '';
  var tI = table_(SHEETS.items), mig = migrated_(), tO = mig ? table_(SHEETS.offers) : null;
  var names = {}, ids = {}; tI.objects().forEach(function (r) { names[nname_(r.name)] = 1; ids[str_(r.item_id)] = 1; });
  var today = new Date(Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd') + 'T12:00:00'), added = 0, skipped = 0;
  STARTER_HOUSE.forEach(function (s) {
    var name = s[1]; if (names[nname_(name)]) { skipped++; return; }
    var id = newId_(slug_(name), ids); ids[id] = 1;
    var pack = s[3] + ' ' + s[2] + (s[3] === 1 ? '' : (/(s|x|sh|ch)$/.test(s[2]) ? 'es' : 's'));
    var row = { item_id: id, name: name, category: HOUSE_CATEGORY, package_label: pack, unit: 'each', package_qty: s[3], staple: 'N', storage: 'pantry', sold_by: 'pack', retired: 'N',
      notes: 'Starter household item', node: node, group: s[0], unit_label: s[2], units_per_package: s[3], typical_days: s[4], scales_with_people: s[6] ? 'Y' : 'N',
      last_changed: new Date(), changed_by: 'sheet' };
    if (!mig) { row.price = s[5]; row.price_source = 'estimate'; row.price_date = today; }
    tI.append(row);
    if (tO) tO.append({ item: id, store: 'aldi', price: s[5], pack: pack, unit: 'each', pkg: s[3], numbers: '', price_date: today, price_source: 'estimate', last_changed: new Date(), changed_by: 'sheet' });
    added++;
  });
  return { added: added, skipped: skipped, notes: notes };
}

/**
 * Meal Prep > Suggest food types. Fills blank food_types cells from the item name (chicken -> poultry,
 * cheese -> dairy, pasta -> gluten ...). Never changes a cell that has something in it. Check the result:
 * it is a guess from the name, and labels can surprise you (e.g. soy in bread).
 */
var FOOD_WORDS = [
  ['poultry', /\b(chicken|turkey|wings?|drumsticks?)\b/], ['beef', /\b(beef|steak|sirloin|brisket|chuck|ribeye|hamburger|meatballs?)\b/],
  ['pork', /\b(pork|bacon|ham|sausage|kielbasa|chorizo|prosciutto|pepperoni|salami|carnitas)\b/],
  ['fish', /\b(fish|salmon|tuna|tilapia|cod|pollock|swai|anchov(y|ies)|sardines?|halibut|mahi|trout|catfish|dashi|bonito|worcestershire)\b/],
  ['shellfish', /\b(shrimp|crab|lobster|scallops?|clams?|mussels?|oysters?|crawfish)\b/],
  ['dairy', /\b(milk|cheese|cheddar|mozzarella|parmesan|brie|gruyere|feta|ricotta|mascarpone|yogurt|butter|buttermilk|cream|half half|ghee|whey|queso|alfredo)\b/],
  ['egg', /\b(eggs?|mayo|mayonnaise)\b/],
  ['gluten', /\b(bread|sourdough|baguette|bagels?|buns?|tortillas?|pasta|spaghetti|penne|macaroni|lasagna|fettuccine|rigatoni|ziti|linguine|rotini|tortellini|ravioli|angel hair|noodles?|lo mein|gnocchi|flour|crackers?|pita|naan|croutons|breadcrumbs|panko|couscous|barley|cereal|waffles?|biscuits?|pizza|seitan|orzo|ramen|udon|bisquick)\b/],
  ['peanut', /\b(peanuts?)\b/], ['tree_nut', /\b(almonds?|almondmilk|pecans?|walnuts?|cashews?|pistachios?|hazelnuts?|macadamia|pine nuts)\b/],
  ['soy', /\b(soy|tofu|edamame|tempeh|miso)\b/], ['sesame', /\b(sesame|tahini)\b/]
];
// Phrases that look like a food type but aren't (removed before matching), and "X free" labels.
var NOT_FOOD_WORDS = /\b(pasta sauce|pancake syrup|pancake mix|peanut butter|apple butter|butternut|butter beans?|cream of tartar|coconut (milk|cream)|(almond|oat|rice|soy|coconut) ?milk|eggplant|corn tortillas?|rice noodles?|corn masa flour|masa harina|corn flour|rice flour|almond flour|ham hock bone broth)\b/g;
function suggestFoodTypes_(name) {
  var n = nname_(name), out = [];
  var clean = n.replace(NOT_FOOD_WORDS, ' ');
  FOOD_WORDS.forEach(function (w) { if (w[1].test(clean)) out.push(w[0]); });
  if (/\bpeanut butter\b/.test(n)) out.push('peanut');
  if (/\balmond ?milk\b|\balmond flour\b/.test(n)) out.push('tree_nut');
  if (/\bsoy ?milk\b/.test(n)) out.push('soy');
  if (/\bsoy sauce\b/.test(n) && !/\b(tamari|gluten free)\b/.test(n)) out.push('gluten');
  ['gluten', 'dairy', 'egg', 'soy', 'peanut'].forEach(function (f) { if (new RegExp('\\b' + f + ' free\\b').test(n)) out = out.filter(function (x) { return x !== f; }); });
  if (/\b(dairy free|non dairy|plant based|vegan)\b/.test(n)) out = out.filter(function (x) { return x !== 'dairy' && x !== 'egg'; });
  return out.filter(function (x, i) { return out.indexOf(x) === i; });
}
function menuSuggestFoodTypes() {
  var ui = SpreadsheetApp.getUi(), notes = []; ensureColumns_(SHEETS.items, ['food_types'], notes);
  var r = suggestFoodTypes_all_();
  ui.alert(r.filled ? 'Filled in food types for ' + r.filled + ' items, from their names. Blank cells only; nothing you typed was changed.\n\nPlease look them over (sort or filter Items by food_types). ' + r.left + ' foods are still blank: that is right for most produce, drinks and spices.'
    : 'Nothing to fill: every food that looks like it contains something already has food types.');
}
function suggestFoodTypes_all_() {
  var t = table_(SHEETS.items), filled = 0, left = 0;
  t.objects().forEach(function (r) {
    if (!str_(r.item_id) || !blank_(r.food_types) || !blank_(r.group) || yn_(r.retired) === 'Y') return;
    var f = suggestFoodTypes_(r.name + ' ' + str_(r.aldi_product));
    if (f.length) { t.set(r._row, 'food_types', f.join('; ')); filled++; } else left++;
  });
  return { filled: filled, left: left };
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
