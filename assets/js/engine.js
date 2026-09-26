/* Dynasty Puck HQ - model engine.
 * Everything here is plain JS on the global DP namespace so it also runs from file:// and in Node (tools/test).
 * Model summary (details on the Rules & Methods page):
 *  - per-game rates = 2026-27 projection / projected GP (Tk, Cor projected by tools/build_data.py)
 *  - weekly expectation = rate x NHL team games that fantasy week x availability (projGP / 84)
 *  - weekly-lock lineup = best 12F / 6D / 2G by weekly category value
 *  - category win prob = normal approximation of the weekly difference (continuity-corrected for counts)
 *  - player value = expected season category wins above replacement (WAR)
 */
(function () {
  'use strict';
  var DP = window.DP = window.DP || {};
  var E = DP.E = {};

  // ---------------------------------------------------------------- categories
  // key, label, group, lowerIsBetter, per-game variance/mean dispersion (counts) - see Rules & Methods
  E.CATS = [
    { k: 'PtD', l: 'Pt-D', grp: 'S', name: 'Points by defensemen' },
    { k: 'G', l: 'G', grp: 'S', name: 'Goals' },
    { k: 'A', l: 'A', grp: 'S', name: 'Assists' },
    { k: 'GA2', l: '2G+A', grp: 'S', name: '2 x Goals + Assists' },
    { k: 'PIM', l: 'PIM', grp: 'S', name: 'Penalty minutes' },
    { k: 'SOG', l: 'SOG', grp: 'S', name: 'Shots on goal' },
    { k: 'STP', l: 'STP', grp: 'S', name: 'Special-teams points (PPP + SHP)' },
    { k: 'Hit', l: 'Hit', grp: 'S', name: 'Hits' },
    { k: 'Blk', l: 'Blk', grp: 'S', name: 'Blocked shots' },
    { k: 'Tk', l: 'Tk', grp: 'S', name: 'Takeaways' },
    { k: 'Cor', l: 'Cor', grp: 'S', name: 'Corsi (shot-attempt) differential' },
    { k: 'W', l: 'W', grp: 'G', name: 'Goalie wins' },
    { k: 'GAA', l: 'GAA', grp: 'G', low: true, ratio: true, name: 'Goals-against average (lower wins)' },
    { k: 'SV', l: 'SV%', grp: 'G', ratio: true, name: 'Save percentage' },
    { k: 'SHO', l: 'SHO', grp: 'G', name: 'Shutouts' }
  ];
  E.NC = E.CATS.length;
  // raw skater stat order in DP.players s25/p26: [GP, PtD, G, A, PIM, SOG, STP, Hit, Blk, Tk, Cor]
  // dispersion (per-game variance / mean) by raw skater stat; Cor uses an absolute per-game variance
  E.DISP = { PtD: 1.0, G: 1.0, A: 1.0, PIM: 3.0, SOG: 1.2, STP: 1.0, Hit: 1.5, Blk: 1.3, Tk: 1.2 };
  E.COR_VAR = 34;          // per-game variance of a skater's Corsi differential (plan: 30-38)
  E.SA_DISP = 1.1;         // per-game shots-against dispersion for goalies
  E.PHI0 = 0.3989422804;
  E.GP_SEASON = 84;
  E.YEARS = ['2026-27', '2027-28', '2028-29', '2029-30', '2030-31', '2031-32', '2032-33'];
  E.DISCOUNT = 0.85;
  E.LAMBDA = 0.5;          // share of cap cost counted against dynasty value (0 = pure talent, 1 = pure surplus)

  // ---------------------------------------------------------------- math helpers
  function erf(x) { // Abramowitz-Stegun 7.1.26 (|err| < 1.5e-7)
    var s = x < 0 ? -1 : 1; x = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * x);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  E.Phi = function (z) { return 0.5 * (1 + erf(z / Math.SQRT2)); };
  E.phi = function (z) { return E.PHI0 * Math.exp(-0.5 * z * z); };
  E.rng = function (seed) { // mulberry32
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  };
  E.normalSampler = function (rand) {
    var spare = null;
    return function () {
      if (spare !== null) { var s = spare; spare = null; return s; }
      var u, v, q;
      do { u = rand() * 2 - 1; v = rand() * 2 - 1; q = u * u + v * v; } while (q >= 1 || q === 0);
      var m = Math.sqrt(-2 * Math.log(q) / q);
      spare = v * m; return u * m;
    };
  };
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  E.sum = sum;

  // ---------------------------------------------------------------- setup
  E.init = function () {
    var t0 = Date.now();
    var M = DP.meta;
    E.CAP = M.cap / 1e6;
    E.RULES = M.rules;
    E.weeks = M.weeks;
    E.NW = M.weeks.length;
    E.REG_WEEKS = M.weeks.filter(function (w) { return !w.po; }).length;
    E.teams = M.gms.map(function (g) { return g.code; });
    E.teamName = {}; M.gms.forEach(function (g) { E.teamName[g.code] = g.name; });
    buildSchedule();
    E.byId = {};
    E.P = DP.players;
    E.P.forEach(function (p) { E.byId[p.id] = p; prepPlayer(p); });
    E.byNhl = {};
    E.P.forEach(function (p) { if (p.nhl) E.byNhl[p.nhl] = p; });
    E.rosters = {};
    E.teams.forEach(function (t) { E.rosters[t] = []; });
    E.P.forEach(function (p) { if (p.gm && E.rosters[p.gm]) E.rosters[p.gm].push(p); });
    calibrate();
    computeValues();
    computeDynasty();
    calibrateAuction();
    E.baseline = E.leagueWeeks();
    E.expStandings = E.expectedStandings(E.baseline);
    E.initMs = Date.now() - t0;
    E.version = (E.version || 0) + 1;
    return E;
  };

  function buildSchedule() {
    var start = new Date(E.weeks[0].start + 'T12:00:00Z').getTime();
    E.dayWeek = []; // day index -> week index (0-based)
    E.weeks.forEach(function (w, wi) {
      var a = Math.round((new Date(w.start + 'T12:00:00Z').getTime() - start) / 864e5);
      var b = Math.round((new Date(w.end + 'T12:00:00Z').getTime() - start) / 864e5);
      w.days = b - a + 1; w.d0 = a;
      for (var d = a; d <= b; d++) E.dayWeek[d] = wi;
    });
    E.seasonStart = start;
    E.wg = {}; // NHL team -> games per fantasy week
    E.b2b = {}; // NHL team -> back-to-backs per week
    var s = DP.nhl.sched;
    Object.keys(s).forEach(function (t) {
      var g = new Array(E.NW).fill(0), bb = new Array(E.NW).fill(0), prev = -9;
      s[t].forEach(function (r) {
        var wi = E.dayWeek[r[0]];
        if (wi !== undefined) { g[wi]++; if (r[0] - prev === 1) bb[wi]++; }
        prev = r[0];
      });
      E.wg[t] = g; E.b2b[t] = bb;
    });
    E.avgWeekGames = E.weeks.map(function (w, wi) {
      var ts = Object.keys(E.wg); return sum(ts.map(function (t) { return E.wg[t][wi]; })) / ts.length;
    });
  }
  E.dateOfDay = function (d) { return new Date(E.seasonStart + d * 864e5); };

  // per-player rates from the 2026-27 projection
  function prepPlayer(p) {
    var pr = p.p26, gp = pr[0];
    p.G = p.pos === 'G';
    p.D = p.pos === 'D';
    p.slot = p.G ? 'G' : (p.D ? 'D' : 'F');
    p.age = p.dob ? ageOn(p.dob, '2026-09-16') : p.fxage;
    p.avail = Math.max(0, Math.min(1, gp / E.GP_SEASON));
    p.projGP = gp;
    p.r = null;
    if (gp > 0) {
      if (p.G) {
        var gaa = pr[2], sv = pr[3] > 1 ? pr[3] / 1000 : pr[3];
        if (!sv) sv = 0.9;
        var sa = gaa / Math.max(0.02, 1 - sv);
        p.r = { w: pr[1] / gp, ga: gaa, sa: sa, sho: pr[4] / gp, sv: sv, gaa: gaa };
      } else {
        p.r = { PtD: pr[1] / gp, G: pr[2] / gp, A: pr[3] / gp, PIM: pr[4] / gp, SOG: pr[5] / gp, STP: pr[6] / gp,
          Hit: pr[7] / gp, Blk: pr[8] / gp, Tk: pr[9] / gp, Cor: pr[10] / gp };
      }
    }
    p.nt26 = (p.t && E.wg[p.t]) ? p.t : ((p.nt && E.wg[p.nt]) ? p.nt : null);
    // contract year array (7 seasons): number ($M), 'UFA', 'RFA' or null
    var y = p.c && p.c.y ? p.c.y : null;
    p.cy = E.YEARS.map(function (_, i) {
      if (!y) return i === 0 && p.gm ? p.sal / 1e6 : null;
      var v = y[i];
      if (typeof v === 'number') return v;
      if (typeof v === 'string') return v.indexOf('RFA') >= 0 ? 'RFA' : (v.indexOf('UFA') >= 0 ? 'UFA' : null);
      return null;
    });
    if (p.gm && p.ct === 'MNR') p.cy[0] = 0;
    p.sal26 = p.gm ? p.sal / 1e6 : 0;
    p.gradThr = p.G ? E.RULES.gradGoalie : E.RULES.gradSkater;
  }
  function ageOn(dob, on) {
    return (new Date(on + 'T12:00:00Z') - new Date(dob + 'T12:00:00Z')) / (365.2425 * 864e5);
  }
  E.ageOn = ageOn;

  // expected games (and variance) for a player in week wi
  E.games = function (p, wi) {
    if (!p.r || !p.nt26) return { m: 0, v: 0, N: 0 };
    var N = E.wg[p.nt26][wi] || 0, a = p.avail;
    return { m: N * a, v: N * a * (1 - a), N: N };
  };

  // ---------------------------------------------------------------- weekly player & team model
  // team-week aggregate: means & variances of raw stats plus goalie GP pmf
  var SK = ['PtD', 'G', 'A', 'PIM', 'SOG', 'STP', 'Hit', 'Blk', 'Tk', 'Cor'];
  E.SK = SK;
  function emptyAgg() {
    return { m: { PtD: 0, G: 0, A: 0, GA2: 0, PIM: 0, SOG: 0, STP: 0, Hit: 0, Blk: 0, Tk: 0, Cor: 0, W: 0, GA: 0, SA: 0, SHO: 0, GGP: 0 },
      v: { PtD: 0, G: 0, A: 0, GA2: 0, PIM: 0, SOG: 0, STP: 0, Hit: 0, Blk: 0, Tk: 0, Cor: 0, W: 0, GA: 0, SA: 0, SHO: 0, GGP: 0 },
      cGA_GP: 0, cGA_SA: 0, gpmf: [1], starters: [] };
  }
  function addSkater(agg, p, g) {
    if (!g.m) return;
    var r = p.r, m = agg.m, v = agg.v;
    for (var i = 0; i < SK.length; i++) {
      var k = SK[i], x = r[k];
      m[k] += g.m * x;
      v[k] += (k === 'Cor' ? g.m * E.COR_VAR : g.m * x * E.DISP[k]) + g.v * x * x;
    }
    var ga2 = 2 * r.G + r.A;
    m.GA2 += g.m * ga2;
    v.GA2 += g.m * (4 * r.G * E.DISP.G + r.A * E.DISP.A) + g.v * ga2 * ga2;
  }
  function addGoalie(agg, p, g) {
    if (!g.m) return;
    var r = p.r, m = agg.m, v = agg.v;
    m.GGP += g.m; v.GGP += g.v;
    m.W += g.m * r.w; v.W += g.m * r.w * (1 - r.w) + g.v * r.w * r.w;
    m.SHO += g.m * r.sho; v.SHO += g.m * r.sho * (1 - r.sho) + g.v * r.sho * r.sho;
    var q = 1 - r.sv, varSA = r.sa * E.SA_DISP;
    var varGA = q * q * varSA + r.sa * r.sv * q;
    m.SA += g.m * r.sa; v.SA += g.m * varSA + g.v * r.sa * r.sa;
    m.GA += g.m * r.ga; v.GA += g.m * varGA + g.v * r.ga * r.ga;
    agg.cGA_GP += g.v * r.ga;
    agg.cGA_SA += g.m * q * varSA + g.v * r.ga * r.sa;
    // goalie GP distribution: binomial(N, a) convolved into the team pmf
    agg.gpmf = convolve(agg.gpmf, binomPmf(g.N, p.avail));
  }
  function binomPmf(n, a) {
    var out = new Array(n + 1), c = 1;
    for (var k = 0; k <= n; k++) {
      out[k] = c * Math.pow(a, k) * Math.pow(1 - a, n - k);
      c = c * (n - k) / (k + 1);
    }
    return out;
  }
  function convolve(a, b) {
    var out = new Array(a.length + b.length - 1).fill(0);
    for (var i = 0; i < a.length; i++) for (var j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
    return out;
  }
  // ratio stats (delta method)
  function ratios(agg) {
    var m = agg.m, v = agg.v, out = {};
    if (m.GGP > 0.05) {
      var R = m.GA / m.GGP;
      out.GAA = R;
      out.GAAv = Math.max(0.02, (v.GA - 2 * R * agg.cGA_GP + R * R * v.GGP) / (m.GGP * m.GGP));
      var Q = m.GA / m.SA;
      out.SV = 1 - Q;
      out.SVv = Math.max(1e-6, (v.GA - 2 * Q * agg.cGA_SA + Q * Q * v.SA) / (m.SA * m.SA));
    } else { out.GAA = null; out.SV = null; out.GAAv = 1; out.SVv = 1; }
    var pm = agg.gpmf, fail = 0;
    for (var k = 0; k < Math.min(E.RULES.goalieMinGP, pm.length); k++) fail += pm[k];
    out.gFail = Math.min(1, Math.max(0, fail));
    return out;
  }

  // weekly value of a player for lineup decisions (category-win units)
  E.weeklyValue = function (p, wi) {
    if (!p.r) return 0;
    var g = E.games(p, wi);
    if (!g.m) return 0;
    var w = E.W8, r = p.r;
    if (p.G) {
      var nT = E.lg.teamGGP[wi] || 4, saT = E.lg.teamSA[wi] || 110;
      return g.m * (r.w * w.W + r.sho * w.SHO) +
        (E.lg.gaa - r.gaa) * g.m / nT * w.GAA + (r.sv - E.lg.sv) * g.m * r.sa / saT * w.SV +
        Math.min(1, g.m / 2) * E.lg.gMinBonus;
    }
    return g.m * (r.PtD * w.PtD + r.G * (w.G + 2 * w.GA2) + r.A * (w.A + w.GA2) + r.PIM * w.PIM + r.SOG * w.SOG +
      r.STP * w.STP + r.Hit * w.Hit + r.Blk * w.Blk + r.Tk * w.Tk + r.Cor * w.Cor);
  };

  // Is a player expected to miss fantasy week wi, per the Daily Faceoff injury list? (used only when asked)
  E.injuredOut = function (p, wi) {
    if (!p.inj) return false;
    var st = p.inj[0], ret = p.inj[2], hold = p.inj[4];
    if (!/OUT|IR|Injured/i.test(st) && !hold && !/Week-to-week|Months|Season|Misses opener/.test(ret)) return false;
    var weeks = ret === 'Season' ? 99 : ret === 'Months' ? 8 : ret === 'Week-to-week' ? 2 : ret === 'Misses opener' || ret === 'Not in camp' ? 1 : hold ? 1 : 1;
    return wi < weeks;
  };
  // weekly-lock optimizer: best 12F / 6D / 2G from every owned player (MNR included)
  E.lineup = function (roster, wi, opts) {
    var L = E.RULES.lineup, excl = (opts && opts.exclude) || null, inj = opts && opts.injuries, only = (opts && opts.only) || null;
    var pool = roster.filter(function (p) { return p.r && (!excl || !excl[p.id]) && (!only || only[p.id]) && (!inj || !E.injuredOut(p, wi)); })
      .map(function (p) { return { p: p, v: E.weeklyValue(p, wi) }; })
      .sort(function (a, b) { return b.v - a.v; });
    var G = [], D = [], F = [], used = {};
    pool.forEach(function (x) { if (x.p.G && G.length < L.G) { G.push(x); used[x.p.id] = 1; } });
    // D first (dual F,D players can fill either), then F
    pool.forEach(function (x) { if (!used[x.p.id] && (x.p.D || x.p.fd) && !x.p.G && D.length < L.D) { D.push(x); used[x.p.id] = 1; } });
    pool.forEach(function (x) { if (!used[x.p.id] && !x.p.G && !x.p.D && F.length < L.F) { F.push(x); used[x.p.id] = 1; } });
    // swap pass: a dual player in D could be worth more at F if it frees a better D
    for (var i = 0; i < D.length; i++) {
      var d = D[i];
      if (!d.p.fd || F.length < L.F) continue;
      var nextD = pool.find(function (x) { return !used[x.p.id] && x.p.D && !x.p.fd; });
      var worstF = F.reduce(function (a, b) { return a.v < b.v ? a : b; }, F[0]);
      if (nextD && worstF && nextD.v > worstF.v) {
        D[i] = nextD; used[nextD.p.id] = 1;
        F.splice(F.indexOf(worstF), 1, d); delete used[worstF.p.id];
      }
    }
    var bench = pool.filter(function (x) { return !used[x.p.id]; }).slice(0, L.bench);
    return { F: F, D: D, G: G, bench: bench };
  };

  // aggregate a team's weekly starters
  E.teamWeek = function (roster, wi, opts) {
    var lu = E.lineup(roster, wi, opts), agg = emptyAgg();
    lu.F.concat(lu.D).forEach(function (x) { addSkater(agg, x.p, E.games(x.p, wi)); });
    lu.G.forEach(function (x) { addGoalie(agg, x.p, E.games(x.p, wi)); });
    agg.r = ratios(agg);
    agg.lu = lu;
    agg.wi = wi;
    return agg;
  };

  // category mean / variance vector (15) for a team-week aggregate
  E.catVec = function (agg) {
    var m = agg.m, v = agg.v, r = agg.r;
    return {
      mu: [m.PtD, m.G, m.A, m.GA2, m.PIM, m.SOG, m.STP, m.Hit, m.Blk, m.Tk, m.Cor, m.W, r.GAA, r.SV, m.SHO],
      va: [v.PtD, v.G, v.A, v.GA2, v.PIM, v.SOG, v.STP, v.Hit, v.Blk, v.Tk, v.Cor, v.W, r.GAAv, r.SVv, v.SHO],
      gFail: r.gFail, gpmf: agg.gpmf
    };
  };

  // per-category W/T/L probabilities of A vs B for a week
  E.matchupProbs = function (A, B) {
    var a = E.catVec(A), b = E.catVec(B), out = [];
    for (var c = 0; c < E.NC; c++) {
      var cat = E.CATS[c], pw, pt, pl;
      if (cat.ratio && (a.mu[c] === null || b.mu[c] === null)) {
        pw = a.mu[c] === null ? 0 : 1; pl = 1 - pw; pt = 0;
      } else {
        var mu = a.mu[c] - b.mu[c], sd = Math.sqrt(Math.max(1e-9, a.va[c] + b.va[c]));
        if (cat.low) mu = -mu;
        if (cat.ratio) { pw = E.Phi(mu / sd); pl = 1 - pw; pt = 0; }
        else { pw = 1 - E.Phi((0.5 - mu) / sd); pl = E.Phi((-0.5 - mu) / sd); pt = Math.max(0, 1 - pw - pl); }
      }
      if (cat.grp === 'G') { // goalie minimum: a team below 2 GP loses all 4 goalie cats (both below: both lose)
        var fa = a.gFail, fb = b.gFail, ok = (1 - fa) * (1 - fb);
        var w2 = ok * pw + (1 - fa) * fb, l2 = fa + ok * pl, t2 = ok * pt;
        pw = w2; pl = l2; pt = t2;
      }
      out.push({ w: pw, t: pt, l: pl });
    }
    return out;
  };

  // ---------------------------------------------------------------- calibration (weights, sigmas, league averages)
  function calibrate() {
    // league-average goalie rates from goalies with a 2026-27 projection
    var gs = E.P.filter(function (p) { return p.G && p.r && p.projGP >= 20; });
    var GA = 0, GP = 0, SA = 0;
    gs.forEach(function (p) { GA += p.r.ga * p.projGP; GP += p.projGP; SA += p.r.sa * p.projGP; });
    E.lg = { gaa: GA / GP, sv: 1 - GA / SA, teamGGP: [], teamSA: [], gMinBonus: 0 };
    // initial weights: inverse of rough weekly SDs
    E.W8 = { PtD: 1 / 4, G: 1 / 5, A: 1 / 7, GA2: 1 / 14, PIM: 1 / 12, SOG: 1 / 20, STP: 1 / 4, Hit: 1 / 18, Blk: 1 / 14,
      Tk: 1 / 8, Cor: 1 / 45, W: 1 / 1.4, GAA: 1 / 0.9, SV: 1 / 0.025, SHO: 1 / 0.45 };
    E.W8.GAA *= 0.4; E.W8.SV *= 0.4; E.W8.W *= 0.4; E.W8.SHO *= 0.4;
    for (var w = 0; w < E.NW; w++) { E.lg.teamGGP[w] = 4; E.lg.teamSA[w] = 110; }
    for (var pass = 0; pass < 2; pass++) {
      var sums = new Array(E.NC).fill(0), n = 0, ggp = new Array(E.NW).fill(0), sa = new Array(E.NW).fill(0), fails = 0;
      E.sigTeamMu = new Array(E.NC).fill(0);
      var muSq = new Array(E.NC).fill(0);
      E.teams.forEach(function (t) {
        for (var wi = 0; wi < E.REG_WEEKS; wi++) {
          var agg = E.teamWeek(E.rosters[t], wi), cv = E.catVec(agg);
          for (var c = 0; c < E.NC; c++) {
            sums[c] += cv.va[c] / (E.weeks[wi].days / 7);
            var mu = cv.mu[c] === null ? 0 : cv.mu[c] / (c === 12 || c === 13 ? 1 : E.weeks[wi].days / 7);
            E.sigTeamMu[c] += mu; muSq[c] += mu * mu;
          }
          ggp[wi] += agg.m.GGP; sa[wi] += agg.m.SA; fails += cv.gFail; n++;
        }
      });
      // sigma_c = SD of the weekly difference between two average teams (7-day week)
      E.SIG = sums.map(function (s) { return Math.sqrt(2 * s / n); });
      E.sigTeamMu = E.sigTeamMu.map(function (s) { return s / n; });
      E.sigTeamSd = muSq.map(function (s, c) { return Math.sqrt(Math.max(0, s / n - E.sigTeamMu[c] * E.sigTeamMu[c])); });
      var nt = E.teams.length;
      for (var wi2 = 0; wi2 < E.NW; wi2++) {
        E.lg.teamGGP[wi2] = wi2 < E.REG_WEEKS ? Math.max(1, ggp[wi2] / nt) : E.lg.teamGGP[0];
        E.lg.teamSA[wi2] = wi2 < E.REG_WEEKS ? Math.max(20, sa[wi2] / nt) : E.lg.teamSA[0];
      }
      E.lg.gFailRate = fails / n;
      // weights: marginal win probability per unit of stat at an even matchup
      E.W8 = {};
      E.CATS.forEach(function (cat, c) { E.W8[cat.k] = E.PHI0 / E.SIG[c]; });
      // meeting the goalie minimum protects 4 categories: value a goalie start by the cats it secures
      E.lg.gMinBonus = 0.15;
    }
    E.lg.avgTeamGGP = sum(E.lg.teamGGP.slice(0, E.REG_WEEKS)) / E.REG_WEEKS;
    E.lg.avgTeamSA = sum(E.lg.teamSA.slice(0, E.REG_WEEKS)) / E.REG_WEEKS;
  }

  // ---------------------------------------------------------------- season value (WAR) and money
  E.seasonTotals = function (p) { // projected 2026-27 totals in category order (ratio cats as rates)
    var gp = p.projGP, r = p.r;
    if (!r) return null;
    if (p.G) return { gp: gp, W: r.w * gp, GA: r.ga * gp, SA: r.sa * gp, SHO: r.sho * gp, GAA: r.gaa, SV: r.sv };
    var o = { gp: gp };
    SK.forEach(function (k) { o[k] = r[k] * gp; });
    o.GA2 = 2 * o.G + o.A;
    return o;
  };

  // WAR components for a set of season totals vs replacement totals
  E.warOf = function (p, tot, rep) {
    if (!tot) return null;
    var out = {}, s = 0, W = E.W8;
    if (p.G) {
      var wk = E.REG_WEEKS, nT = E.lg.avgTeamGGP * wk, saT = E.lg.avgTeamSA * wk;
      out.W = (tot.W - rep.W) * W.W;
      out.SHO = (tot.SHO - rep.SHO) * W.SHO;
      out.GAA = (rep.GAA - tot.GAA) * (tot.gp / nT) * wk * W.GAA;
      out.SV = (tot.SV - rep.SV) * (tot.SA / saT) * wk * W.SV;
    } else {
      E.CATS.forEach(function (cat) { if (cat.grp === 'S') out[cat.k] = (tot[cat.k] - rep[cat.k]) * W[cat.k]; });
    }
    Object.keys(out).forEach(function (k) { s += out[k]; });
    out.total = s;
    return out;
  };

  function avgTotals(list, isG) {
    var o = isG ? { gp: 0, W: 0, GA: 0, SA: 0, SHO: 0 } : { gp: 0, GA2: 0 };
    if (!isG) SK.forEach(function (k) { o[k] = 0; });
    list.forEach(function (p) { var t = E.seasonTotals(p); Object.keys(o).forEach(function (k) { o[k] += t[k] || 0; }); });
    Object.keys(o).forEach(function (k) { o[k] /= Math.max(1, list.length); });
    if (isG) { o.GAA = o.GA / Math.max(1, o.gp); o.SV = 1 - o.GA / Math.max(1, o.SA); }
    return o;
  }

  function computeValues() {
    var zero = { gp: 0, W: 0, SHO: 0, GAA: E.lg.gaa, SV: E.lg.sv, GA2: 0 };
    SK.forEach(function (k) { zero[k] = 0; });
    var nT = E.teams.length, L = E.RULES.lineup;
    // rank each slot by raw value vs zero, replacement = the next ~2 per team past the starter cutoff
    E.repl = {};
    ['F', 'D', 'G'].forEach(function (slot) {
      var list = E.P.filter(function (p) { return p.r && p.slot === slot; });
      list.forEach(function (p) { p._raw = E.warOf(p, E.seasonTotals(p), zero).total; });
      list.sort(function (a, b) { return b._raw - a._raw; });
      var start = nT * L[slot], cnt = slot === 'G' ? nT : nT * 2;
      var pool = list.slice(start, start + cnt);
      E.repl[slot] = avgTotals(pool, slot === 'G');
      E.repl[slot].n = pool.length; E.repl[slot].cut = start;
    });
    E.P.forEach(function (p) {
      p.war = p.r ? E.warOf(p, E.seasonTotals(p), E.repl[p.slot]) : null;
      p.WAR = p.war ? p.war.total : 0;
    });
    // $ per WAR from market contracts (BID / RFA1 / FA / ELC1) on league rosters
    var spent = 0, wins = 0, minS = E.RULES.minSalary;
    E.P.forEach(function (p) {
      if (!p.gm || p.ct === 'MNR') return;
      spent += Math.max(0, p.sal26 - minS);
      wins += Math.max(0, p.WAR);
    });
    E.dollarPerWAR = spent / Math.max(1, wins);
    E.P.forEach(function (p) {
      p.mkt = minS + Math.max(0, p.WAR) * E.dollarPerWAR;
      p.surplus = p.gm || p.ct !== 'FA' ? p.mkt - p.sal26 : p.mkt - minS;
    });
    // position ranks & percentiles
    ['F', 'D', 'G'].forEach(function (slot) {
      var list = E.P.filter(function (p) { return p.slot === slot && p.r; }).sort(function (a, b) { return b.WAR - a.WAR; });
      list.forEach(function (p, i) { p.posRank = i + 1; });
    });
    E.P.forEach(function (p) { delete p._raw; });
  }

  // ---------------------------------------------------------------- aging, prospects, dynasty value
  // WAR multiplier by age relative to peak = 1 (heuristic curves from public aging studies; see Rules & Methods)
  var AGE = {
    F: { 18: .30, 19: .42, 20: .56, 21: .70, 22: .82, 23: .91, 24: .97, 25: 1, 26: 1, 27: 1, 28: .98, 29: .95, 30: .91, 31: .86, 32: .80, 33: .73, 34: .65, 35: .56, 36: .47, 37: .38, 38: .30, 39: .22, 40: .15 },
    D: { 18: .25, 19: .35, 20: .47, 21: .60, 22: .72, 23: .82, 24: .90, 25: .96, 26: 1, 27: 1, 28: 1, 29: 1, 30: .96, 31: .91, 32: .85, 33: .78, 34: .70, 35: .61, 36: .52, 37: .42, 38: .33, 39: .25, 40: .18 },
    G: { 18: .15, 19: .22, 20: .32, 21: .43, 22: .55, 23: .67, 24: .78, 25: .87, 26: .94, 27: 1, 28: 1, 29: 1, 30: 1, 31: 1, 32: .95, 33: .89, 34: .82, 35: .74, 36: .65, 37: .55, 38: .45, 39: .35, 40: .25 }
  };
  E.AGE = AGE;
  E.ageMult = function (slot, age) {
    var t = AGE[slot], a = Math.max(18, Math.min(40, age)), lo = Math.floor(a), hi = Math.min(40, lo + 1), f = a - lo;
    return t[lo] * (1 - f) + t[hi] * f;
  };
  // probability a prospect becomes an NHL regular by draft slot (approximate public draft-success rates)
  E.pNHL = function (ov) {
    if (!ov) return 0.08;
    if (ov <= 3) return 0.95; if (ov <= 10) return 0.85; if (ov <= 20) return 0.72; if (ov <= 32) return 0.58;
    if (ov <= 64) return 0.35; if (ov <= 96) return 0.22; if (ov <= 128) return 0.15; return 0.10;
  };
  E.nhleFactor = function (lg) {
    var N = (DP.prospects && DP.prospects.nhle) || {}, A = (DP.prospects && DP.prospects.nhleAlias) || {};
    if (!lg) return null;
    if (N[lg] !== undefined) return N[lg];
    if (A[lg] && N[A[lg]] !== undefined) return N[A[lg]];
    return null;
  };
  // best recent NHLe line (points per 82 NHL games) from a career array [season, lg, team, gp, g, a, pts, pim]
  E.nhle = function (car, dob) {
    if (!car || !car.length) return null;
    var best = null;
    car.forEach(function (s) {
      if (s[0] < 20232024) return;
      var f = E.nhleFactor(s[1]);
      if (f === null || f === undefined || s[3] < 8) return;
      var pace = s[6] / s[3] * f * 82;
      var age = dob ? ageOn(dob, String(Math.floor(s[0] / 10000)) + '-12-31') : null;
      var cand = { season: s[0], lg: s[1], team: s[2], gp: s[3], pts: s[6], pace: pace, age: age, f: f };
      // prefer the most recent season, weighted by games
      if (!best || s[0] > best.season || (s[0] === best.season && s[3] > best.gp)) best = cand;
    });
    return best;
  };

  function fitPtsToWar() { // WAR per 82 GP as a linear function of points per 82, by slot (current NHL skaters)
    var fit = {};
    ['F', 'D'].forEach(function (slot) {
      var xs = [], ys = [];
      E.P.forEach(function (p) {
        if (p.slot !== slot || !p.r || p.projGP < 40) return;
        xs.push((p.r.G + p.r.A) * 82); ys.push(p.WAR / p.projGP * 82);
      });
      var n = xs.length, mx = sum(xs) / n, my = sum(ys) / n, sxy = 0, sxx = 0;
      for (var i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) * (xs[i] - mx); }
      var b = sxy / sxx; fit[slot] = { a: my - b * mx, b: b, n: n };
    });
    E.ptsWar = fit;
  }

  // typical peak points per 82 games for a drafted forward who becomes an NHL regular, by draft slot
  // (heuristic prior from public draft-outcome studies; defensemen x0.6)
  E.slotPriorPts = function (ov, slot) {
    var f = !ov ? 30 : ov <= 1 ? 90 : ov <= 3 ? 80 : ov <= 5 ? 72 : ov <= 10 ? 62 : ov <= 20 ? 52 : ov <= 32 ? 45 : ov <= 64 ? 38 : 33;
    return slot === 'D' ? f * 0.6 : f;
  };
  // E[max(0, a + b*X)] for X lognormal with mean m and log-sd sig (13-point quadrature)
  var QZ = [-3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3];
  var QW = QZ.map(function (z) { return Math.exp(-z * z / 2); }), QS = QW.reduce(function (a, b) { return a + b; }, 0);
  E.expWarFromPts = function (fit, m, sig) {
    if (!(m > 0)) return 0;
    var s = 0;
    for (var i = 0; i < QZ.length; i++) s += QW[i] * Math.max(0, fit.a + fit.b * m * Math.exp(sig * QZ[i] - sig * sig / 2));
    return s / QS;
  };
  // prospect model: expected peak WAR (per season) and ETA (seasons from 2026-27)
  E.prospect = function (p) {
    var ov = p.dr ? p.dr[2] : null, pr = E.pNHL(ov), age = p.age || 20;
    if (p.slot === 'G') {
      var bonus = 1;
      (p.car || []).forEach(function (s) { if (s[0] >= 20242025 && (s[1] === 'AHL' || s[1] === 'NHL') && s[3] >= 15 && s[6] >= 0.910) bonus = 1.3; });
      if ((p.cgp || 0) >= 40) pr = Math.max(pr, 0.85);
      var etaG = p.projGP >= 30 ? 0 : Math.max(1, Math.round(23.5 - age));
      return { peak: 5 * pr * bonus, peakRaw: 5 * bonus, eta: etaG, p: pr, line: null, basis: 'draft slot + pro SV% (goalies)' };
    }
    var line = E.nhle(p.car, p.dob), fit = E.ptsWar[p.slot] || E.ptsWar.F;
    var prior = E.slotPriorPts(ov, p.slot), peakPts = prior, basis = 'draft slot';
    if (line && line.gp >= 15) {
      var ageAt = line.age || age - 0.7;
      var mult = Math.min(3.3, 1 + 0.5 * Math.max(0, 22 - ageAt));
      var fromNhle = line.pace * mult;
      peakPts = 0.55 * fromNhle + 0.45 * prior; basis = 'NHLe + draft slot';
    }
    if ((p.cgp || 0) >= 40 && p.h && p.h.length) { // already playing in the NHL: blend in the NHL scoring pace
      var last = p.h[p.h.length - 1];
      if (last[1] >= 20) {
        var nhlPace = (last[2] + last[3]) / last[1] * 82 * Math.min(2, 1 + 0.12 * Math.max(0, 25 - age));
        peakPts = Math.max(peakPts, 0.5 * peakPts + 0.5 * nhlPace); basis += ' + NHL pace';
      }
      pr = Math.max(pr, (p.cgp || 0) >= 82 ? 0.95 : 0.85);
    }
    // expected WAR over an uncertain outcome: peak pts ~ lognormal(mean peakPts, sigma), WAR = max(0, a + b*pts)
    var peakWar = E.expWarFromPts(fit, peakPts, (p.cgp || 0) >= 82 ? 0.22 : 0.38);
    var lg = line ? line.lg : null, eta;
    if (p.projGP >= 40) eta = 0;
    else if (p.projGP >= 10 || lg === 'AHL' || lg === 'NHL') eta = 1;
    else {
      var euro = lg === 'KHL' || lg === 'SHL' || lg === 'Liiga' || lg === 'NL' || lg === 'Czechia' || lg === 'DEL';
      eta = Math.max(1, Math.round((euro ? 21 : 20.5) - age));
      if (ov && ov <= 10) eta = Math.max(1, eta - 1);
    }
    return { peak: peakWar * pr, peakRaw: peakWar, peakPts: peakPts, eta: eta, p: pr, line: line, basis: basis };
  };

  // yearly projection over the 7-season window
  E.projectYears = function (p) {
    var years = [], m0 = E.ageMult(p.slot, p.age || 25);
    var nhlNow = p.r && p.projGP >= 20;
    var pros = (p.age || 30) < 25 && (p.ct === 'MNR' || p.ct === 'ELC1' || !nhlNow || (p.cgp || 0) < 150) ? E.prospect(p) : null;
    for (var y = 0; y < 7; y++) {
      var age = (p.age || 25) + y, war = 0;
      if (nhlNow) war = p.WAR * Math.min(1.8, E.ageMult(p.slot, age) / Math.max(0.2, m0));
      if (pros) {
        var ramp = y < pros.eta ? 0 : Math.min(1, 0.55 + 0.25 * (y - pros.eta));
        var pw = pros.peak * ramp * E.ageMult(p.slot, age) / Math.max(E.ageMult(p.slot, 26), 0.5);
        war = y === 0 ? Math.max(war, nhlNow ? war : 0) : Math.max(war, pw);
      }
      years.push(war);
    }
    return { war: years, pros: pros };
  };

  // ---------------------------------------------------------------- contract rules (commissioner, 2026-09-26)
  // cap by season (index 0 = 2026-27); market $/win scales with the cap
  E.capY = function (y) { var c = DP.meta.capByYear || []; return c.length ? c[Math.max(0, Math.min(y, c.length - 1))] : E.CAP; };
  E.dpwY = function (y) { return E.dollarPerWAR * E.capY(y) / E.capY(0); };
  // age on June 30 of the offseason before season y (y = 1 -> June 30, 2027): RFA rights need age < 27
  E.ageJune30 = function (p, y) {
    if (p.dob) return ageOn(p.dob, (2026 + y) + '-06-30');
    return (p.age || 27) - 0.21 + y;
  };
  // auction salary bands (winning bid sets the term). Each set applies from its offseason until a newer one is added
  // (commissioner: the $104M bands stay in place through at least the summer-2028 auction; no scaling)
  E.bandsFor = function (year) {
    var B = E.RULES.bands || {}, ks = Object.keys(B).map(Number).filter(function (k) { return k <= year; }).sort();
    return ks.length ? B[ks[ks.length - 1]].bands : [[1, null, 1]];
  };
  E.bands = function (y) { return E.bandsFor(2026 + Math.max(0, y)); };
  E.bandTerm = function (price, y) {
    var b = E.bands(y), term = 1;
    b.forEach(function (r) { if (price >= r[0] - 1e-9) term = r[2]; });
    return term;
  };
  function r3(x) { return Math.round(x * 1000) / 1000; }
  // re-sign options when a deal ends. kinds:
  //  elcUp   - ELC is up: 2y $2.5M, 3y $4.0M, 4y $5.5M, 5y $7.0M, 6y $9.0M, or 1 more ELC year at $1.75M (then UFA)
  //  rfa     - a post-ELC RFA deal is up (under 27 on June 30): 2-6 yrs at base x 1.5 (2-4) / 1.75 (5-6); base can't drop
  //  rfaInit - RFA deal of a player whose contract traces back to an auction BID (BID -> RFA1 -> ...): league sheet
  //            formula, mult x current salary + add-on by length (commissioner 2026-09-26: the constitution's premium
  //            rule only covers post-ELC players; base the formula on this past summer's sheet)
  E.initFormula = function () { var R = E.RULES; return R.initFormula || R.ext2026 || R.ext2027; };
  E.resignOptions = function (st) {
    var R = E.RULES, out = [], menu = R.elcMenu || { 2: 2.5, 3: 4, 4: 5.5, 5: 7, 6: 9 }, prem = R.rfaPrem || [1, 1.5, 1.5, 1.5, 1.75, 1.75];
    if (st.kind === 'elcUp') {
      out.push({ L: 1, price: R.elcExt || 1.75, next: 'ufa', label: '1-yr ELC extension, then UFA' });
      [2, 3, 4, 5, 6].forEach(function (L) { out.push({ L: L, price: menu[L], base: menu[L], next: 'rfa', label: L + ' yrs (post-ELC)' }); });
    } else if (st.kind === 'rfa') {
      [2, 3, 4, 5, 6].forEach(function (L) { var b = Math.max(st.base, menu[L]); out.push({ L: L, price: r3(b * prem[L - 1]), base: b, next: 'rfa', label: L + ' yrs RFA' }); });
    } else {
      var sc = E.initFormula();
      for (var L = 1; L <= 6; L++) { var pr = r3(sc.mult[L - 1] * st.sal + sc.base[L - 1]); out.push({ L: L, price: pr, base: pr, next: 'rfa', label: L + ' yr' + (L > 1 ? 's' : '') + ' RFA' }); }
    }
    return out;
  };
  // surplus of an option starting in season y: projected market value minus price, discounted, over its term (within 7 seasons)
  E.optionValue = function (p, o, y, war) {
    war = war || p.yWar; var v = 0, mn = E.RULES.minSalary;
    for (var k = 0; k < o.L; k++) { // years past 2032-33 reuse the last projected season so long deals aren't cut short
      var yy = Math.min(6, y + k);
      v += Math.pow(E.DISCOUNT, k) * (mn + Math.max(0, war[yy]) * E.dpwY(yy) - o.price);
    }
    return v;
  };

  // contract cost by year ($M): current deal, MNR -> ELC (the offseason after graduating), ELC/RFA decisions, UFA exit.
  // At each decision the model takes the option with the best surplus, or lets him walk if none is positive.
  E.costPath = function (p, war) {
    var R = E.RULES, cost = [], status = [], dec = [], y = 0, grad = E.gradYear(p);
    var push = function (c, s) { cost.push(c); status.push(s); y++; };
    if (!p.gm) { while (y < 7) push(null, 'FA'); return { cost: cost, status: status, grad: grad, dec: dec }; }
    var st = null;
    if (p.ct === 'MNR') {
      var elcStart = grad === null ? 7 : grad + 1; // stays $0 through the season he graduates; ELC signed that offseason
      while (y < 7 && y < elcStart) push(0, 'MNR');
      for (var k = 0; k < (R.elcYears || 2) && y < 7; k++) push(R.elcSalary, 'ELC');
      st = { kind: 'elcUp' };
    } else {
      while (y < 7 && typeof p.cy[y] === 'number') push(p.cy[y], y === 0 ? p.ct : 'contract');
      var mark = y < 7 ? p.cy[y] : null, last = y > 0 && typeof p.cy[y - 1] === 'number' ? p.cy[y - 1] : (p.sal26 || R.minSalary);
      if (p.ct === 'ELC1') st = { kind: 'elcUp' };
      else if (mark === 'RFA') st = { kind: 'rfaInit', sal: last };  // BID / RFA1 lineage
    }
    while (y < 7) {
      if (st && st.kind !== 'elcUp' && E.ageJune30(p, y) >= (R.rfaAge || 27)) { dec.push({ y: y, kind: st.kind, pick: null, why: 'age' }); st = null; }
      if (!st) { while (y < 7) push(null, 'UFA'); break; }
      var opts = E.resignOptions(st), best = null;
      opts.forEach(function (o) { o.v = E.optionValue(p, o, y, war); if (!best || o.v > best.v) best = o; });
      var pick = best && best.v > 0 ? best : null;
      dec.push({ y: y, kind: st.kind, opts: opts, pick: pick });
      if (!pick) { st = null; continue; }
      for (var k2 = 0; k2 < pick.L && y < 7; k2++) push(pick.price, st.kind === 'elcUp' && pick.L === 1 ? 'ELC ext' : 'RFA ' + pick.L + 'yr');
      st = pick.next !== 'rfa' ? null : st.kind === 'rfaInit' ? { kind: 'rfaInit', sal: pick.price } : { kind: 'rfa', base: pick.base };
    }
    return { cost: cost, status: status, grad: grad, dec: dec };
  };
  // the decision a team faces when a player's current deal ends (first one in the window), with every option priced
  E.nextDecision = function (p) { return p.yDec && p.yDec.length ? p.yDec[0] : null; };

  // UFA auction price model, calibrated on the 2026 offseason auction (62 BID contracts signed in 2026):
  // price = $1M + k x (value over the next 3 seasons) x (league cap space at that auction / space at the 2026 auction).
  // The 2026 market paid far more per win for young players, which the 3-season value captures.
  E.auctionValue = function (p, y) {
    var w = p.yWar || [], v = 0;
    for (var k = 0; k < 3 && y + k < 7; k++) v += Math.pow(E.DISCOUNT, k) * Math.max(0, w[y + k] || 0);
    return v;
  };
  function calibrateAuction() {
    var sold = E.P.filter(function (p) { return p.gm && p.ct === 'BID' && p.c && p.c.signed === 2026; });
    var sv = 0, svv = 0, spent = 0;
    sold.forEach(function (p) { var v = E.auctionValue(p, 0); sv += v * (p.sal26 - 1); svv += v * v; spent += p.sal26; });
    var k = svv ? sv / svv : 0.3;
    // spread: actual price / modeled price among the 2026 sales (middle half)
    var ratios = sold.map(function (p) { return p.sal26 / (1 + k * E.auctionValue(p, 0)); }).sort(function (a, b) { return a - b; });
    var q = function (f) { return ratios.length ? ratios[Math.floor(f * (ratios.length - 1))] : 1; };
    var pay = sum(E.P.filter(function (p) { return p.gm; }).map(function (p) { return p.sal26; }));
    var faCt = sum(E.P.filter(function (p) { return p.gm && p.ct === 'FA'; }).map(function (p) { return p.sal26; }));
    var space26 = E.teams.length * E.capY(0) - (pay - spent - faCt);
    // supply: value of what was on the market (sold players + everyone still unowned)
    var unowned = function (y) { return sum(E.P.filter(function (p) { return !p.gm && p.r; }).map(function (p) { return E.auctionValue(p, y); })); };
    var supply26 = sum(sold.map(function (p) { return E.auctionValue(p, 0); })) + unowned(0);
    // 2027: rostered players whose rights end entering 2027-28 (contract up, released or aged out) + the unowned pool
    var hit27 = E.P.filter(function (p) { return p.gm && p.yStatus && p.yStatus[1] === 'UFA'; });
    var supply27 = sum(hit27.map(function (p) { return E.auctionValue(p, 1); })) + unowned(1);
    var sp = E.leagueSpace(1), raw = (sp.total / Math.max(1, space26)) / (supply27 / Math.max(1, supply26));
    E.auction = { n: sold.length, spent: spent, k: k, space26: space26, lo: q(0.25), hi: q(0.75), space27: sp.total, spaceByTeam27: sp.byTeam,
      supply26: supply26, supply27: supply27, n27: hit27.length, scale27: Math.max(0.6, Math.min(2, raw)), scaleRaw: raw };
  }
  // projected league cap space entering the auction before season y (committed + modeled ELC/RFA costs)
  E.leagueSpace = function (y) {
    var out = {}, tot = 0;
    E.teams.forEach(function (t) {
      var c = sum(E.rosters[t].map(function (p) { return p.yCost && typeof p.yCost[y] === 'number' ? p.yCost[y] : 0; }));
      out[t] = E.capY(y) - c; tot += Math.max(0, out[t]);
    });
    return { byTeam: out, total: tot };
  };
  // hometown discount: the team that had him from the trade deadline to season's end pays (1 - htdPct) of its winning bid;
  // the bid still sets the term. Without a deadline date in the settings, today's owner is assumed eligible.
  E.htdTeam = function (p) {
    if (!p.gm) return null;
    var dl = E.RULES.tradeDeadline ? new Date(E.RULES.tradeDeadline) : null;
    if (dl && !isNaN(dl)) {
      var day = dl.toISOString().slice(0, 10), after = new Date(dl.getTime() + 864e5).toISOString().slice(0, 10);
      // the nightly Fantrax log dates a move the morning after it happened, so anything logged the day after the
      // deadline is still counted as before it; trades in the Fantrax trade export carry their real date
      var moved = (DP.league.moves || []).some(function (m) { return m.id === p.id && m.d > after && (m.type === 'move' || m.type === 'add'); }) ||
        (DP.league.trades || []).some(function (t) { return t.date > day && t.moves.some(function (m) { return m.id === p.id; }); });
      if (moved) return null;
    }
    return p.gm;
  };
  E.deadlineText = function () {
    var d = E.RULES.tradeDeadline ? new Date(E.RULES.tradeDeadline) : null;
    return d && !isNaN(d) ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET' : null;
  };
  // trades closed: after the deadline until the season's last lineup lock has passed (the offseason reopens them)
  E.tradesClosed = function () {
    var d = E.RULES.tradeDeadline ? new Date(E.RULES.tradeDeadline) : null;
    return !!(d && !isNaN(d) && E.now() > d && E.lockWeek() !== null);
  };
  E.htdPrice = function (bid) { return bid * (1 - (E.RULES.htdPct || 0)); };
  // projected price at the 2027 auction (y = 1), or what he'd have gone for in the 2026 auction (y = 0)
  E.auctionPrice = function (p, y) {
    var A = E.auction; if (!A) return null;
    y = y === undefined ? 1 : Math.min(1, y);
    var scale = y === 0 ? 1 : A.scale27, mid = Math.max(1, 1 + A.k * E.auctionValue(p, y) * scale);
    return { mid: mid, lo: Math.max(1, mid * A.lo), hi: Math.max(1, mid * A.hi), term: E.bandTerm(mid, y), scale: scale };
  };

  // season index (0 = 2026-27) in which an MNR player reaches the career-GP threshold; null if not in the window
  E.gradYear = function (p) {
    if (p.ct !== 'MNR') return null;
    var need = p.gradThr - (p.cgp || 0);
    if (need <= 0) return 0;
    if (p.projGP >= need) return 0;
    var cum = p.projGP, pros = p._pros || E.prospect(p);
    for (var y = 1; y < 7; y++) {
      var gpY = y < pros.eta ? 0 : (p.G ? 30 : 60) * Math.min(1, 0.6 + 0.2 * (y - pros.eta));
      if (pros.p < 0.3 && y < pros.eta + 2) gpY *= 0.5;
      cum += gpY;
      if (cum >= need) return y;
    }
    return null;
  };

  function computeDynasty() {
    fitPtsToWar();
    var d = E.DISCOUNT, lam = E.LAMBDA, dpw = E.dollarPerWAR, minS = E.RULES.minSalary, rem = E.remFrac();
    E.P.forEach(function (p) {
      var pr = E.projectYears(p);
      p._pros = pr.pros;
      p.yWar = pr.war;
      var cp = E.costPath(p, pr.war);
      p.yCost = cp.cost; p.yStatus = cp.status; p.grad = cp.grad; p.yDec = cp.dec;
      var dv = 0, sur = 0, tal = 0;
      p.yVal = [];
      for (var y = 0; y < 7; y++) {
        var c = cp.cost[y], w = Math.max(0, pr.war[y]), val = 0;
        if (c === null && p.gm) { p.yVal.push(0); continue; }           // UFA: rights end
        if (!p.gm && y > 0) { p.yVal.push(0); continue; }             // free agent: only this season is controllable
        if (c === null) c = minS;                                     // free agent: signable near the minimum
        var cap = Math.max(0, c - minS) / E.dpwY(y);                  // cap cost in win units (a $ buys less as the cap rises)
        val = w - lam * cap;
        if (/^(RFA|ELC ext)/.test(cp.status[y]) && val < 0) val = 0;   // team simply declines the RFA
        if (cp.status[y] === 'contract' || cp.status[y] === p.ct) {  // can drop: 50% dead cap (free for FA contracts)
          val = Math.max(val, E.deadCapCounts(p) ? -lam * E.RULES.deadCapPct * c / E.dpwY(y) : 0);
        }
        p.yVal.push(val);
        dv += Math.pow(d, y) * val * (y === 0 ? rem : 1);   // 2026-27: only the part of the season still to play
        tal += Math.pow(d, y) * w;
        sur += Math.pow(d, y) * (w * E.dpwY(y) + minS - (c || 0));
      }
      p.DV = dv; p.talent = tal; p.dSurplus = sur;
      p.pv = pr.pros ? pr.pros.peak : 0;
    });
    // prospect value rank among MNR
    var m = E.P.filter(function (p) { return p.ct === 'MNR' || (!p.gm && (p.age || 30) < 22); }).sort(function (a, b) { return b.DV - a.DV; });
    m.forEach(function (p, i) { p.prRank = i + 1; });
  }
  E.recomputeDynasty = computeDynasty;

  // ---------------------------------------------------------------- MNR graduation (this season)
  E.graduation = function (p) {
    var need = p.gradThr - (p.cgp || 0), res = { need: need, thr: p.gradThr, cgp: p.cgp || 0, week: null, date: null, prob: 0 };
    if (need <= 0) { res.status = 'graduated'; res.prob = 1; return res; }
    if (!p.r || !p.nt26 || p.projGP <= 0) { res.status = 'not projected'; return res; }
    var cum = 0, skipped = 0;
    for (var wi = 0; wi < E.REG_WEEKS + 3; wi++) {
      if (E.injuredOut && E.injuredOut(p, wi)) { skipped++; continue; } // injured / holding out: no games that week
      cum += E.games(p, wi).m;
      if (cum >= need - 1e-9) { res.week = wi; break; }
    }
    res.delayed = skipped;
    // P(projected GP >= need): projected GP ~ Normal(proj, sd = 0.3 * proj + 4)
    var sd = 0.3 * p.projGP + 4;
    res.prob = 1 - E.Phi((need - 0.5 - p.projGP) / sd);
    res.status = res.week !== null ? 'projected' : 'stays MNR';
    if (res.week !== null) {
      // date of the game that crosses the threshold (expected-value approximation)
      var games = DP.nhl.sched[p.nt26] || [], c2 = 0;
      for (var i = 0; i < games.length; i++) {
        if (skipped && E.dayWeek[games[i][0]] < skipped) continue;
        c2 += p.avail;
        if (c2 >= need - 1e-9) { res.date = E.dateOfDay(games[i][0]); break; }
      }
    }
    return res;
  };

  // ---------------------------------------------------------------- calendar: which week is live / next to lock
  E.now = function () { return DP.nowOverride ? new Date(DP.nowOverride) : new Date(); };
  E.lockTime = function (wi) { // lineups lock when the Fantrax period starts (first puck drop); fallback 7 PM ET
    var w = E.weeks[wi]; return w ? new Date(w.lock || (w.start + 'T19:00:00-04:00')) : null;
  };
  E.lockWeek = function () { // week index your lineup changes apply to now (null after the last lock)
    var t = E.now().getTime();
    for (var i = 0; i < E.NW; i++) if (E.lockTime(i).getTime() > t) return i;
    return null;
  };
  E.nowWeek = function () { // week in progress (-1 before the season starts)
    var lw = E.lockWeek(); return lw === null ? E.NW - 1 : lw - 1;
  };
  E.opponent = function (team, wi) {
    var g = DP.meta.h2h.find(function (m) { return m[0] === wi + 1 && (m[1] === team || m[2] === team); });
    return g ? (g[1] === team ? g[2] : g[1]) : null;
  };

  // ---------------------------------------------------------------- actual standings (Fantrax) as the sim's starting point
  // Fantrax category standings: every matchup gives each team 15 results, so W+L+T = 15 x weeks played.
  E.actual = function () {
    var st = (DP.live && DP.live.standings) || DP.league.standings || [];
    var tot = st.map(function (r) { return r.W + r.L + r.T; }), mx = tot.length ? Math.max.apply(null, tot) : 0;
    if (!mx) return null;
    if (mx % E.NC) return { done: 0, rec: {}, odd: true, list: st };
    var rec = {}; st.forEach(function (r) { rec[r.t] = r; });
    return { done: Math.min(E.REG_WEEKS, mx / E.NC), rec: rec, list: st };
  };

  // Fantrax lineup check: the lineup a team has set (ACTIVE slots) vs the optimal weekly-lock lineup
  E.setLineupIds = function (team) {
    var act = {}, n = 0;
    (E.rosters[team] || []).forEach(function (p) { if (p.fs === 'A') { act[p.id] = 1; n++; } });
    return n ? act : null;
  };
  E.lineupCheck = function (team, wi) {
    var ros = E.rosters[team], act = E.setLineupIds(team);
    if (!act || wi === null || wi === undefined) return null;
    var opt = E.teamWeek(ros, wi, { injuries: true }), set = E.teamWeek(ros, wi, { only: act, injuries: true });
    var opp = E.opponent(team, wi), oppW = null;
    if (opp) { var oa = E.setLineupIds(opp); oppW = E.teamWeek(E.rosters[opp], wi, oa ? { only: oa, injuries: true } : { injuries: true }); }
    var exp = function (A) {
      if (oppW) return E.sum(E.matchupProbs(A, oppW).map(function (x) { return x.w + x.t / 2; }));
      var s = 0, n = 0; // playoffs / bye: average over the league's optimal lineups
      E.teams.forEach(function (u) { if (u !== team) { s += E.sum(E.matchupProbs(A, E.baseline[u][wi]).map(function (x) { return x.w + x.t / 2; })); n++; } });
      return s / n;
    };
    var ids = function (lu) { var o = {}; lu.F.concat(lu.D, lu.G).forEach(function (x) { o[x.p.id] = x; }); return o; };
    var io = ids(opt.lu), is = ids(set.lu);
    var start = Object.keys(io).filter(function (id) { return !is[id]; }).map(function (id) { return io[id]; });
    var sit = Object.keys(is).filter(function (id) { return !io[id]; }).map(function (id) { return is[id]; });
    var hurt = ros.filter(function (p) { return act[p.id] && p.r && E.injuredOut(p, wi); });
    var dead = ros.filter(function (p) { return act[p.id] && (!p.r || !E.games(p, wi).N); });
    var byV = function (a, b) { return b.v - a.v; };
    // activating someone from IR puts his salary back on this season's cap
    var irUp = start.filter(function (x) { return x.p.fs === 'IR' && E.RULES.irCapExempt !== false; }), irCap = null;
    if (irUp.length) { var irSal = E.sum(irUp.map(function (x) { return typeof x.p.cy[0] === 'number' ? x.p.cy[0] : 0; })); irCap = { sal: irSal, space: E.teamCap(team)[0].space - irSal }; }
    // promoting an MNR player from a Minors slot: if he is on the active roster when he graduates, he can't go back down
    var gradRisk = start.filter(function (x) { return x.p.fs === 'M' && x.p.ct === 'MNR'; }).map(function (x) { return { p: x.p, g: E.graduation(x.p) }; })
      .filter(function (x) { return x.g.status === 'graduated' || x.g.week !== null; });
    return { wi: wi, opp: opp, opt: opt, set: set, eOpt: exp(opt), eSet: exp(set), start: start.sort(byV), sit: sit.sort(byV).reverse(),
      hurt: hurt, dead: dead, nAct: Object.keys(act).length, gFailSet: set.r.gFail, gFailOpt: opt.r.gFail, irCap: irCap, gradRisk: gradRisk };
  };

  // ---------------------------------------------------------------- league weeks & expected standings
  E.leagueWeeks = function (rosters) {
    rosters = rosters || E.rosters;
    var out = {};
    E.teams.forEach(function (t) {
      out[t] = [];
      for (var wi = 0; wi < E.NW; wi++) out[t].push(E.teamWeek(rosters[t], wi));
    });
    return out;
  };
  E.expectedStandings = function (weeksByTeam) {
    var rec = {}, act = E.actual(), done = act ? act.done : 0;
    E.teams.forEach(function (t) {
      var r0 = act && act.rec[t];
      rec[t] = { t: t, W: r0 ? r0.W : 0, L: r0 ? r0.L : 0, T: r0 ? r0.T : 0, cats: new Array(E.NC).fill(0), mw: 0 };
    });
    DP.meta.h2h.forEach(function (g) {
      var wi = g[0] - 1, a = g[1], b = g[2];
      if (wi < done) return; // already played: the Fantrax record is in the starting totals
      var pr = E.matchupProbs(weeksByTeam[a][wi], weeksByTeam[b][wi]);
      var ea = 0, eb = 0;
      pr.forEach(function (x, c) {
        rec[a].W += x.w; rec[a].L += x.l; rec[a].T += x.t; rec[a].cats[c] += x.w + 0.5 * x.t;
        rec[b].W += x.l; rec[b].L += x.w; rec[b].T += x.t; rec[b].cats[c] += x.l + 0.5 * x.t;
        ea += x.w + x.t / 2; eb += x.l + x.t / 2;
      });
    });
    var list = E.teams.map(function (t) {
      var r = rec[t]; r.pct = (r.W + 0.5 * r.T) / Math.max(1, r.W + r.L + r.T); return r;
    }).sort(function (a, b) { return b.pct - a.pct; });
    list.forEach(function (r, i) { r.rank = i + 1; });
    return list;
  };

  // team category strength: average weekly (7-day) expected total per category for starters, and league rank
  E.teamCats = function (weeksByTeam) {
    weeksByTeam = weeksByTeam || E.baseline;
    var out = {};
    E.teams.forEach(function (t) {
      var v = new Array(E.NC).fill(0), n = 0;
      for (var wi = 0; wi < E.REG_WEEKS; wi++) {
        var cv = E.catVec(weeksByTeam[t][wi]), f = 7 / E.weeks[wi].days;
        for (var c = 0; c < E.NC; c++) v[c] += (E.CATS[c].ratio ? (cv.mu[c] || 0) : cv.mu[c] * f);
        n++;
      }
      out[t] = v.map(function (x) { return x / n; });
    });
    var ranks = {};
    E.teams.forEach(function (t) { ranks[t] = new Array(E.NC); });
    for (var c = 0; c < E.NC; c++) {
      var order = E.teams.slice().sort(function (a, b) { return E.CATS[c].low ? out[a][c] - out[b][c] : out[b][c] - out[a][c]; });
      order.forEach(function (t, i) { ranks[t][c] = i + 1; });
    }
    var z = {};
    E.teams.forEach(function (t) {
      z[t] = out[t].map(function (x, c) {
        var vals = E.teams.map(function (u) { return out[u][c]; }), m = sum(vals) / vals.length;
        var sd = Math.sqrt(sum(vals.map(function (q) { return (q - m) * (q - m); })) / vals.length) || 1;
        return (E.CATS[c].low ? m - x : x - m) / sd;
      });
    });
    return { avg: out, rank: ranks, z: z };
  };

  // marginal category-win gradient for a team: how many season cat wins +1 unit (per 7-day week) buys, by cat
  E.catGradient = function (team, weeksByTeam) {
    weeksByTeam = weeksByTeam || E.baseline;
    var g = new Array(E.NC).fill(0);
    DP.meta.h2h.forEach(function (m) {
      var wi = m[0] - 1, a = m[1], b = m[2];
      if (a !== team && b !== team) return;
      var me = E.catVec(weeksByTeam[team][wi]), op = E.catVec(weeksByTeam[a === team ? b : a][wi]);
      for (var c = 0; c < E.NC; c++) {
        if (me.mu[c] === null || op.mu[c] === null) continue;
        var mu = me.mu[c] - op.mu[c], sd = Math.sqrt(me.va[c] + op.va[c]);
        if (E.CATS[c].low) mu = -mu;
        g[c] += E.phi(mu / sd) / sd;
      }
    });
    return g;
  };

  // ---------------------------------------------------------------- roster what-ifs
  // rosters after moves: moves = [{id, to}] (to = team code or null for FA/drop)
  E.applyMoves = function (moves) {
    var R = {};
    E.teams.forEach(function (t) { R[t] = E.rosters[t].slice(); });
    moves.forEach(function (mv) {
      var p = E.byId[mv.id];
      if (!p) return;
      E.teams.forEach(function (t) { var i = R[t].indexOf(p); if (i >= 0) R[t].splice(i, 1); });
      if (mv.to && R[mv.to]) R[mv.to].push(p);
    });
    return R;
  };
  E.weeksFor = function (rosters, teams) {
    var out = {};
    E.teams.forEach(function (t) {
      if (teams.indexOf(t) < 0) { out[t] = E.baseline[t]; return; }
      out[t] = [];
      for (var wi = 0; wi < E.NW; wi++) out[t].push(E.teamWeek(rosters[t], wi));
    });
    return out;
  };

  // weeks a roster move can still affect: from the next lineup lock on (weeks already locked or played are settled)
  E.openFrom = function () { var lw = E.lockWeek(); return lw === null ? E.NW : lw; };
  // share of the regular season's NHL games still ahead of the next lock (1 before the season, 0 after the last lock)
  E.remFrac = function () {
    var from = E.openFrom(), all = 0, left = 0;
    E.weeks.forEach(function (w, wi) { if (w.po) return; all += E.avgWeekGames[wi]; if (wi >= from) left += E.avgWeekGames[wi]; });
    return all ? left / all : 1;
  };
  // expected regular-season category wins (W + T/2) for one team given a roster, over the weeks still open
  // (exact: re-optimises every week)
  E.seasonCatWins = function (team, roster, oppWeeks) {
    oppWeeks = oppWeeks || E.baseline;
    var tot = 0, byCat = new Array(E.NC).fill(0), cache = {}, from = E.openFrom();
    DP.meta.h2h.forEach(function (m) {
      var wi = m[0] - 1, a = m[1], b = m[2];
      if (a !== team && b !== team) return;
      if (wi < from) return;
      var mine = cache[wi] || (cache[wi] = E.teamWeek(roster, wi));
      var pr = E.matchupProbs(mine, oppWeeks[a === team ? b : a][wi]);
      pr.forEach(function (x, c) { var v = x.w + 0.5 * x.t; tot += v; byCat[c] += v; });
    });
    return { total: tot, byCat: byCat };
  };
  E._baseWins = {};
  E.baseWins = function (team) {
    var k = team + ':' + E.version + ':' + E.openFrom();
    if (!E._baseWins[k]) E._baseWins[k] = E.seasonCatWins(team, E.rosters[team]);
    return E._baseWins[k];
  };
  // change in a team's expected season category wins from adding / removing players
  E.gain = function (team, add, remove) {
    var ids = {}; (remove || []).forEach(function (p) { ids[p.id] = 1; });
    var roster = E.rosters[team].filter(function (p) { return !ids[p.id]; }).concat(add || []);
    var after = E.seasonCatWins(team, roster), base = E.baseWins(team);
    return { total: after.total - base.total, byCat: after.byCat.map(function (x, c) { return x - base.byCat[c]; }), after: after };
  };
  // quick linear estimate of the same thing (for ranking hundreds of candidates before the exact pass)
  E.quickGain = function (team, p) {
    if (!p.r) return 0;
    var g = E._grad && E._grad.team === team && E._grad.v === E.version ? E._grad.g : (E._grad = { team: team, v: E.version, g: E.catGradient(team) }).g;
    var wk = E.REG_WEEKS, games = p.nt26 ? E.sum(E.wg[p.nt26].slice(0, wk)) / wk * p.avail : 0;
    var r = p.r, val;
    if (p.G) {
      val = games * (r.w * g[11] + r.sho * g[14]) + (E.lg.gaa - r.gaa) * games / E.lg.avgTeamGGP * g[12] + (r.sv - E.lg.sv) * games * r.sa / E.lg.avgTeamSA * g[13];
    } else {
      val = games * (r.PtD * g[0] + r.G * (g[1] + 2 * g[3]) + r.A * (g[2] + g[3]) + r.PIM * g[4] + r.SOG * g[5] + r.STP * g[6] + r.Hit * g[7] + r.Blk * g[8] + r.Tk * g[9] + r.Cor * g[10]);
    }
    return val;
  };

  // run fn with temporarily modified category weights (e.g. a punt): mult = {catKey: factor}
  E.withWeights = function (mult, fn) {
    var saved = E.W8, w = {};
    Object.keys(saved).forEach(function (k) { w[k] = saved[k] * (mult[k] === undefined ? 1 : mult[k]); });
    E.W8 = w;
    try { return fn(); } finally { E.W8 = saved; }
  };
  // punt analysis: expected season cat wins if the lineup optimizer ignores one category
  E.puntAnalysis = function (team) {
    var base = E.baseWins(team), out = [];
    E.CATS.forEach(function (cat, c) {
      var m = {}; m[cat.k] = 0;
      var res = E.withWeights(m, function () { return E.seasonCatWins(team, E.rosters[team]); });
      out.push({ c: c, total: res.total - base.total, own: res.byCat[c] - base.byCat[c], others: (res.total - res.byCat[c]) - (base.total - base.byCat[c]) });
    });
    return out;
  };
  // projected team strength by season: sum of the best 12F/6D/2G projected WAR from the current roster
  E.windowStrength = function (team, roster) {
    roster = roster || E.rosters[team];
    return E.YEARS.map(function (_, y) {
      var f = [], d = [], g = [];
      roster.forEach(function (p) {
        if (!p.yWar) return;
        if (p.gm && p.yCost && p.yCost[y] === null) return; // rights expire (UFA)
        var w = p.yWar[y];
        (p.slot === 'G' ? g : p.slot === 'D' ? d : f).push(w);
      });
      var top = function (a, n) { return a.sort(function (x, z) { return z - x; }).slice(0, n).reduce(function (s, v) { return s + Math.max(0, v); }, 0); };
      return top(f, 12) + top(d, 6) + top(g, 2);
    });
  };

  // ---------------------------------------------------------------- cap
  // committed cap by team and year ($M), plus dead cap entries (added by what-if tools)
  E.teamCap = function (team, roster, dead) {
    roster = roster || E.rosters[team];
    var yrs = E.YEARS.map(function (_, y) { return { total: 0, byType: {}, n: 0, cap: E.capY(y), ir: 0, irP: [] }; });
    var irOk = E.RULES.irCapExempt !== false;
    roster.forEach(function (p) {
      p.cy.forEach(function (v, y) {
        if (typeof v !== 'number') return;
        if (y === 0 && irOk && p.fs === 'IR') { yrs[0].ir += v; yrs[0].irP.push(p); yrs[0].n++; return; } // IR: off this season's cap
        yrs[y].total += v; yrs[y].n++;
        var ty = y === 0 ? p.ct : (p.yStatus && p.yStatus[y] === 'ELC' ? 'ELC1' : p.ct);
        yrs[y].byType[ty] = (yrs[y].byType[ty] || 0) + v;
      });
    });
    (dead || []).concat(E.penaltiesOf(team)).forEach(function (d) {
      d.amt.forEach(function (a, y) { if (a) { yrs[y].total += a; yrs[y].byType.Dead = (yrs[y].byType.Dead || 0) + a; } });
    });
    yrs.forEach(function (x) { x.space = x.cap - x.total; });
    return yrs;
  };
  // existing cap hit penalties from dropped contracts (DP.league.penalties: contract sheet + commissioner CSV + drops seen in Fantrax)
  E.penaltiesOf = function (team) {
    return ((DP.league && DP.league.penalties) || []).filter(function (x) { return x.gm === team; });
  };
  E.deadCapCounts = function (p) { return (E.RULES.deadCapContracts || ['BID', 'ELC1', 'RFA1']).indexOf(p.ct) >= 0; };
  E.deadCap = function (p) { // 50% of each remaining contract year's salary (BID/ELC/RFA1 only; dropping an FA contract is free)
    var pct = E.RULES.deadCapPct, counts = E.deadCapCounts(p);
    return p.cy.map(function (v) { return counts && typeof v === 'number' && v > 0 ? v * pct : 0; });
  };
  E.extPrices = function (sal, scale) {
    var s = scale || E.initFormula();
    return s.base.map(function (b, i) { return Math.round((s.mult[i] * sal + b) * 1000) / 1000; });
  };

  // ---------------------------------------------------------------- valuation lenses, draft picks, trades
  // A lens = how a GM weighs things: lam (share of cap cost counted), disc (yearly discount), pick (pick multiplier),
  // now (extra weight on the 2026-27 season).
  E.LENS_MODEL = { key: 'model', name: 'Model default', lam: 0.5, disc: 0.85, pick: 1, now: 1 };
  E.dvWith = function (p, L) {
    L = L || E.LENS_MODEL;
    if (!p.yWar) return 0;
    var dpw = E.dollarPerWAR, minS = E.RULES.minSalary, v = 0, rem = E.remFrac();
    for (var y = 0; y < 7; y++) {
      var c = p.yCost[y], w = Math.max(0, p.yWar[y]);
      if (c === null && p.gm) continue;
      if (!p.gm && y > 0) continue;
      if (c === null) c = minS;
      var dy = E.dpwY(y), val = w - L.lam * Math.max(0, c - minS) / dy;
      if (/^(RFA|ELC ext)/.test(p.yStatus[y]) && val < 0) val = 0;
      if (p.yStatus[y] === 'contract' || p.yStatus[y] === p.ct) val = Math.max(val, E.deadCapCounts(p) ? -L.lam * E.RULES.deadCapPct * c / dy : 0);
      void dpw;
      v += Math.pow(L.disc, y) * val * (y === 0 ? L.now * rem : 1);
    }
    return v;
  };
  // league-draft value curve. Preferred: the league's real 2026 rookie draft (value today of the player actually taken
  // at each slot, smoothed with a decreasing isotonic fit). Fallback: 2026 draftees on rosters sorted by value.
  E.pickCurve = function () {
    if (E._pc && E._pc.v === E.version) return E._pc.c;
    var n = E.teams.length * 3, raw = [], src = 'rostered 2026 class';
    var d = DP.league && DP.league.drafts && DP.league.drafts['2026'];
    if (d && d.picks && d.picks.length) {
      src = 'league 2026 rookie draft';
      d.picks.slice().sort(function (a, b) { return a.ov - b.ov; }).forEach(function (pk) {
        var p = pk.id && E.byId[pk.id]; raw.push(p ? Math.max(0, p.DV) : 0);
      });
    } else {
      raw = E.P.filter(function (p) { return p.gm && p.ct === 'MNR' && p.dr && p.dr[0] === 2026; })
        .map(function (p) { return Math.max(0, p.DV); }).sort(function (a, b) { return b - a; });
    }
    while (raw.length < n) raw.push((raw[raw.length - 1] || 0.5) * 0.92);
    raw = raw.slice(0, n);
    // isotonic (non-increasing) regression by pool-adjacent-violators
    var blocks = raw.map(function (v) { return { s: v, n: 1 }; });
    for (var i = 0; i < blocks.length - 1;) {
      if (blocks[i].s / blocks[i].n < blocks[i + 1].s / blocks[i + 1].n) {
        blocks[i].s += blocks[i + 1].s; blocks[i].n += blocks[i + 1].n; blocks.splice(i + 1, 1); if (i > 0) i--;
      } else i++;
    }
    var c = [];
    blocks.forEach(function (b) { for (var k = 0; k < b.n; k++) c.push(b.s / b.n); });
    // option-value floor: even a late pick is a lottery ticket (and a trade sweetener)
    c = c.map(function (v, k) { return Math.max(v, 0.3 * Math.pow(0.97, k)); });
    E._pc = { v: E.version, c: c, raw: raw, src: src };
    return c;
  };
  // probability of each draft slot (1..14) for a team's 2027 pick, from a cached season simulation
  E.slotDist = function (team) {
    if (!E._slots || E._slots.v !== E.version) {
      var sim = E.baseSim(), d = {};
      sim.forEach(function (r) { d[r.t] = r.slot; });
      E._slots = { v: E.version, d: d };
    }
    return E._slots.d[team];
  };
  E.pickValue = function (pk, L) {
    L = L || E.LENS_MODEL;
    var c = E.pickCurve(), n = E.teams.length, dist = E.slotDist(pk.orig), v = 0, flat = 0;
    for (var k = 0; k < n; k++) {
      var cv = c[U((pk.round - 1) * n + k, c)];
      v += (dist ? dist[k] : 1 / n) * cv; flat += cv / n;
    }
    var w = pk.year <= 2027 ? 1 : pk.year === 2028 ? 0.5 : 0.25;   // later years: regress toward an average slot
    var years = Math.max(0, pk.year - 2026);
    return (w * v + (1 - w) * flat) * Math.pow(L.disc, years) * L.pick;
  };
  E.expSlot = function (team, year) {
    var d = E.slotDist(team), n = E.teams.length, m = 0;
    for (var k = 0; k < n; k++) m += (d ? d[k] : 1 / n) * (k + 1);
    var w = year <= 2027 ? 1 : year === 2028 ? 0.5 : 0.25;
    return w * m + (1 - w) * (n + 1) / 2;
  };
  function U(i, c) { return Math.max(0, Math.min(c.length - 1, i)); }
  E.pickOverall = function (pk) { return Math.round((pk.round - 1) * E.teams.length + E.expSlot(pk.orig, pk.year)); };
  E.picksOf = function (team) {
    return (DP.league && DP.league.picks || []).filter(function (p) { return p.owner === team && p.year >= 2027; });
  };
  E.pickKey = function (pk) { return pk.year + '-' + pk.round + '-' + pk.orig; };
  E.pickByKey = function (k) {
    var a = k.split('-');
    return (DP.league.picks || []).find(function (p) { return p.year === +a[0] && p.round === +a[1] && p.orig === a.slice(2).join('-'); });
  };
  E.pickLabel = function (pk) { return pk.year + ' R' + pk.round + (pk.orig !== pk.owner ? ' (' + pk.orig + ')' : ''); };

  // value of an asset under a lens: {kind:'player', p} | {kind:'pick', pk} | {kind:'cap', amt}
  E.assetValue = function (a, L) {
    L = L || E.LENS_MODEL;
    if (a.kind === 'player') return a.p ? E.dvWith(a.p, L) : 0;
    if (a.kind === 'pick') return E.pickValue(a.pk, L);
    if (a.kind === 'cap') return L.lam * a.amt / E.dollarPerWAR; // cap space handed over this season
    return 0;
  };

  // fit a lens to the league's real trades: minimise squared relative imbalance (grid search)
  E.fitLeagueLens = function () {
    if (E._fit && E._fit.v === E.version) return E._fit.res;
    var trades = (DP.league && DP.league.trades) || [];
    var usable = trades.map(function (t) {
      var sides = {};
      t.moves.forEach(function (m) {
        var a = null;
        if (m.kind === 'player' && m.id && E.byId[m.id]) a = { kind: 'player', p: E.byId[m.id] };
        else if (m.kind === 'pick' && m.year >= 2027) a = { kind: 'pick', pk: { year: m.year, round: m.round, orig: m.orig } };
        else if (m.kind === 'pick') a = { kind: 'usedpick', year: m.year, round: m.round, orig: m.orig };
        else if (m.kind === 'cap') a = { kind: 'cap', amt: m.amt };
        if (!a) return;
        (sides[m.to] = sides[m.to] || []).push(a);
      });
      return { t: t, sides: sides };
    }).filter(function (x) { return Object.keys(x.sides).length >= 2; });
    // used 2026 picks: value them as the player picked with that slot today (curve at a mid-round slot, no discount)
    var curve = E.pickCurve(), n = E.teams.length;
    var val = function (a, L) {
      if (a.kind === 'usedpick') return curve[Math.round((a.round - 1) * n + n / 2)] * L.pick;
      return E.assetValue(a, L);
    };
    var best = null, grid = [];
    [0, 0.25, 0.5, 0.75, 1].forEach(function (lam) {
      [0.7, 0.8, 0.85, 0.9, 0.95].forEach(function (disc) {
        [0.5, 1, 1.5, 2, 3, 4, 6, 8, 10].forEach(function (pick) {
          [0.5, 1, 1.5, 2].forEach(function (now) {
            var L = { lam: lam, disc: disc, pick: pick, now: now }, err = 0;
            usable.forEach(function (x) {
              var vals = Object.keys(x.sides).map(function (k) { return x.sides[k].reduce(function (s, a) { return s + Math.max(0, val(a, L)); }, 0); });
              var tot = vals.reduce(function (s, v) { return s + v; }, 0) || 1;
              var mean = tot / vals.length;
              vals.forEach(function (v) { err += Math.pow((v - mean) / tot, 2); });
            });
            grid.push({ L: L, err: err });
            if (!best || err < best.err) best = { L: L, err: err };
          });
        });
      });
    });
    var res = { key: 'league', name: 'League-implied (fit to ' + usable.length + ' trades)', lam: best.L.lam, disc: best.L.disc, pick: best.L.pick, now: best.L.now, err: best.err, n: usable.length,
      base: grid.find(function (g) { return g.L.lam === 0.5 && g.L.disc === 0.85 && g.L.pick === 1 && g.L.now === 1; }).err };
    E._fit = { v: E.version, res: res };
    return res;
  };

  // evaluate a trade: moves = [{asset, from, to}] ; returns per-team value in/out under a lens
  E.tradeValue = function (moves, L) {
    var out = {};
    moves.forEach(function (m) {
      var v = E.assetValue(m.asset, L);
      out[m.to] = out[m.to] || { in: 0, out: 0 }; out[m.from] = out[m.from] || { in: 0, out: 0 };
      out[m.to].in += v; out[m.from].out += v;
    });
    Object.keys(out).forEach(function (t) { out[t].net = out[t].in - out[t].out; });
    return out;
  };

  // ---------------------------------------------------------------- contention & team-context ("use") value
  // One cached 1,500-season sim shared by title odds, draft-slot odds and contention, so every page shows the same numbers.
  E.baseSim = function () {
    if (!E._bsim || E._bsim.v !== E.version) E._bsim = { v: E.version, n: 1500, res: E.simSeason({ n: 1500 }) };
    return E._bsim.res;
  };
  // Win-now weight: what one more category win this season is worth to a team, relative to the league average.
  // Title odds behave like a softmax of team strength, so d(title odds)/d(strength) is proportional to p(1-p): steep for
  // the few real contenders, close to zero for everyone else. A floor keeps some credit for this-season production
  // (it can be flipped at the deadline). Later seasons: the same curve on each roster's projected strength, shrunk
  // toward 1 (rosters change a lot), so future value counts about the same for every team.
  E.CONTEND = { floor: 0.2, shrink: 0.5, contender: 1.5, bubble: 0.6 };
  E.contention = function () {
    if (E._cont && E._cont.v === E.version) return E._cont.d;
    var K = E.CONTEND, teams = E.teams, n = teams.length, sim = E.baseSim(), by = {};
    sim.forEach(function (r) { by[r.t] = r; });
    var S = teams.map(function (t) { return E.windowStrength(t); });
    var soft = function (xs, b) { var m = Math.max.apply(null, xs), e = xs.map(function (x) { return Math.exp(b * (x - m)); }), z = sum(e); return e.map(function (v) { return v / z; }); };
    var c0 = teams.map(function (t) { return by[t].champ; }), s0 = S.map(function (s) { return s[0]; });
    // fit beta (title odds per WAR of lineup strength) to this season's sim by maximum likelihood (golden section)
    var ll = function (b) { var p = soft(s0, b); return sum(c0.map(function (c, i) { return c * Math.log(Math.max(1e-12, p[i])); })); };
    var a = 0, b = 0.5, gr = (Math.sqrt(5) - 1) / 2;
    for (var it = 0; it < 60; it++) { var x1 = b - gr * (b - a), x2 = a + gr * (b - a); if (ll(x1) > ll(x2)) b = x2; else a = x1; }
    var beta = (a + b) / 2;
    var lev = function (p) { var g = p.map(function (x) { return x * (1 - x); }), m = sum(g) / n || 1; return g.map(function (x) { return K.floor + (1 - K.floor) * x / m; }); };
    var k0 = lev(c0), share = [c0], ks = [k0];
    for (var y = 1; y < E.YEARS.length; y++) {
      var py = soft(S.map(function (s) { return s[y]; }), beta), w = Math.pow(K.shrink, y);
      share.push(py); ks.push(lev(py).map(function (k) { return 1 + w * (k - 1); }));
    }
    var d = {};
    teams.forEach(function (t, i) {
      var k = ks.map(function (row) { return row[i]; }), sh = share.map(function (row) { return row[i]; });
      var tier = k[0] >= K.contender ? 'contender' : k[0] >= K.bubble ? 'bubble' : 'out';
      // rising: within 3 seasons the core already under contract projects a title share 1.5x the league average
      var rise = null; for (var yy = 1; yy <= 3; yy++) if (sh[yy] >= 1.5 / n && sh[yy] > sh[0]) { rise = yy; break; }
      d[t] = { t: t, champ: by[t].champ, po: by[t].po, k: k, share: sh, tier: tier, rise: rise, strength: S[i] };
    });
    d._beta = beta;
    E._cont = { v: E.version, d: d };
    return d;
  };
  E.TIER = { contender: 'Contender', bubble: 'Bubble', out: 'Not contending' };
  // What incoming / outgoing players are worth to ONE team, given its roster, needs and window ("use value"):
  //   2026-27: change in expected category wins with weekly lineups re-optimised (E.gain: depth, positions, category fit)
  //   later:   change in the team's best projected 12F/6D/2G WAR (seasons it controls the player)
  //   each season x that team's win-now weight for the season, minus the cap cost counted by the lens, discounted.
  E.useValue = function (team, add, remove, L) {
    L = L || E.LENS_MODEL; add = add || []; remove = remove || [];
    var c = E.contention()[team], ids = {}, minS = E.RULES.minSalary;
    remove.forEach(function (p) { ids[p.id] = 1; });
    var before = E.rosters[team], after = before.filter(function (p) { return !ids[p.id]; }).concat(add);
    var sB = E.windowStrength(team, before), sA = E.windowStrength(team, after);
    var g0 = add.length || remove.length ? E.gain(team, add, remove).total : 0;
    var cost = function (list, y) { return sum(list.map(function (p) { var v = p.yCost && p.yCost[y]; return typeof v === 'number' ? Math.max(0, v - minS) : 0; })); };
    var out = { now: 0, later: 0, total: 0, byYear: [], k: c.k, tier: c.tier, g0: g0 }, rem = E.remFrac();
    for (var y = 0; y < E.YEARS.length; y++) {
      var dl = y === 0 ? g0 : sA[y] - sB[y], dc = (cost(add, y) - cost(remove, y)) * L.lam / E.dpwY(y) * (y === 0 ? rem : 1);
      var v = Math.pow(L.disc, y) * c.k[y] * (dl - dc) * (y === 0 ? L.now : 1);
      out.byYear.push(v); out.total += v; if (y === 0) out.now += v; else out.later += v;
    }
    return out;
  };
  // use value of a whole trade for every team in it (picks count at their lens value: a future asset is worth
  // about the same to everyone)
  E.tradeUse = function (moves, L) {
    var out = {}, teams = [];
    moves.forEach(function (m) { [m.from, m.to].forEach(function (t) { if (teams.indexOf(t) < 0) teams.push(t); }); });
    teams.forEach(function (t) {
      var add = moves.filter(function (m) { return m.to === t && m.asset.kind === 'player'; }).map(function (m) { return m.asset.p; });
      var rem = moves.filter(function (m) { return m.from === t && m.asset.kind === 'player'; }).map(function (m) { return m.asset.p; });
      var u = E.useValue(t, add, rem, L), pk = 0;
      moves.forEach(function (m) { if (m.asset.kind === 'pick') { var v = E.pickValue(m.asset.pk, L); if (m.to === t) pk += v; if (m.from === t) pk -= v; } });
      u.picks = pk; u.total += pk; u.later += pk;
      out[t] = u;
    });
    return out;
  };
  // how much more a player is worth in `team`'s window than in his current team's (standalone yearly values x the
  // two teams' win-now weights; quick screen, the Trade Finder does the exact roster-fit math)
  E.valueGap = function (p, team, L) {
    L = L || E.LENS_MODEL;
    if (!p.yVal || !p.gm || p.gm === team) return 0;
    var C = E.contention(), a = C[team], b = C[p.gm], g = 0;
    var rem = E.remFrac();
    for (var y = 0; y < p.yVal.length; y++) g += Math.pow(L.disc, y) * (a.k[y] - b.k[y]) * p.yVal[y] * (y === 0 ? rem : 1);
    return g;
  };

  // ---------------------------------------------------------------- Monte Carlo season
  // precompute per team-week sampling params, then simulate the regular season + 8-team playoff
  E.simSeason = function (opts) {
    opts = opts || {};
    var N = opts.n || 2000, weeksBy = opts.weeks || E.baseline, rand = E.rng(opts.seed || 20262027), nrm = E.normalSampler(rand);
    var nPO = opts.playoffTeams || DP.meta.playoffs.teams, noise = opts.noise === undefined ? 0.035 : opts.noise;
    var teams = E.teams, nt = teams.length, idx = {};
    teams.forEach(function (t, i) { idx[t] = i; });
    // params[t][w] = {mu, sd, gcdf}
    var P = teams.map(function (t) {
      return weeksBy[t].map(function (agg) {
        var cv = E.catVec(agg), cdf = [], acc = 0;
        cv.gpmf.forEach(function (x) { acc += x; cdf.push(acc); });
        return { mu: cv.mu, sd: cv.va.map(Math.sqrt), cdf: cdf, ggp: agg.m.GGP };
      });
    });
    var act = opts.fromScratch ? null : E.actual(), done = act ? act.done : 0;
    var games = DP.meta.h2h.filter(function (g) { return g[0] - 1 >= done; }).map(function (g) { return [g[0] - 1, idx[g[1]], idx[g[2]]]; });
    var W0 = teams.map(function (t) { return act && act.rec[t] ? act.rec[t].W : 0; });
    var L0 = teams.map(function (t) { return act && act.rec[t] ? act.rec[t].L : 0; });
    var T0 = teams.map(function (t) { return act && act.rec[t] ? act.rec[t].T : 0; });
    var res = teams.map(function () {
      return { W: 0, L: 0, T: 0, seed: new Array(nt).fill(0), po: 0, r2: 0, fin: 0, champ: 0, first: 0, last: 0, slot: new Array(nt).fill(0) };
    });
    var minGP = E.RULES.goalieMinGP;
    var sample = function (pp, t, eps) { // one team-week draw -> 15 values (null ratio when no goalie games)
      var v = new Array(E.NC), mu = pp.mu, sd = pp.sd;
      var sm = 1 + eps[t];
      var G = Math.max(0, Math.round(mu[1] * sm + sd[1] * nrm()));
      var A = Math.max(0, Math.round(mu[2] * sm + sd[2] * nrm()));
      v[0] = Math.max(0, Math.round(mu[0] * sm + sd[0] * nrm()));
      v[1] = G; v[2] = A; v[3] = 2 * G + A;
      for (var c = 4; c <= 10; c++) {
        var x = Math.round(mu[c] * (c === 10 ? 1 : sm) + sd[c] * nrm() + (c === 10 ? eps[t] * 40 : 0));
        v[c] = c === 10 ? x : Math.max(0, x);
      }
      // goalie GP draw
      var u = rand(), ggp = 0;
      while (ggp < pp.cdf.length - 1 && u > pp.cdf[ggp]) ggp++;
      v.ggp = ggp;
      if (ggp === 0) { v[11] = 0; v[12] = null; v[13] = null; v[14] = 0; return v; }
      var scale = pp.ggp > 0 ? ggp / pp.ggp : 1;
      v[11] = Math.max(0, Math.round(mu[11] * scale + sd[11] * Math.sqrt(scale) * nrm()));
      v[12] = Math.max(0, mu[12] * (1 - eps[t] * 0.5) + sd[12] * nrm());
      v[13] = Math.min(1, mu[13] + eps[t] * 0.004 + sd[13] * nrm());
      v[14] = Math.max(0, Math.round(mu[14] * scale + sd[14] * Math.sqrt(scale) * nrm()));
      return v;
    };
    var compare = function (a, b) { // returns [catWinsA, catWinsB, ties] and per-cat outcome array
      var wa = 0, wb = 0, ti = 0;
      var fa = a.ggp < minGP, fb = b.ggp < minGP;
      for (var c = 0; c < E.NC; c++) {
        var grp = E.CATS[c].grp;
        if (grp === 'G' && (fa || fb)) {
          if (fa && fb) { continue; } // both lose (no winner): counted as a loss for both
          if (fa) wb++; else wa++;
          continue;
        }
        var x = a[c], y = b[c];
        if (x === y) { ti++; continue; }
        var better = E.CATS[c].low ? x < y : x > y;
        if (better) wa++; else wb++;
      }
      return [wa, wb, ti];
    };
    // playoff seeding: division winners take the top seeds when the league says so, then everyone else by record
    var divOf = teams.map(function (t) { return ((DP.league.fantrax || {}).divisions || {})[t] || ''; });
    var divSeed = (DP.meta.playoffs || {}).divisionWinnersTopSeeds && divOf.some(Boolean);
    var seedTeams = function (order) {
      if (!divSeed) return order;
      var seen = {}, winners = [];
      order.forEach(function (ti) { if (divOf[ti] && !seen[divOf[ti]]) { seen[divOf[ti]] = 1; winners.push(ti); } });
      return winners.concat(order.filter(function (ti) { return winners.indexOf(ti) < 0; }));
    };
    E.seedTeams = function (codes) { return seedTeams(codes.map(function (c) { return idx[c]; })).map(function (i) { return teams[i]; }); };
    var eps = new Array(nt);
    for (var s = 0; s < N; s++) {
      for (var t = 0; t < nt; t++) eps[t] = noise * nrm();
      var W = W0.slice(), L = L0.slice(), T = T0.slice();
      for (var gi = 0; gi < games.length; gi++) {
        var g = games[gi], a = sample(P[g[1]][g[0]], g[1], eps), b = sample(P[g[2]][g[0]], g[2], eps);
        var r = compare(a, b), lost = E.NC - r[0] - r[1] - r[2];
        W[g[1]] += r[0]; W[g[2]] += r[1]; T[g[1]] += r[2]; T[g[2]] += r[2];
        L[g[1]] += E.NC - r[0] - r[2]; L[g[2]] += E.NC - r[1] - r[2];
        void lost;
      }
      var order = [];
      for (t = 0; t < nt; t++) order.push(t);
      var pct = order.map(function (i) { return (W[i] + 0.5 * T[i]) / Math.max(1, W[i] + L[i] + T[i]) + rand() * 1e-9; });
      order.sort(function (x, y) { return pct[y] - pct[x]; });
      var seedOrder = seedTeams(order);
      seedOrder.forEach(function (ti, rk) { res[ti].seed[rk]++; });
      order.forEach(function (ti) { res[ti].W += W[ti]; res[ti].L += L[ti]; res[ti].T += T[ti]; });
      res[order[0]].first++; res[order[nt - 1]].last++;
      // playoffs: 1v8, 4v5, 3v6, 2v7 in week 25; winners meet in week 26; final week 27
      if (nPO >= 2) {
        var seeds = seedOrder.slice(0, nPO);
        seeds.forEach(function (ti) { res[ti].po++; });
        var play = function (x, y, wi) { // x = higher seed
          var a2 = sample(P[x][wi], x, eps), b2 = sample(P[y][wi], y, eps), r2 = compare(a2, b2);
          return r2[1] > r2[0] ? y : x;
        };
        var br = nPO === 8 ? [[0, 7], [3, 4], [2, 5], [1, 6]] : nPO === 6 ? null : nPO === 4 ? [[0, 3], [1, 2]] : null;
        var w0 = E.REG_WEEKS;
        if (nPO === 6) { // byes for seeds 1-2 (not this league's format; kept for what-ifs)
          var q1 = play(seeds[2], seeds[5], w0), q2 = play(seeds[3], seeds[4], w0);
          br = [[seeds[0], q2], [seeds[1], q1]];
          br.forEach(function (m) { res[m[0]].r2++; res[m[1]].r2++; });
          var f1 = play(br[0][0], br[0][1], w0 + 1), f2 = play(br[1][0], br[1][1], w0 + 1);
          res[f1].fin++; res[f2].fin++;
          var ch6 = seeds.indexOf(f1) < seeds.indexOf(f2) ? play(f1, f2, w0 + 2) : play(f2, f1, w0 + 2);
          res[ch6].champ++;
          continue;
        }
        var round = br.map(function (m) { return [seeds[m[0]], seeds[m[1]]]; }), wk = w0, elim = [];
        // league draft order: non-playoff teams 1..(n-nPO) worst first, then playoff teams by round of elimination
        // (earlier exit picks earlier; ties by worse regular-season record first), champion picks last
        var nonPO = order.filter(function (ti) { return seeds.indexOf(ti) < 0; }).reverse();
        nonPO.forEach(function (ti, k) { res[ti].slot[k]++; });
        var slotNext = nonPO.length;
        while (round.length >= 1) {
          var winners = round.map(function (m) { return play(m[0], m[1], Math.min(wk, E.NW - 1)); });
          var losers = round.map(function (m, k) { return m[0] === winners[k] ? m[1] : m[0]; })
            .sort(function (x, y) { return order.indexOf(y) - order.indexOf(x); });
          losers.forEach(function (ti) { res[ti].slot[slotNext++]++; });
          if (round.length === 2) winners.forEach(function (x) { res[x].fin++; });
          if (round.length === 4) winners.forEach(function (x) { res[x].r2++; });
          if (winners.length === 1) { res[winners[0]].champ++; res[winners[0]].slot[slotNext++]++; break; }
          var nxt = [];
          for (var k = 0; k < winners.length; k += 2) {
            var p1 = winners[k], p2 = winners[k + 1];
            nxt.push(seeds.indexOf(p1) < seeds.indexOf(p2) ? [p1, p2] : [p2, p1]);
          }
          round = nxt; wk++;
        }
      }
    }
    var out = teams.map(function (t, i) {
      var r = res[i];
      return { t: t, W: r.W / N, L: r.L / N, T: r.T / N, pct: (r.W + 0.5 * r.T) / Math.max(1, r.W + r.L + r.T),
        seed: r.seed.map(function (x) { return x / N; }), po: r.po / N, r2: r.r2 / N, fin: r.fin / N, champ: r.champ / N,
        first: r.first / N, last: r.last / N, slot: r.slot.map(function (x) { return x / N; }),
        avgSeed: r.seed.reduce(function (a, x, k) { return a + x * (k + 1); }, 0) / N };
    }).sort(function (a, b) { return b.pct - a.pct; });
    out.done = done;
    return out;
  };

  // ---------------------------------------------------------------- live scoreboard (week in progress)
  E.dayIndex = function (iso) { return Math.round((new Date(iso + 'T12:00:00Z').getTime() - E.seasonStart) / 864e5); };
  // expected games for a player from day d0 to the end of week wi
  E.gamesFrom = function (p, wi, d0) {
    if (!p.r || !p.nt26) return { m: 0, v: 0, N: 0 };
    var w = E.weeks[wi], end = w.d0 + w.days - 1, N = 0;
    (DP.nhl.sched[p.nt26] || []).forEach(function (r) { if (r[0] >= d0 && r[0] <= end) N++; });
    var a = p.avail; return { m: N * a, v: N * a * (1 - a), N: N };
  };
  // the rest of the week for the players active in Fantrax this period (weekly lock: the lineup can't change)
  E.restWeek = function (team, wi, d0, activeIds) {
    var only = {}; (activeIds || []).forEach(function (id) { only[id] = 1; });
    var ros = E.rosters[team] || [], lu = E.lineup(ros, wi, activeIds && activeIds.length ? { only: only } : null), agg = emptyAgg();
    lu.F.concat(lu.D).forEach(function (x) { addSkater(agg, x.p, E.gamesFrom(x.p, wi, d0)); });
    lu.G.forEach(function (x) { addGoalie(agg, x.p, E.gamesFrom(x.p, wi, d0)); });
    agg.r = ratios(agg); agg.lu = lu;
    return agg;
  };
  var CUR_KEYS = ['PtD', 'G', 'A', 'GA2', 'PIM', 'SOG', 'STP', 'Hit', 'Blk', 'Tk', 'Cor', 'W', null, null, 'SHO'];
  E.curRatios = function (t) {
    return { GAA: t.GTOI > 0 ? t.GA * 60 / t.GTOI : null, SV: t.SA > 0 ? 1 - t.GA / t.SA : null };
  };
  // current totals + a Monte Carlo of the rest of the week -> projected finals, per-category and matchup win odds
  E.liveOdds = function (a, b, sc, n) {
    var wi = sc.week - 1, d0 = sc.to ? E.dayIndex(sc.to) + 1 : E.weeks[wi].d0;
    var TA = sc.teams[a] || { tot: {}, active: [] }, TB = sc.teams[b] || { tot: {}, active: [] };
    var zero = { PtD: 0, G: 0, A: 0, GA2: 0, PIM: 0, SOG: 0, STP: 0, Hit: 0, Blk: 0, Tk: 0, Cor: 0, W: 0, GA: 0, SA: 0, SHO: 0, GGP: 0, GTOI: 0 };
    var ca = Object.assign({}, zero, TA.tot), cb = Object.assign({}, zero, TB.tot);
    var ra = E.restWeek(a, wi, d0, TA.active), rb = E.restWeek(b, wi, d0, TB.active);
    var rand = E.rng(sc.week * 1009 + 17), nrm = E.normalSampler(rand), minGP = E.RULES.goalieMinGP;
    n = n || 4000;
    var cdf = function (pm) { var acc = 0; return pm.map(function (x) { acc += x; return acc; }); };
    var cda = cdf(ra.gpmf), cdb = cdf(rb.gpmf);
    var draw = function (cur, rest, cd) {
      var m = rest.m, v = rest.v, out = [], u = rand(), g = 0;
      while (g < cd.length - 1 && u > cd[g]) g++;
      var G = cur.G + Math.max(0, Math.round(m.G + Math.sqrt(v.G) * nrm())), A = cur.A + Math.max(0, Math.round(m.A + Math.sqrt(v.A) * nrm()));
      out[1] = G; out[2] = A; out[3] = cur.GA2 - 2 * cur.G - cur.A + 2 * G + A;
      out[0] = cur.PtD + Math.max(0, Math.round(m.PtD + Math.sqrt(v.PtD) * nrm()));
      ['PIM', 'SOG', 'STP', 'Hit', 'Blk', 'Tk', 'Cor'].forEach(function (k, i) {
        var x = m[k] + Math.sqrt(v[k]) * nrm(); out[4 + i] = cur[k] + (k === 'Cor' ? x : Math.max(0, Math.round(x)));
      });
      var sc2 = m.GGP > 0 ? g / m.GGP : 0, ggp = cur.GGP + g;
      out[11] = cur.W + (g ? Math.max(0, Math.round(m.W * sc2 + Math.sqrt(v.W * sc2) * nrm())) : 0);
      var ga = cur.GA + (g ? Math.max(0, m.GA * sc2 + Math.sqrt(v.GA * sc2) * nrm()) : 0), sa = cur.SA + (g ? Math.max(1, m.SA * sc2 + Math.sqrt(v.SA * sc2) * nrm()) : 0);
      var mins = cur.GTOI / 60 + g;
      out[12] = mins > 0 ? ga / mins : null; out[13] = sa > 0 ? 1 - ga / sa : null;
      out[14] = cur.SHO + (g ? Math.max(0, Math.round(m.SHO * sc2 + Math.sqrt(v.SHO * sc2) * nrm())) : 0);
      out.ggp = ggp;
      return out;
    };
    var catW = new Array(E.NC).fill(0), catT = new Array(E.NC).fill(0), sumA = new Array(E.NC).fill(0), sumB = new Array(E.NC).fill(0), cntA = new Array(E.NC).fill(0), cntB = new Array(E.NC).fill(0);
    var win = 0, loss = 0, tie = 0;
    for (var s = 0; s < n; s++) {
      var x = draw(ca, ra, cda), y = draw(cb, rb, cdb), wa = 0, wb = 0, fa = x.ggp < minGP, fb = y.ggp < minGP;
      for (var c = 0; c < E.NC; c++) {
        if (x[c] !== null) { sumA[c] += x[c]; cntA[c]++; }
        if (y[c] !== null) { sumB[c] += y[c]; cntB[c]++; }
        if (E.CATS[c].grp === 'G' && (fa || fb)) { if (!(fa && fb)) { if (fa) wb++; else { wa++; catW[c]++; } } continue; }
        if (x[c] === y[c] || x[c] === null || y[c] === null) { catT[c]++; continue; }
        if (E.CATS[c].low ? x[c] < y[c] : x[c] > y[c]) { wa++; catW[c]++; } else wb++;
      }
      if (wa > wb) win++; else if (wb > wa) loss++; else tie++;
    }
    var rA = E.curRatios(ca), rB = E.curRatios(cb);
    var now = function (t, r, c) { return c === 12 ? r.GAA : c === 13 ? r.SV : t[CUR_KEYS[c]]; };
    return {
      cats: E.CATS.map(function (cat, c) {
        return { a: now(ca, rA, c), b: now(cb, rB, c), pa: cntA[c] ? sumA[c] / cntA[c] : null, pb: cntB[c] ? sumB[c] / cntB[c] : null, pw: catW[c] / n, pt: catT[c] / n };
      }),
      win: win / n, loss: loss / n, tie: tie / n, ggpA: ca.GGP, ggpB: cb.GGP, restA: ra, restB: rb
    };
  };
  E.liveScore = function (odds) { // current category score (who leads each category right now)
    var wa = 0, wb = 0, t = 0;
    odds.cats.forEach(function (x, c) {
      if (x.a === null || x.b === null || x.a === x.b) { t++; return; }
      if (E.CATS[c].low ? x.a < x.b : x.a > x.b) wa++; else wb++;
    });
    return [wa, wb, t];
  };

  // single-week Monte Carlo for the matchup page: P(win matchup), distribution of category score
  E.simWeek = function (A, B, n, seed) {
    var rand = E.rng(seed || 7), nrm = E.normalSampler(rand), minGP = E.RULES.goalieMinGP;
    var a = E.catVec(A), b = E.catVec(B);
    var cdf = function (pm) { var acc = 0; return pm.map(function (x) { acc += x; return acc; }); };
    var ca = cdf(a.gpmf), cb = cdf(b.gpmf), win = 0, loss = 0, tie = 0, dist = {};
    var draw = function (cv, cd, ggpMean) {
      var v = [], u = rand(), g = 0;
      while (g < cd.length - 1 && u > cd[g]) g++;
      var G = Math.max(0, Math.round(cv.mu[1] + Math.sqrt(cv.va[1]) * nrm())), A2 = Math.max(0, Math.round(cv.mu[2] + Math.sqrt(cv.va[2]) * nrm()));
      v[0] = Math.max(0, Math.round(cv.mu[0] + Math.sqrt(cv.va[0]) * nrm())); v[1] = G; v[2] = A2; v[3] = 2 * G + A2;
      for (var c = 4; c <= 10; c++) { var x = Math.round(cv.mu[c] + Math.sqrt(cv.va[c]) * nrm()); v[c] = c === 10 ? x : Math.max(0, x); }
      var sc = ggpMean > 0 ? g / ggpMean : 0;
      v[11] = g ? Math.max(0, Math.round(cv.mu[11] * sc + Math.sqrt(cv.va[11] * sc) * nrm())) : 0;
      v[12] = g ? Math.max(0, cv.mu[12] + Math.sqrt(cv.va[12]) * nrm()) : null;
      v[13] = g ? Math.min(1, cv.mu[13] + Math.sqrt(cv.va[13]) * nrm()) : null;
      v[14] = g ? Math.max(0, Math.round(cv.mu[14] * sc + Math.sqrt(cv.va[14] * sc) * nrm())) : 0;
      v.ggp = g; return v;
    };
    for (var s = 0; s < n; s++) {
      var x = draw(a, ca, A.m.GGP), y = draw(b, cb, B.m.GGP), wa = 0, wb = 0;
      var fa = x.ggp < minGP, fb = y.ggp < minGP;
      for (var c = 0; c < E.NC; c++) {
        if (E.CATS[c].grp === 'G' && (fa || fb)) { if (!(fa && fb)) { if (fa) wb++; else wa++; } continue; }
        if (x[c] === y[c]) continue;
        if (E.CATS[c].low ? x[c] < y[c] : x[c] > y[c]) wa++; else wb++;
      }
      if (wa > wb) win++; else if (wb > wa) loss++; else tie++;
      var key = wa + '-' + wb; dist[key] = (dist[key] || 0) + 1;
    }
    return { win: win / n, loss: loss / n, tie: tie / n, dist: dist };
  };
})();
