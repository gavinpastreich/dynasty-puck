"""Small cached client for the public NHL APIs used by build_data.py.

Every response is cached as JSON under tools/cache/ so rebuilds are fast and work offline.
Delete a cache file (or run build_data.py --refresh) to fetch it again.
"""
import json
import os
import re
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
UA = "Mozilla/5.0 (DynastyPuckHQ data build; github.com/gavinpastreich/dynasty-puck)"
OFFLINE = os.environ.get("DP_OFFLINE") == "1"
REFRESH = set()  # cache-key prefixes to force-refresh


def _path(key):
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", key)
    return os.path.join(CACHE, safe + ".json")


def get(url, key, max_age_days=None, retries=3):
    """Return parsed JSON for url, using tools/cache/<key>.json when present."""
    p = _path(key)
    fresh = os.path.exists(p)
    if fresh and max_age_days is not None:
        fresh = (time.time() - os.path.getmtime(p)) < max_age_days * 86400
    if fresh and any(key.startswith(r) for r in REFRESH):
        fresh = False
    if fresh or (OFFLINE and os.path.exists(p)):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    if OFFLINE:
        return None
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=40) as r:
                data = json.loads(r.read().decode("utf-8"))
            os.makedirs(CACHE, exist_ok=True)
            with open(p, "w", encoding="utf-8") as f:
                json.dump(data, f, separators=(",", ":"))
            return data
        except Exception as e:  # network error, 404, bad JSON
            last = e
            if "404" in str(e):
                break
            time.sleep(1.5 * (i + 1))
    if os.path.exists(p):  # stale cache beats nothing
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    print(f"  ! fetch failed {url}: {last}")
    return None


def get_many(jobs, workers=8):
    """jobs: list of (url, key[, max_age_days]). Returns list of results in order."""
    def one(j):
        return get(*j)
    with ThreadPoolExecutor(max_workers=workers) as ex:
        return list(ex.map(one, jobs))


STATS = "https://api.nhle.com/stats/rest/en"
WEB = "https://api-web.nhle.com/v1"


PAGE = 100  # the stats API returns at most 100 rows per request (since 2026-11-19 it ignores limit=-1)
_SORT = urllib.parse.quote(json.dumps([{"property": "playerId", "direction": "ASC"}], separators=(",", ":")))


class IncompleteReport(RuntimeError):
    pass


def _fetch(url, retries=3):
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # network error, 404, bad JSON
            last = e
            if "404" in str(e):
                break
            time.sleep(1.5 * (i + 1))
    raise IncompleteReport(f"fetch failed {url}: {last}")


def get_paged(url, key, max_age_days=None):
    """A stats API report, every row: pages of 100 sorted by playerId (stable), combined and cached under key like
    get(). If the pages don't add up to the report's 'total', the last complete cached copy is used, else it raises
    IncompleteReport so a build fails (and the site keeps its last good data) instead of publishing a partial report."""
    p = _path(key)
    fresh = os.path.exists(p)
    if fresh and max_age_days is not None:
        fresh = (time.time() - os.path.getmtime(p)) < max_age_days * 86400
    if fresh and any(key.startswith(r) for r in REFRESH):
        fresh = False
    if fresh or (OFFLINE and os.path.exists(p)):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    if OFFLINE:
        return None
    sep = "&" if "?" in url else "?"
    page = lambda start: _fetch(f"{url}{sep}sort={_SORT}&start={start}&limit={PAGE}")
    try:
        first = page(0)
        total = int(first.get("total") or 0)
        rows = list(first.get("data", []))
        starts = list(range(PAGE, total, PAGE))
        with ThreadPoolExecutor(max_workers=4) as ex:
            for d in ex.map(page, starts):
                rows.extend(d.get("data", []))
        seen, uniq = set(), []
        for r in rows:  # a row can repeat across pages if the report changes mid-fetch
            k = (r.get("playerId"), r.get("seasonId"))
            if k not in seen:
                seen.add(k)
                uniq.append(r)
        if total and len(uniq) < total:
            raise IncompleteReport(f"{key}: {len(uniq)} of {total} rows")
        data = {"data": uniq, "total": total}
        os.makedirs(CACHE, exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(data, f, separators=(",", ":"))
        return data
    except IncompleteReport as e:
        if os.path.exists(p):  # an older complete copy beats a partial one
            print(f"  ! {e}; using the cached copy")
            with open(p, encoding="utf-8") as f:
                return json.load(f)
        raise


def stats_report(kind, report, season, game_type=2):
    """Bulk season report, e.g. kind='skater', report='realtime', season=20252026 (every row, paged)."""
    exp = urllib.parse.quote(f"seasonId={season} and gameTypeId={game_type}")
    url = f"{STATS}/{kind}/{report}?cayenneExp={exp}"
    d = get_paged(url, f"stats_{kind}_{report}_{season}_{game_type}", max_age_days=None if season < 20262027 else 1)
    return (d or {}).get("data", [])


def range_report(kind, report, start, end, game_type=2, max_age_days=0.02):
    """Per-player totals over a date range (aggregated over games), e.g. one fantasy week so far (every row, paged)."""
    exp = urllib.parse.quote(f'gameDate>="{start}" and gameDate<="{end}" and gameTypeId={game_type}')
    url = f"{STATS}/{kind}/{report}?isAggregate=true&isGame=true&cayenneExp={exp}"
    d = get_paged(url, f"range_{kind}_{report}_{start}_{end}", max_age_days=max_age_days)
    return (d or {}).get("data", [])


def landing(pid, max_age_days=7):
    return get(f"{WEB}/player/{pid}/landing", f"landing_{pid}", max_age_days)


def search_player(name):
    q = urllib.parse.quote(name)
    url = f"https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=20&q={q}"
    return get(url, "search_" + name.lower(), max_age_days=30) or []


def club_schedule(team, season="20262027"):
    return get(f"{WEB}/club-schedule-season/{team}/{season}", f"sched_{team}_{season}", max_age_days=3)


def draft_picks(year):
    return get(f"{WEB}/draft/picks/{year}/all", f"draft_{year}", max_age_days=None if year < 2026 else 14)


def roster(team, season="20262027"):
    return get(f"{WEB}/roster/{team}/{season}", f"roster_{team}_{season}", max_age_days=3)


def prospects(team):
    return get(f"{WEB}/prospects/{team}", f"prospects_{team}", max_age_days=7)


NHL_TEAMS = ["ANA", "BOS", "BUF", "CAR", "CBJ", "CGY", "CHI", "COL", "DAL", "DET", "EDM", "FLA", "LAK",
             "MIN", "MTL", "NJD", "NSH", "NYI", "NYR", "OTT", "PHI", "PIT", "SEA", "SJS", "STL", "TBL",
             "TOR", "UTA", "VAN", "VGK", "WPG", "WSH"]
