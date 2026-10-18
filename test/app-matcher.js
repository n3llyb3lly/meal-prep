// The item matcher the app uses for receipt lines (fuzzy() in the app source), lifted out of the page so the
// recipe import tests run against the same code the phone does, not a copy of it.
const { read } = require('./load');
const APP = 'design/source/Meal Prep App Mobile v6.3.dc.html';
function appFuzzy() {
  const src = read(APP);
  const a = src.indexOf('const STOPW='), b = src.indexOf('\nfunction parseReceipt(t)');
  if (a < 0 || b < a) throw new Error(`fuzzy() not found in ${APP}`);
  return new Function(src.slice(a, b) + '\n;return fuzzy;')();
}
module.exports = { appFuzzy, APP };
