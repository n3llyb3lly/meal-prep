// Meal Prep receipt parsers. Plain browser JavaScript, no imports. Loaded by the app (index.html) and
// tools/receipts-test.html. Defines window.ReceiptParsers = {version, detectStore(text), parse(text, store)}.
//
// Input can be typed text, CSV lines ("desc, qty, total, num"), or OCR text from a photo. OCR mistakes
// (O for 0, l/I for 1, S for 5, extra spaces, stray characters, broken lines) are corrected only where a
// number or a price is expected, never in descriptions.
//
// To add a store: add it to STORES below (item number length and whether it is printed before or after
// the description), add its name to NAMES for detectStore, and add a fixture in data/receipts/.
(function () {
  'use strict';
  var VERSION = '2026.10.1';

  var STORES = {
    aldi: { digits: [6], where: 'before' },
    sams: { digits: [9, 10], where: 'before' },
    walmart: { digits: [12], where: 'after' },
    cub: { digits: [11, 12], where: 'after' },
    target: { digits: [9], where: 'before' }
  };
  var NAMES = [
    ['sams', /sam['’`]?s\s*club|\bsams\s*club\b|samsclub/i],
    ['walmart', /wal\s*[\*\-]?\s*mart|walmart/i],
    ['aldi', /\baldi\b|aldi\.us/i],
    ['target', /\btarget\b|target\.com/i],
    ['cub', /\bcub\b|cub\.com|cubfoods/i]
  ];
  var DEPARTMENTS = /^(BAKERY|GROCERY|PRODUCE|DAIRY|MEAT|MEATS|SEAFOOD|DELI|FROZEN|FROZEN FOODS?|BEVERAGES?|HBC|HEALTH (AND|&) BEAUTY|GENERAL MERCHANDISE|GM|LIQUOR|WINE|BEER|FLORAL|NATURAL( FOODS)?|ORGANIC|BULK|PET|PETS|BABY|HOUSEHOLD|SNACKS|CANDY|REFRIGERATED|PHARMACY|PAPER|CLEANING|PERSONAL CARE|DELI\/BAKERY|MEAT\/SEAFOOD|ENTREES?|HOME|APPAREL|ELECTRONICS|TOYS)$/;

  // OCR letters that stand for digits, used only inside number and price positions.
  var DIGIT = { O: '0', o: '0', Q: '0', D: '0', '©': '0', '®': '0', l: '1', I: '1', '|': '1', i: '1', '!': '1', L: '1', S: '5', s: '5', B: '8', Z: '2', z: '2', G: '6', b: '6', g: '9', q: '9' };
  function fixDigits(s) { return String(s).replace(/[OoQD©®lI|i!LSsBZzGbgq]/g, function (c) { return DIGIT[c]; }); }
  function realDigits(s) { return (String(s).match(/\d/g) || []).length; }
  function r2(n) { return Math.round(n * 100) / 100; }
  function r3(n) { return Math.round(n * 1000) / 1000; }

  // A price-shaped token: 1-4 digits, a point or comma, 2 digits; optional $ in front, - before or after.
  var PRICE_RE = /^(-)?\$?([0-9OoQD©lI|i!SsBZz]{1,4})[.,]([0-9OoQD©lI|i!SsBZz]{2})(-)?$/;
  function priceOf(tok) {
    var m = PRICE_RE.exec(tok); if (!m) return null;
    if (realDigits(m[2] + m[3]) < 1) return null;
    var v = parseFloat(fixDigits(m[2]) + '.' + fixDigits(m[3])); if (isNaN(v)) return null;
    return (m[1] || m[4]) ? -v : v;
  }
  // A number-shaped token (item number, UPC, DPCI): mostly real digits, the rest OCR look-alikes.
  function numOf(tok, lens) {
    var t = String(tok).replace(/-/g, '');
    if (!/^[0-9OoQD©lI|i!SsBZzGbgq]+$/.test(t)) return null;
    if (lens.indexOf(t.length) < 0) return null;
    if (realDigits(t) < Math.ceil(t.length * (t.length >= 9 ? 0.4 : 0.6))) return null;  // long UPCs are often half zeros read as O
    return fixDigits(t);
  }
  var FLAG_RE = /^(?:[A-Z]{1,2}|[©®0]|\*)$/;

  // Pre-tidy a line: join split prices ("3 .69", "129 ,80", "3 . 66"), split "2.00-O" into "2.00-" "O".
  function tidy(line) {
    return String(line)
      .replace(/\t/g, ' ')
      .replace(/(\$?\b[0-9OoIlS]{1,4})\s*([.,])\s+([0-9OoIlS]{2})(?=\s|-|$)/g, '$1$2$3')
      .replace(/(\$?\b[0-9OoIlS]{1,4})\s+([.,])\s*([0-9OoIlS]{2})(?=\s|-|$)/g, '$1$2$3')
      .replace(/([0-9OoIlS][.,][0-9OoIlS]{2})-([A-Z0©]{1,2})\s*$/, '$1- $2')
      .replace(/\s+/g, ' ').trim();
  }
  // Leading OCR junk tokens: single stray characters.
  function dropJunk(toks) { while (toks.length && /^[|{}\[\]\\\/‘’'`~_!i•·:;,]$/.test(toks[0])) toks.shift(); return toks; }

  function parseDate(lines) {
    for (var i = 0; i < lines.length; i++) {
      var m = /\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/.exec(lines[i]);
      if (!m) continue;
      var mo = +m[1], d = +m[2], y = +m[3]; if (y < 100) y += 2000;
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100)
        return y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
    }
    return null;
  }
  function lastAmount(line) {
    var toks = tidy(line).split(' ');
    for (var i = toks.length - 1; i >= 0; i--) { var p = priceOf(toks[i]); if (p != null) return p; }
    return null;
  }
  function countOf(line) {
    var m = /#?\s*[I1l]TEMS\s*S[O0o]LD\s*([0-9OoIlSB]+)/i.exec(line) || /NUMBER\s*OF\s*[I1l]TEMS\s*([0-9OoIlSB]+)/i.exec(line) ||
            /^([0-9OoIlSB]{1,3})\s*[I1l]TEMS\b/i.exec(line) || /TOTAL\s*[I1l]TEMS\s*:?\s*([0-9OoIlSB]+)/i.exec(line);
    if (!m) return null; var n = parseInt(fixDigits(m[1]), 10); return isNaN(n) ? null : n;
  }
  var SUBTOTAL_RE = /^S\s*U\s*[BR8]\s*-?\s*T\s*[O0]\s*T\s*A\s*L\b/i;
  var TOTAL_RE = /^T\s*[O0]\s*T\s*A\s*L\b(?!\s*(TENDER|SAV|ITEMS|DISC))/i;
  var TAX_RE = /^(TAX\b|B-?\s*Taxable|.*\bTAX\s+[\d.]+\s*%|[A-Z]\s*=\s*.*TAX)/i;
  var PAY_RE = /^(CHANGE|CASH|VISA|MASTERCARD|DEBIT|CREDIT|DISCOVER|AMEX|EBT|TEND|PAYMENT|BALANCE|AMOUNT|APPR|REF|TERMINAL|TC#|AID|AUTH)/i;

  function emptyResult(store) { return { store: store || null, date: null, total: null, subtotal: null, tax: 0, count: null, sum: 0, items: [] }; }

  function parse(text, store) {
    try { return parseInner(text, store); }
    catch (e) { var r = emptyResult(store); r.error = String(e && e.message || e); return r; }
  }

  function parseInner(text, store) {
    var raw = String(text == null ? '' : text).replace(/\r/g, '').split('\n');
    var lines = raw.map(function (l) { return l.replace(/\s+$/, ''); }).filter(function (l) { return l.trim() !== ''; });
    store = store && STORES[store] ? store : (detectStore(text) || 'aldi');
    var S = STORES[store], res = emptyResult(store);
    res.date = parseDate(lines);
    var items = [], last = null, pending = null, inItems = true, afterSub = false, prevWasItem = false;

    function push(it) { items.push(it); last = it; prevWasItem = true; }
    function attachAmount(amount) { pending.amount = amount; push(pending); pending = null; }

    for (var li = 0; li < lines.length; li++) {
      var line = dropJunk(tidy(lines[li]).split(' ')).join(' ');
      var upper = line.toUpperCase();

      // CSV: "desc, qty, total[, num]" and "TOTAL,,amount"
      var csv = /^(.*?),\s*([0-9OoIlS.]*)\s*,\s*(-?\$?[0-9OoIlS]+[.,][0-9OoIlS]{2})\s*(?:,\s*([0-9OoIlS\-]{3,14}))?\s*$/.exec(line);
      if (csv) {
        var desc = csv[1].trim(), amt = priceOf(csv[3].replace('$', '')); if (amt == null) continue;
        if (/^T\s*[O0]\s*T\s*A\s*L$/i.test(desc)) { res.total = amt; continue; }
        if (SUBTOTAL_RE.test(desc)) { res.subtotal = amt; continue; }
        if (/^TAX/i.test(desc)) { res.tax = r2(res.tax + amt); continue; }
        var q = csv[2] ? parseFloat(fixDigits(csv[2])) : 1; var num = csv[4] ? fixDigits(csv[4].replace(/-/g, '')) : null;
        var weighed = q > 0 && Math.abs(q - Math.round(q)) > 1e-9;
        push({ text: desc, amount: amt, qty: q > 0 ? q : 1, num: num, weighed: weighed, perLb: weighed ? r2(amt / q) : null, discount: false, lines: 1 });
        continue;
      }

      if (SUBTOTAL_RE.test(upper)) { var st = lastAmount(line); if (st != null) res.subtotal = st; inItems = false; afterSub = true; pending = null; continue; }
      var cnt = countOf(line); if (cnt != null && /ITEM|TEM/i.test(line)) { res.count = cnt; continue; }
      if (TAX_RE.test(line) && !/^TAX\s*EXEMPT/i.test(line)) { var tx = lastAmount(line); if (tx != null) res.tax = r2(res.tax + tx); continue; }
      if (TOTAL_RE.test(upper)) { var tt = lastAmount(line); if (tt != null && res.total == null) res.total = tt; inItems = false; continue; }
      if (!inItems) continue;
      if (PAY_RE.test(upper)) { continue; }

      // Weighed: Aldi "(N) 1.82 lb x 0.85/lb", others "1.82 lb @ 0.85 /lb". "(G) ... (T) ..." lines are skipped.
      if (/^\(G\)/i.test(line)) continue;
      var wm = /^(?:\(N\)\s*)?([0-9OoIlS]+[.,][0-9OoIlS]+)\s*lbs?\s*[x@×]\s*\$?\s*([0-9OoIlS]+[.,][0-9OoIlS]+)\s*\/\s*lb/i.exec(line);
      if (wm) {
        var lbs = parseFloat(fixDigits(wm[1]).replace(',', '.')), per = parseFloat(fixDigits(wm[2]).replace(',', '.'));
        var target = pending || last;
        if (target && !isNaN(lbs)) { target.weighed = true; target.qty = lbs; target.perLb = per; var wa = lastAmount(line.replace(wm[0], '')); if (pending) attachAmount(wa != null ? wa : r2(lbs * per)); }
        continue;
      }
      // Quantity lines: "3 @ $4.99", "2 AT 1 FOR 11.82 23.64 O", "2 @ $1.99 ea"
      var qm = /^([0-9OoIlS]{1,3})\s*(?:@|AT)\s*(?:([0-9OoIlS]{1,2})\s*FOR\s*)?\$?([0-9OoIlS]+[.,][0-9OoIlS]{2})(?:\s*(?:ea|each|\/ea))?(?:\s+(\S+))?/i.exec(line);
      if (qm) {
        var n = parseInt(fixDigits(qm[1]), 10), each = parseFloat(fixDigits(qm[3]).replace(',', '.')), per2 = qm[2] ? parseInt(fixDigits(qm[2]), 10) : 1;
        var tgt = pending || last;
        if (tgt && n > 0) {
          tgt.qty = n;
          var amt2 = qm[4] ? priceOf(qm[4]) : null;
          if (pending) attachAmount(amt2 != null ? amt2 : r2(n * each / per2));
        }
        continue;
      }
      // Sam's instant savings: "INST SV 50CTHWEENMI 2.00-" -> subtract from the item with that description.
      var inst = /^INST\s*SV\s+(.+?)\s+(-?\$?[0-9OoIlS]+[.,][0-9OoIlS]{2}-?)(?:\s+\S{1,2})?$/i.exec(line);
      if (inst) {
        var off = priceOf(inst[2]); if (off == null) continue; off = Math.abs(off);
        var key = descKey(inst[1]), hit = null;
        for (var k = items.length - 1; k >= 0; k--) if (descKey(items[k].text) === key) { hit = items[k]; break; }
        hit = hit || last; if (hit) { hit.amount = r2(hit.amount - off); hit.discount = true; }
        continue;
      }

      var toks = dropJunk(line.split(' '));
      if (!toks.length) continue;
      // trailing flags, then a price, then (Walmart) flags before the price
      var t2 = toks.slice(), amount = null;
      while (t2.length && FLAG_RE.test(t2[t2.length - 1]) && priceOf(t2[t2.length - 1]) == null) t2.pop();
      // a number at the end of the tokens, possibly split by OCR into 2-3 pieces
      var tailNum = function (arr) {
        for (var take = 1; take <= 3 && take <= arr.length; take++) {
          var part = arr.slice(arr.length - take);
          if (take > 1 && !part.every(function (x) { return /^[0-9OoQDlISBZ]+$/.test(x); })) continue;
          var nn = numOf(part.join(''), S.digits); if (nn) return { num: nn, take: take };
        }
        return null;
      };
      if (t2.length && priceOf(t2[t2.length - 1]) != null) {
        amount = priceOf(t2.pop());
        // a flag between the item number and the price (Walmart "007874243019 F 3.58")
        if (S.where === 'after') { var t3 = t2.slice(); while (t3.length >= 2 && FLAG_RE.test(t3[t3.length - 1])) t3.pop(); if (t3.length < t2.length && tailNum(t3)) t2 = t3; }
      } else if (!(S.where === 'after' && tailNum(t2))) t2 = toks.slice();  // no price: keep stripped flags only if a number is now at the end

      // A line that is only a price: the end of a broken line.
      if (amount != null && !t2.length) { if (pending) attachAmount(amount); continue; }

      // Item number
      var num2 = null;
      if (S.where === 'before') {
        if (t2.length) { num2 = numOf(t2[0], S.digits); if (num2) t2.shift(); }
        else if (store === 'target' && t2.length > 2) { var j = numOf(t2.slice(0, 3).join(''), S.digits); if (j) { num2 = j; t2.splice(0, 3); } }
      } else {
        var tn = tailNum(t2); if (tn) { num2 = tn.num; t2.splice(t2.length - tn.take, tn.take); }
      }
      var desc2 = t2.join(' ').trim();

      if (amount != null && amount < 0 && !num2) {  // discount or coupon line: fold into the item above
        if (last) { last.amount = r2(last.amount + amount); last.discount = true; }
        continue;
      }
      if (amount != null && (num2 || desc2)) {
        if (!desc2 && !num2) continue;
        if (!num2 && !/[A-Za-z]/.test(desc2)) continue;
        pending = null;
        push({ text: desc2, amount: amount, qty: 1, num: num2, weighed: false, perLb: null, discount: false, lines: 1 });
        continue;
      }
      if (amount == null && num2 && desc2 && /[A-Za-z]/.test(desc2)) {  // item without its price yet (price on the next line)
        pending = { text: desc2, amount: 0, qty: 1, num: num2, weighed: false, perLb: null, discount: false, lines: 1 };
        prevWasItem = false; continue;
      }
      // Wrapped description (Cub): a words-only line right after an item
      if (amount == null && !num2 && (store === 'cub' || store === 'target') && prevWasItem && last && /^[A-Z0-9 &'\/.\-]+$/i.test(desc2) && !DEPARTMENTS.test(desc2.toUpperCase()) && !/[:#]/.test(desc2)) {
        last.text = (last.text + ' ' + desc2).trim(); continue;
      }
      prevWasItem = false;
    }

    // Merge: same number at the same unit price -> one line with qty and lines. Weighed items stay separate.
    var out = [], byKey = {};
    items.forEach(function (it) {
      it.amount = r2(it.amount);
      if (it.weighed) it.qty = r3(it.qty);
      var unit = it.qty > 0 ? r2(it.amount / it.qty) : it.amount;
      var key = it.num && !it.weighed ? it.num + '|' + unit.toFixed(2) + '|' + (it.discount ? 1 : 0) : null;
      if (key && byKey[key]) { var m = byKey[key]; m.qty += it.qty; m.amount = r2(m.amount + it.amount); m.lines += it.lines; return; }
      var copy = { text: it.text, amount: it.amount, qty: it.qty, num: it.num, weighed: !!it.weighed, perLb: it.perLb, discount: !!it.discount, lines: it.lines };
      if (key) byKey[key] = copy; out.push(copy);
    });
    res.items = out;
    res.sum = r2(out.reduce(function (a, x) { return a + x.amount; }, 0));
    if (res.total == null && res.subtotal != null) res.total = r2(res.subtotal + (res.tax || 0));
    return res;
  }

  // Description key for matching OCR'd descriptions against each other (Sam's instant savings).
  function descKey(s) { return String(s).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').replace(/S/g, '5').replace(/Z/g, '2').replace(/B/g, '8'); }

  function detectStore(text) {
    try {
      var lines = String(text == null ? '' : text).split(/\r?\n/).map(function (l) { return l.trim(); }).filter(String);
      var edge = lines.slice(0, 10).concat(lines.slice(-10)).join('\n');
      for (var i = 0; i < NAMES.length; i++) if (NAMES[i][1].test(edge)) return NAMES[i][0];
      var all = lines.join('\n');  // name printed in the middle (OCR often loses the first and last lines)
      for (var i2 = 0; i2 < NAMES.length; i2++) if (NAMES[i2][1].test(all)) return NAMES[i2][0];
      // No name: count item lines that fit each store's number pattern.
      var score = { aldi: 0, sams: 0, walmart: 0, cub: 0, target: 0 };
      lines.forEach(function (l) {
        var t = tidy(l);
        if (/^\d{6}\s+[A-Za-z]/.test(t)) score.aldi++;
        if (/^\d{9,10}\s+[A-Za-z0-9]/.test(t)) score.sams++;
        if (/^\d{3}-\d{2}-\d{4}\s+[A-Za-z]/.test(t)) score.target += 2;
        if (/[A-Za-z].*\s\d{12}\s+(?:[A-Z]{1,2}\s+)?\$?\d+\.\d\d/.test(t)) { if (/\$\d/.test(t)) score.cub++; else score.walmart++; }
        if (/[A-Za-z].*\s\d{11}\s+\$?\d+\.\d\d/.test(t)) score.cub++;
        var c = /,\s*(\d{4,14})\s*$/.exec(t); if (c) { var n = c[1].length; if (n === 6) score.aldi++; else if (n === 12) score.walmart++; else if (n === 9 || n === 10) score.sams++; }
      });
      var best = null, bs = 0; for (var k in score) if (score[k] > bs) { bs = score[k]; best = k; }
      return bs >= 2 ? best : null;
    } catch (e) { return null; }
  }

  var api = { version: VERSION, stores: STORES, detectStore: detectStore, parse: parse };
  if (typeof window !== 'undefined') window.ReceiptParsers = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
