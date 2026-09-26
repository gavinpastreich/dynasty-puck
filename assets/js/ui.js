/* Dynasty Puck HQ - shared UI components: sortable/searchable tables, tooltips, labels, modal. */
(function () {
  'use strict';
  var DP = window.DP = window.DP || {};
  var U = DP.U, esc = U.esc;
  var ui = DP.ui = {};

  // ---------------------------------------------------------------- labels
  ui.pill = function (ct) { return ct ? '<span class="pill ' + esc(ct) + '">' + esc(ct) + '</span>' : ''; };
  ui.pos = function (p) { return '<span class="pos">' + esc(p.fd ? 'F/D' : p.pos) + '</span>'; };
  ui.plink = function (p, label) {
    if (!p) return '';
    return '<a class="plink" href="#/player/' + encodeURIComponent(p.id) + '" data-pid="' + esc(p.id) + '">' + esc(label || p.n) + '</a>';
  };
  ui.pcell = function (p, opts) { // name + small context line
    opts = opts || {};
    var sub = [];
    if (opts.team !== false) sub.push(esc(p.t || ''));
    if (opts.age !== false && p.age) sub.push(Math.floor(p.age) + 'y');
    if (p.wv) sub.push('<span class="pill W" title="On waivers">W</span>');
    return ui.plink(p) + ' <span class="faint small">' + sub.join(' · ') + '</span>';
  };
  ui.owner = function (p) { return p.gm ? U.teamLabel(p.gm) : (p.wv ? '<span class="pill W">Waivers</span>' : '<span class="muted">FA</span>'); };
  ui.warCell = function (x) {
    var cls = x >= 8 ? 'good' : x >= 2 ? '' : x < 0 ? 'bad' : 'muted';
    return '<span class="' + cls + '">' + U.fmt(x, 1) + '</span>';
  };
  ui.delta = function (x, d, good) { // colored signed number; good = +1 if up is good
    if (x === null || x === undefined || isNaN(x)) return '–';
    var g = (good || 1) * x;
    return '<span class="' + (g > 0.0001 ? 'good' : g < -0.0001 ? 'bad' : 'muted') + '">' + U.sgn(x, d) + '</span>';
  };
  ui.meter = function (frac, cls, title) {
    return '<div class="meter ' + (cls || '') + '"' + (title ? ' title="' + esc(title) + '"' : '') + '><span style="width:' + (U.clamp(frac, 0, 1) * 100).toFixed(1) + '%"></span></div>';
  };
  ui.gradeOf = function (pctile) { // 0..1 -> letter
    return pctile >= .9 ? 'A+' : pctile >= .78 ? 'A' : pctile >= .64 ? 'B+' : pctile >= .5 ? 'B' : pctile >= .36 ? 'C+' : pctile >= .22 ? 'C' : pctile >= .1 ? 'D' : 'F';
  };
  ui.teamSelect = function (id, sel, blank) {
    return '<select id="' + esc(id) + '" aria-label="Team">' + U.teamOptions(sel, { blank: blank }) + '</select>';
  };
  ui.needTeam = function (el, what) {
    el.innerHTML = '<div class="callout">Pick your team to see ' + esc(what || 'this page') + '. <button class="btn sm primary" data-act="pick-team">Choose team</button></div>';
  };

  // ---------------------------------------------------------------- tooltip (delegated, for any [data-tip])
  var tipEl;
  function tipShow(e, html) {
    if (!tipEl) tipEl = U.qs('#tip');
    if (!tipEl) return;
    tipEl.innerHTML = html; tipEl.style.display = 'block';
    var x = e.clientX + 14, y = e.clientY + 14, w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - 14;
    tipEl.style.left = Math.max(4, x) + 'px'; tipEl.style.top = Math.max(4, y) + 'px';
  }
  ui.tipShow = tipShow;
  ui.tipHide = function () { if (tipEl) tipEl.style.display = 'none'; };
  document.addEventListener('pointerover', function (e) {
    var t = e.target.closest && e.target.closest('[data-tip]');
    if (t) tipShow(e, t.getAttribute('data-tip'));
  });
  document.addEventListener('pointermove', function (e) {
    var t = e.target.closest && e.target.closest('[data-tip]');
    if (t) tipShow(e, t.getAttribute('data-tip'));
  });
  document.addEventListener('pointerout', function (e) {
    var t = e.target.closest && e.target.closest('[data-tip]');
    if (t && !(e.relatedTarget && t.contains(e.relatedTarget))) ui.tipHide();
  });
  document.addEventListener('focusin', function (e) {
    var t = e.target.closest && e.target.closest('[data-tip]');
    if (t) { var r = t.getBoundingClientRect(); tipShow({ clientX: r.right, clientY: r.top }, t.getAttribute('data-tip')); }
  });
  document.addEventListener('focusout', ui.tipHide);
  ui.tip = function (value, label) { return '<div class="tv">' + value + '</div>' + (label ? '<div class="tl">' + label + '</div>' : ''); };

  // ---------------------------------------------------------------- table
  // cols: [{k, l, v(row)->sort value, f(row)->html, cls, title, csv(row), hide}]
  ui.table = function (el, o) {
    var st = { sort: o.sort || null, desc: o.desc !== undefined ? o.desc : true, q: '', f: {}, shown: o.page || 60 };
    (o.filters || []).forEach(function (f, i) { st.f[i] = f.def || ''; });
    var id = 't' + Math.random().toString(36).slice(2, 8);
    var tools = '';
    if (o.search || o.filters || o.csv || o.extra) {
      tools = '<div class="tbl-tools">';
      if (o.search) tools += '<input type="search" placeholder="' + esc(o.searchPh || 'Search…') + '" aria-label="Search table" data-r="q">';
      (o.filters || []).forEach(function (f, i) {
        tools += '<label class="small muted">' + esc(f.l) + ' <select data-r="f' + i + '" aria-label="' + esc(f.l) + '">' +
          f.opts.map(function (op) { return '<option value="' + esc(op[0]) + '"' + (op[0] === (f.def || '') ? ' selected' : '') + '>' + esc(op[1]) + '</option>'; }).join('') + '</select></label>';
      });
      tools += '<span class="grow"></span>' + (o.extra || '') + '<span class="small muted" data-r="count"></span>';
      if (o.csv) tools += '<button class="btn sm" data-r="csv" title="Download as CSV">⬇ CSV</button>';
      tools += '</div>';
    }
    el.innerHTML = tools + '<div class="tbl-wrap"' + (o.maxH ? ' style="max-height:' + o.maxH + 'px;overflow:auto"' : '') + '><table class="t' + (o.cls ? ' ' + o.cls : '') + '" id="' + id + '"><thead><tr></tr></thead><tbody></tbody></table></div><div class="tbl-more"></div>';
    var table = U.qs('#' + id, el), thead = U.qs('thead tr', table), tbody = U.qs('tbody', table), more = U.qs('.tbl-more', el);
    function hdr() {
      thead.innerHTML = o.cols.map(function (c, i) {
        var sortable = c.v !== null && c.sortable !== false;
        var cls = [c.cls || '', sortable ? 'sortable' : '', st.sort === c.k ? 'sorted' : ''].join(' ');
        var arrow = st.sort === c.k ? (st.desc ? ' ▾' : ' ▴') : '';
        return '<th class="' + cls + '" data-i="' + i + '"' + (c.title ? ' title="' + esc(c.title) + '"' : '') + (sortable ? ' tabindex="0" aria-sort="' + (st.sort === c.k ? (st.desc ? 'descending' : 'ascending') : 'none') + '"' : '') + '>' + esc(c.l) + arrow + '</th>';
      }).join('');
    }
    function val(c, r) { return c.v ? c.v(r) : r[c.k]; }
    function filtered() {
      var rows = o.rows.slice(), q = st.q.toLowerCase();
      if (q && o.search) rows = rows.filter(function (r) { return o.search(r).toLowerCase().indexOf(q) >= 0; });
      (o.filters || []).forEach(function (f, i) { if (st.f[i] !== '') rows = rows.filter(function (r) { return f.fn(r, st.f[i]); }); });
      if (st.sort) {
        var c = o.cols.find(function (x) { return x.k === st.sort; });
        if (c) rows.sort(function (a, b) {
          var x = val(c, a), y = val(c, b);
          if (x === null || x === undefined || (typeof x === 'number' && isNaN(x))) return 1;
          if (y === null || y === undefined || (typeof y === 'number' && isNaN(y))) return -1;
          var r = typeof x === 'string' ? x.localeCompare(y) : x - y;
          return st.desc ? -r : r;
        });
      }
      return rows;
    }
    var api = { rows: null };
    function body() {
      var rows = filtered(); api.rows = rows;
      var shown = rows.slice(0, st.shown), h = '';
      for (var i = 0; i < shown.length; i++) {
        var r = shown[i], rc = o.rowCls ? o.rowCls(r, i) : '';
        h += '<tr' + (rc ? ' class="' + rc + '"' : '') + '>';
        for (var j = 0; j < o.cols.length; j++) {
          var c = o.cols[j], v = c.f ? c.f(r, i) : esc(val(c, r));
          h += '<td' + (c.cls ? ' class="' + c.cls + '"' : '') + '>' + (v === undefined || v === null ? '' : v) + '</td>';
        }
        h += '</tr>';
      }
      if (!rows.length) h = '<tr><td colspan="' + o.cols.length + '" class="muted">' + esc(o.empty || 'Nothing to show.') + '</td></tr>';
      tbody.innerHTML = h;
      more.innerHTML = rows.length > st.shown ? '<button class="btn sm">Show more (' + (rows.length - st.shown) + ' left)</button>' : '';
      var cnt = U.qs('[data-r=count]', el);
      if (cnt) cnt.textContent = rows.length + ' rows';
      if (o.onRender) o.onRender(rows);
    }
    thead.addEventListener('click', function (e) {
      var th = e.target.closest('th'); if (!th) return;
      var c = o.cols[+th.dataset.i]; if (!c || c.v === null || c.sortable === false) return;
      if (st.sort === c.k) st.desc = !st.desc; else { st.sort = c.k; st.desc = c.asc ? false : true; }
      hdr(); body();
    });
    thead.addEventListener('keydown', function (e) { if (e.key === 'Enter') e.target.click(); });
    more.addEventListener('click', function () { st.shown += o.page || 60; body(); });
    el.addEventListener('input', function (e) {
      var r = e.target.dataset && e.target.dataset.r;
      if (r === 'q') { st.q = e.target.value; st.shown = o.page || 60; body(); }
    });
    el.addEventListener('change', function (e) {
      var r = e.target.dataset && e.target.dataset.r;
      if (r && r[0] === 'f') { st.f[+r.slice(1)] = e.target.value; st.shown = o.page || 60; body(); }
    });
    el.addEventListener('click', function (e) {
      if (e.target.dataset && e.target.dataset.r === 'csv') {
        var cols = o.cols.filter(function (c) { return c.csv !== false; });
        U.download(o.csv, U.csv(filtered(), cols.map(function (c) { return { l: c.l, v: function (r) { return c.csv ? c.csv(r) : val(c, r); } }; })));
      }
    });
    hdr(); body();
    api.update = function (rows) { if (rows) o.rows = rows; body(); };
    return api;
  };

  // ---------------------------------------------------------------- modal
  ui.modal = function (html) {
    var bg = U.qs('#modal-bg'), body = U.qs('#modal-body');
    body.innerHTML = html; bg.classList.add('open'); bg.scrollTop = 0;
    document.body.style.overflow = 'hidden';
    setTimeout(function () { var b = U.qs('#modal-close'); if (b) b.focus(); }, 30);
    return body;
  };
  ui.closeModal = function () {
    U.qs('#modal-bg').classList.remove('open'); document.body.style.overflow = '';
    ui.tipHide();
  };
})();
