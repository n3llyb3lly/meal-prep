// node --test: Meal Prep > Mark staples and shelf life (design/sheets/Code.gs, 6.6). Cooking basics stored in the
// pantry become staples; blank pantry_days on shelf-stable food get the FirstCore.shelfGuess days; nothing else moves.
const test = require('node:test'), assert = require('node:assert');
const { loadCodeGs } = require('./apps-script-mock');
const plain = x => JSON.parse(JSON.stringify(x));

const H = ['item_id', 'name', 'category', 'staple', 'storage', 'fridge_days', 'pantry_days', 'retired', 'group', 'last_changed', 'changed_by'];
const rows = [
  ['olive_oil', 'Extra virgin olive oil', 'Pantry', 'N', 'pantry', '', 180, 'N', ''],
  ['canola_spray', 'Canola oil cooking spray', 'Pantry', '', '', '', '', 'N', ''],
  ['kosher_salt', 'Kosher salt', 'Pantry', 'N', 'pantry', '', 365, 'N', ''],
  ['pepper', 'Ground black pepper', 'Pantry', 'N', 'pantry', '', '', 'N', ''],
  ['baking_soda', 'Baking soda', 'Pantry', 'N', 'pantry', '', 365, 'N', ''],
  ['vanilla', 'Pure vanilla extract', 'Pantry', 'Y', 'pantry', '', 365, 'N', ''],
  ['honey', 'Honey', 'Pantry', 'Y', 'pantry', '', 365, 'N', ''],
  ['garlic', 'Garlic', 'Produce', 'N', 'pantry', '', 90, 'N', ''],
  ['onion', 'Yellow onions', 'Produce', 'N', 'pantry', '', 30, 'N', ''],
  ['fresh_basil', 'Fresh basil', 'Produce', 'N', 'fridge', 7, '', 'N', ''],
  ['chips', 'Salt & vinegar chips', 'Snacks', 'N', 'pantry', '', '', 'N', ''],
  ['snap_peas', 'Sugar snap peas', 'Produce', 'N', 'fridge', 5, '', 'N', ''],
  ['tortillas', 'Flour tortillas', 'Bakery', 'N', 'pantry', 21, 7, 'N', ''],
  ['tuna', 'Chunk light tuna in water', 'Pantry', 'N', 'pantry', '', '', 'N', ''],
  ['marinara', 'Marinara sauce', 'Pantry', 'N', 'pantry', '', '', 'N', ''],
  ['seltzer', 'Sparkling water, lime', 'Drinks', 'N', 'pantry', '', '', 'N', ''],
  ['summer_sausage', 'Summer sausage', 'Deli', 'N', 'pantry', '', '', 'N', ''],
  ['crackers', 'Saltine crackers', 'Snacks', 'N', 'pantry', '', '', 'N', ''],
  ['penne', 'Penne rigate', 'Pantry', 'N', 'pantry', '', '', 'N', ''],
  ['rice', 'Jasmine rice', 'Pantry', 'N', 'pantry', '', 180, 'N', ''],
  ['ravioli', 'Fresh cheese ravioli', 'Deli', 'N', 'fridge', '', '', 'N', ''],
  ['mystery', 'Trader thing', 'Pantry', 'N', 'pantry', '', '', 'N', ''],
  ['old_salt', 'Sea salt', 'Pantry', 'N', 'pantry', '', '', 'Y', ''],
  ['dish_soap', 'Dish soap', 'Household', 'N', 'pantry', '', '', 'N', 'kitchen']
];
const tabs = () => ({ Items: [H, ...rows.map(r => r.concat(['', '']))], Categories: [['category', 'storage'], ['Pantry', 'pantry'], ['Produce', 'fridge']] });

test('staplePlan_ marks pantry cooking basics and fills blank shelf life, and nothing else', () => {
  const { g } = loadCodeGs(tabs());
  const plan = plain(g.staplePlan_()).map(p => [p.id, p.field, p.to]);
  assert.deepStrictEqual(plan, [
    ['olive_oil', 'staple', 'Y'],
    ['canola_spray', 'staple', 'Y'],
    ['kosher_salt', 'staple', 'Y'],
    ['pepper', 'staple', 'Y'],
    ['baking_soda', 'staple', 'Y'],
    ['tuna', 'pantry_days', 365],
    ['marinara', 'pantry_days', 180],
    ['seltzer', 'pantry_days', 180],
    ['summer_sausage', 'pantry_days', 60],
    ['crackers', 'pantry_days', 90],
    ['penne', 'pantry_days', 365]
  ]);
});

test('shelfGuess_ follows the FirstCore table and leaves unsure names blank', () => {
  const { g } = loadCodeGs({});
  const cases = { 'Canned tuna': 365, 'Black beans': 365, 'Diced tomatoes': 365, 'Marinara sauce': 180, 'Pasta sauce, tomato basil': 180,
    'Dry spaghetti': 365, 'Long-grain rice': 365, 'Sparkling water': 180, 'Apple juice': 180, 'Graham crackers': 90, 'Chewy granola bars': 90,
    'Summer sausage': 60, 'Beef sticks': 60, 'Evaporated milk': 365, 'Whole milk': null, 'Fresh ravioli': null, 'Rice vinegar': null,
    'Corn tortillas': null, 'Kombucha': null, 'Bananas': null, 'Baking soda': null };
  for (const [name, days] of Object.entries(cases)) assert.strictEqual(g.shelfGuess_(name), days, name);
});

test('the menu writes the plan and stamps the rows', () => {
  const { g, sheet } = loadCodeGs(tabs());
  const ui = { alert: (t, m, b) => (b ? 'YES' : undefined), ButtonSet: { YES_NO: 1 }, Button: { YES: 'YES' } };
  g.SpreadsheetApp.getUi = () => ui;
  g.menuStaples();
  const data = sheet('Items')._data, h = data[0], row = id => data.find(r => r[0] === id), at = (id, k) => row(id)[h.indexOf(k)];
  assert.strictEqual(at('olive_oil', 'staple'), 'Y');
  assert.strictEqual(at('tuna', 'pantry_days'), 365);
  assert.strictEqual(at('tuna', 'changed_by'), 'sheet', 'a menu change counts as a sheet edit');
  assert.strictEqual(at('garlic', 'staple'), 'N');
  assert.strictEqual(at('mystery', 'pantry_days'), '');
  assert.strictEqual(sheet('Staple changes')._data.length, 12, 'header plus 11 changes');
});
