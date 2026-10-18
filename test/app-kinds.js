// The app's recipe kind rules (kindGuess and kind65 in the app source), lifted out of the page so the tests run
// against the same code the phone does. Like app-matcher.js, renaming these methods in the app breaks the tests.
const { read, loadScripts } = require('./load');
const APP = 'design/source/Meal Prep App Mobile v6.5.dc.html';
// The text of one class method, from its name to its matching closing brace.
function method(src, name) {
  const a = src.indexOf('\n  ' + name + '(');
  if (a < 0) throw new Error(`${name}() not found in ${APP}`);
  let i = src.indexOf('{', a), depth = 0;
  for (; i < src.length; i++) { const c = src[i]; if (c === '{') depth++; else if (c === '}' && --depth === 0) break; }
  return src.slice(a + 1, i + 1);
}
function appKinds() {
  const src = read(APP), window = loadScripts(['design/source/tools/cook-core.js']);
  const line = src.split('\n').find(l => l.startsWith('const isMainM='));
  if (!line) throw new Error(`isMainM not found in ${APP}`);
  return new Function('window', `${line}\nreturn {${method(src, 'kindGuess')},${method(src, 'kind65')}};`)(window);
}
module.exports = { appKinds, APP };
