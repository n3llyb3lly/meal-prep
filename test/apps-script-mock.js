// A small in-memory stand-in for the Apps Script services design/sheets/Code.gs uses, enough to run its
// change handlers and catalog build in node. Sheets are arrays of rows; row 1 is the header.
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');

function makeSheet(name, rows) {
  const data = rows.map(r => r.slice());
  const width = () => Math.max(0, ...data.map(r => r.length));
  const pad = () => { const w = width(); data.forEach(r => { while (r.length < w) r.push(''); }); };
  const range = (r, c, nr = 1, nc = 1) => ({
    getValues: () => { pad(); return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => ((data[r - 1 + i] || [])[c - 1 + j] ?? ''))); },
    setValue: v => { while (data.length < r) data.push([]); const row = data[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; pad(); return range(r, c, nr, nc); },
    setValues: vs => { vs.forEach((vr, i) => vr.forEach((v, j) => range(r + i, c + j).setValue(v))); return range(r, c, nr, nc); },
    setFontWeight: () => range(r, c, nr, nc), setNumberFormat: () => range(r, c, nr, nc), setDataValidation: () => {},
    getA1Notation: () => String.fromCharCode(64 + c) + r
  });
  return {
    _data: data, getName: () => name,
    getDataRange: () => { pad(); return range(1, 1, data.length, width()); },
    getRange: range, getLastColumn: () => width(), getLastRow: () => data.length, getMaxRows: () => Math.max(1000, data.length),
    appendRow: row => { data.push(row.slice()); pad(); }, setFrozenRows: () => {}, hideSheet: () => {},
    getProtections: () => [1], protect: () => ({ setWarningOnly: () => ({ setDescription: () => {} }) })
  };
}

function loadCodeGs(tabs) {
  const sheets = Object.entries(tabs).map(([n, rows]) => makeSheet(n, rows));
  const ss = {
    getSheetByName: n => sheets.find(s => s.getName() === n) || null, getSheets: () => sheets,
    insertSheet: n => { const s = makeSheet(n, []); sheets.push(s); return s; }, getSpreadsheetTimeZone: () => 'UTC'
  };
  const props = {};
  const g = {
    SpreadsheetApp: { getActive: () => ss, flush: () => {}, ProtectionType: { SHEET: 'SHEET' } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Utilities: {
      formatDate: (d, tz, f) => f === 'yyyy-MM-dd' ? d.toISOString().slice(0, 10) : d.toISOString(),
      computeDigest: (a, t) => [...crypto.createHash('sha256').update(t).digest()].map(b => (b > 127 ? b - 256 : b)),
      DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 }
    },
    ContentService: { createTextOutput: t => ({ setMimeType: () => ({ text: t }) }), MimeType: { JSON: 1 } },
    Logger: { log: () => {} }, console
  };
  const ctx = vm.createContext(g);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'design/sheets/Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });
  return { g: ctx, ss, sheet: n => ss.getSheetByName(n), props };
}
module.exports = { loadCodeGs };
