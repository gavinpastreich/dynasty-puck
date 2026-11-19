/* Dynasty Puck HQ - share a recap, a scoreboard or a trade as a picture for the group chat. Drawn on a canvas in the
   browser (no library, nothing uploaded): a preview opens with Download and, on phones, Share. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, esc = U.esc;
  var W = 1080, PAD = 56, FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function badge(ctx, code, x, y, s) {
    ctx.fillStyle = U.teamColor(code); rr(ctx, x, y, s, s, s * 0.26); ctx.fill();
    var ab = U.teamAbbr(code); ctx.fillStyle = '#fff'; ctx.font = '800 ' + Math.round(s * (ab.length > 2 ? 0.34 : 0.42)) + 'px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ab, x + s / 2, y + s / 2 + 1); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
  function fit(ctx, text, max) { text = String(text); if (ctx.measureText(text).width <= max) return text; while (text.length > 1 && ctx.measureText(text + '…').width > max) text = text.slice(0, -1); return text + '…'; }
  // spec: { title, sub, accent, rows: [{ kind: 'head', text } | { kind: 'game', a, b, sa, sb, win, note } | { kind: 'team', t, text, right } | { kind: 'text', text, muted }], foot }
  function wrap(ctx, text, max) { // words onto lines no wider than max
    var out = [], line = '';
    String(text).split(/\s+/).forEach(function (w) { var t = line ? line + ' ' + w : w; if (line && ctx.measureText(t).width > max) { out.push(line); line = w; } else line = t; });
    if (line) out.push(line);
    return out;
  }
  DP.drawCard = function (spec) {
    var H = { head: 66, game: 74, team: 60, text: 40 }, h = PAD + 118 + (spec.sub ? 34 : 0);
    var mctx = document.createElement('canvas').getContext('2d'); mctx.font = '400 27px ' + FONT;
    spec.rows.forEach(function (r) { if (r.kind === 'text') r._lines = wrap(mctx, r.text, W - 2 * PAD).slice(0, 3); });
    spec.rows.forEach(function (r) { h += r.kind === 'text' ? 40 * r._lines.length + 6 : H[r.kind] || 44; });
    h += 96;
    var cv = document.createElement('canvas'); cv.width = W; cv.height = h;
    var ctx = cv.getContext('2d'), acc = spec.accent || '#f0883e';
    var g = ctx.createLinearGradient(0, 0, W, h); g.addColorStop(0, '#161b22'); g.addColorStop(1, '#0d1117');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, h);
    var g2 = ctx.createLinearGradient(0, 0, W, 0); g2.addColorStop(0, acc); g2.addColorStop(1, '#a371f7');
    ctx.fillStyle = g2; ctx.fillRect(0, 0, W, 10);
    var y = PAD + 30;
    ctx.fillStyle = '#8b949e'; ctx.font = '700 24px ' + FONT; ctx.fillText('DYNASTY PUCK HQ', PAD, y);
    y += 56; ctx.fillStyle = '#e6edf3'; ctx.font = '800 50px ' + FONT; ctx.fillText(fit(ctx, spec.title, W - 2 * PAD), PAD, y);
    if (spec.sub) { y += 40; ctx.fillStyle = '#b1bac4'; ctx.font = '400 27px ' + FONT; ctx.fillText(fit(ctx, spec.sub, W - 2 * PAD), PAD, y); }
    y += 32;
    spec.rows.forEach(function (r) {
      if (r.kind === 'head') {
        y += 50; ctx.fillStyle = acc; ctx.font = '700 25px ' + FONT; ctx.fillText(String(r.text).toUpperCase(), PAD, y); y += 16; return;
      }
      if (r.kind === 'game') {
        var top = y + 8; ctx.fillStyle = 'rgba(255,255,255,0.045)'; rr(ctx, PAD - 12, top, W - 2 * PAD + 24, 62, 14); ctx.fill();
        var mid = top + 31, s = 40;
        badge(ctx, r.a, PAD, mid - s / 2, s); badge(ctx, r.b, W - PAD - s, mid - s / 2, s);
        ctx.font = (r.win === r.a ? '700 ' : '400 ') + '29px ' + FONT; ctx.fillStyle = r.win === r.a ? '#e6edf3' : '#b1bac4'; ctx.textBaseline = 'middle';
        ctx.fillText(fit(ctx, U.teamName(r.a), 300), PAD + s + 16, mid);
        ctx.font = (r.win === r.b ? '700 ' : '400 ') + '29px ' + FONT; ctx.fillStyle = r.win === r.b ? '#e6edf3' : '#b1bac4'; ctx.textAlign = 'right';
        ctx.fillText(fit(ctx, U.teamName(r.b), 300), W - PAD - s - 16, mid);
        ctx.textAlign = 'center'; ctx.font = '800 34px ' + FONT; ctx.fillStyle = '#e6edf3'; ctx.fillText(r.sa + ' – ' + r.sb, W / 2, mid - (r.note ? 7 : 0));
        if (r.note) { ctx.font = '400 19px ' + FONT; ctx.fillStyle = '#8b949e'; ctx.fillText(r.note, W / 2, mid + 21); }
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        y += H.game; return;
      }
      if (r.kind === 'team') {
        var m2 = y + 30; badge(ctx, r.t, PAD, m2 - 18, 36);
        ctx.textBaseline = 'middle'; ctx.font = '400 28px ' + FONT; ctx.fillStyle = '#e6edf3'; ctx.fillText(fit(ctx, r.text, W - 2 * PAD - 230), PAD + 52, m2);
        if (r.right) { ctx.textAlign = 'right'; ctx.font = '700 28px ' + FONT; ctx.fillStyle = r.rightColor || '#e6edf3'; ctx.fillText(r.right, W - PAD, m2); ctx.textAlign = 'left'; }
        ctx.textBaseline = 'alphabetic'; y += H.team; return;
      }
      ctx.font = '400 27px ' + FONT; ctx.fillStyle = r.muted ? '#8b949e' : '#e6edf3';
      r._lines.forEach(function (ln, i) { y += 40; ctx.fillText(i === 2 && r._lines.length === 3 ? fit(ctx, ln, W - 2 * PAD) : ln, PAD + (i ? 22 : 0), y - 10); });
      y += 6;
    });
    ctx.fillStyle = '#6e7681'; ctx.font = '400 21px ' + FONT;
    ctx.fillText(fit(ctx, spec.foot || ((DP.meta.alerts || {}).siteUrl || 'Dynasty Puck HQ'), W - 2 * PAD), PAD, h - 40);
    return cv;
  };
  // preview in a card, then Download (and Share where the phone supports sharing files)
  DP.shareCard = function (spec, filename) {
    var cv;
    try { cv = DP.drawCard(spec); } catch (e) { U.toast('Couldn\'t draw the picture on this browser'); return; }
    var url = cv.toDataURL('image/png'), canFiles = !!(navigator.canShare && window.File);
    var body = DP.ui.modal('<h2>🖼️ ' + esc(spec.title) + '</h2><p class="small muted">A picture for the group chat. Nothing is uploaded: it\'s drawn here in your browser.</p>' +
      '<img src="' + url + '" alt="' + esc(spec.title) + '" style="width:100%;max-width:540px;border-radius:12px;border:1px solid var(--line);display:block;margin:10px 0">' +
      '<div class="controls"><a class="btn primary" download="' + esc(filename) + '" href="' + url + '">⬇ Download PNG</a>' + (canFiles ? '<button class="btn" id="sh-share">📤 Share</button>' : '') + '</div>');
    var sb = U.qs('#sh-share', body);
    if (sb) sb.addEventListener('click', function () {
      cv.toBlob(function (b) {
        var f = new File([b], filename, { type: 'image/png' });
        if (navigator.canShare({ files: [f] })) navigator.share({ files: [f], title: spec.title }).catch(function () {});
        else U.toast('Sharing pictures isn\'t supported here: use Download');
      }, 'image/png');
    });
  };
})();
