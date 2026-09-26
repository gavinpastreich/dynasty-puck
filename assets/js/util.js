/* Dynasty Puck HQ - small utilities (formatting, DOM, storage, hash routing helpers). */
(function () {
  'use strict';
  var DP = window.DP = window.DP || {};
  var U = DP.U = {};

  U.esc = function (s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var esc = U.esc;
  U.fmt = function (x, d) {
    if (x === null || x === undefined || isNaN(x)) return '–';
    d = d === undefined ? 0 : d;
    return Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  U.m = function (x, d) { // $M
    if (x === null || x === undefined || isNaN(x)) return '–';
    d = d === undefined ? (Math.abs(x) >= 10 ? 1 : 2) : d;
    return (x < 0 ? '-$' : '$') + Math.abs(x).toFixed(d) + 'M';
  };
  U.sm = function (x, d) { return (x > 0 ? '+' : '') + U.m(x, d); };
  U.pct = function (x, d) { return x === null || x === undefined || isNaN(x) ? '–' : (x * 100).toFixed(d === undefined ? 0 : d) + '%'; };
  U.sgn = function (x, d) { if (x === null || x === undefined || isNaN(x)) return '–'; var s = U.fmt(x, d === undefined ? 1 : d); return x > 0 ? '+' + s : s; };
  U.ord = function (n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  U.rate = function (x) { return x === null || x === undefined ? '–' : x.toFixed(3).replace(/^0/, ''); };
  U.clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  U.season = function (s) { s = String(s); return s.slice(0, 4) + '-' + s.slice(6, 8); };
  U.date = function (d) { return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '–'; };
  U.qs = function (sel, root) { return (root || document).querySelector(sel); };
  U.qsa = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  U.debounce = function (fn, ms) { var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); }; };
  U.by = function (f, desc) { return function (a, b) { var x = f(a), y = f(b); return (x < y ? -1 : x > y ? 1 : 0) * (desc ? -1 : 1); }; };
  U.uniq = function (a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); };

  // storage (can throw in private mode / thumbnails): never rely on it
  U.store = {
    get: function (k, def) { try { var v = localStorage.getItem('dp_' + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } },
    set: function (k, v) { try { localStorage.setItem('dp_' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
    del: function (k) { try { localStorage.removeItem('dp_' + k); } catch (e) { /* ignore */ } }
  };

  // teams
  U.teamName = function (code) { return (DP.E && DP.E.teamName[code]) || code || 'Free agent'; };
  U.teamLabel = function (code) {
    if (!code) return '<span class="muted">FA</span>';
    var n = U.teamName(code);
    return '<span class="teamtag" title="' + esc(n + ' (' + code + ')') + '">' + esc(code) + '</span>';
  };
  U.teamOptions = function (sel, opts) {
    opts = opts || {};
    var h = opts.blank ? '<option value="">' + esc(opts.blank) + '</option>' : '';
    DP.meta.gms.forEach(function (g) {
      h += '<option value="' + esc(g.code) + '"' + (g.code === sel ? ' selected' : '') + '>' + esc(g.name + (g.name !== g.code ? ' (' + g.code + ')' : '')) + '</option>';
    });
    return h;
  };

  // CSV
  U.csv = function (rows, cols) {
    var q = function (v) { v = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return [cols.map(function (c) { return q(c.l); }).join(',')].concat(rows.map(function (r) {
      return cols.map(function (c) { var v = c.csv ? c.csv(r) : (c.v ? c.v(r) : r[c.k]); return q(typeof v === 'number' ? +v.toFixed(4) : v); }).join(',');
    })).join('\n');
  };
  U.download = function (name, text, type) {
    var blob = new Blob([text], { type: type || 'text/csv' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  U.parseCSV = function (text) { // RFC-4180-ish parser -> array of objects keyed by header
    var rows = [], row = [], f = '', q = false, i = 0, c;
    text = text.replace(/^﻿/, '');
    for (; i < text.length; i++) {
      c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += c;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    var hdr = rows.shift() || [];
    return rows.filter(function (r) { return r.length > 1; }).map(function (r) {
      var o = {}; hdr.forEach(function (h, j) { o[h.trim()] = (r[j] || '').trim(); }); return o;
    });
  };

  U.toast = function (msg, ms) {
    var t = U.qs('#toast');
    if (!t) return;
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(U._tt); U._tt = setTimeout(function () { t.style.display = 'none'; }, ms || 2600);
  };

  // copy text: async clipboard API, then the legacy execCommand path, and if both are blocked show the text to copy by hand
  U.copy = function (text, okMsg) {
    var legacy = function () {
      var ta = document.createElement('textarea'), ok = false;
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) U.toast(okMsg || 'Copied');
      else if (DP.ui && DP.ui.modal) DP.ui.modal('<h2>Copy this</h2><p class="small muted">Your browser blocked the clipboard. Select the text and copy it.</p><textarea readonly style="width:100%;min-height:140px">' + U.esc(text) + '</textarea>');
      else U.toast(text, 8000);
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { U.toast(okMsg || 'Copied'); }, legacy);
      else legacy();
    } catch (e) { legacy(); }
  };

  // hash routing: #/route?key=val&...
  U.parseHash = function () {
    var h = (location.hash || '#/').slice(1), qi = h.indexOf('?'), path = qi >= 0 ? h.slice(0, qi) : h, q = {};
    if (qi >= 0) h.slice(qi + 1).split('&').forEach(function (kv) { if (!kv) return; var p = kv.split('='); q[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' ')); });
    var parts = path.split('/').filter(Boolean);
    return { route: parts[0] || 'home', arg: parts[1] ? decodeURIComponent(parts[1]) : null, q: q };
  };
  U.hash = function (route, arg, q) {
    var s = '#/' + route + (arg ? '/' + encodeURIComponent(arg) : '');
    var keys = q ? Object.keys(q).filter(function (k) { return q[k] !== undefined && q[k] !== null && q[k] !== ''; }) : [];
    if (keys.length) s += '?' + keys.map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(q[k]); }).join('&');
    return s;
  };
  U.setQuery = function (q) { // update the query part of the current route without re-rendering
    var cur = U.parseHash(), nq = Object.assign({}, cur.q, q);
    history.replaceState(null, '', U.hash(cur.route, cur.arg, nq));
  };
})();
