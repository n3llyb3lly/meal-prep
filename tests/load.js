// Loads the browser scripts into a fake window, the way index.html does, without a browser.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
function loadScripts(files) {
  const window = {}; window.window = window; window.self = window;
  const ctx = vm.createContext(window);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return window;
}
const exists = f => fs.existsSync(path.join(ROOT, f));
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
module.exports = { loadScripts, exists, read, ROOT };
