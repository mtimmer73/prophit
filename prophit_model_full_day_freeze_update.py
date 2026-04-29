from __future__ import annotations

import json
import math
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote_plus
from zoneinfo import ZoneInfo

import pandas as pd
import requests


# ============================================================
# PropHit v5 Launch Model - Hard Lineup + Real Splits + Pitcher Link/Stats Upgrade
#
# Fixes in this version:
# - Keeps hard MLB lineup parser
# - Adds REAL batter splits vs LHP/RHP using MLB statSplits
# - Removes mirrored LHP/RHP placeholder split logic
# - Uses confirmed lineup first, fallback recent batting order second
# - Adds PA/AB context engine: lineup + home/away + opposing PA environment + pitcher traffic
# - Applies park factor to final hit rate
# - Projected AB now flows through projected hits, 1+ hit probability, fair odds, hit score, confidence, and tags
# - Outputs same UI JSON path: public/data/prophit_latest.json
#
# First run after installing:
#   del outputs\prophit_freeze_state.json
#   python prophit_model_real_splits_rewrite.py
# ============================================================


BASE_DIR = Path.cwd()
OUTPUT_DIR = BASE_DIR / "outputs"
SNAPSHOT_DIR = OUTPUT_DIR / "snapshots"
CACHE_DIR = OUTPUT_DIR / "cache"

# GitHub Pages reads JSON from /data
UI_DATA_DIR = BASE_DIR / "data"

EXCEL_OUTPUT = OUTPUT_DIR / "prophit_today.xlsx"
FREEZE_STATE_JSON = OUTPUT_DIR / "prophit_freeze_state.json"
RUN_LOG_JSON = OUTPUT_DIR / "prophit_run_log.json"

LATEST_JSON = UI_DATA_DIR / "prophit_latest.json"
LATEST_ALL_PLAYERS_JSON = UI_DATA_DIR / "prophit_all_players.json"
SCHEMA_JSON = UI_DATA_DIR / "prophit_schema.json"
PERFORMANCE_SUMMARY_JSON = UI_DATA_DIR / "prophit_performance_summary.json"

ET = ZoneInfo("America/New_York")
TARGET_DATE = datetime.now(ET).date()
CURRENT_SEASON = TARGET_DATE.year
RUN_SCOPE_LABEL = "full_day_freeze_started_update_upcoming_et"
LOOKBACK_YEARS = 3
SEASONS_3YR = [CURRENT_SEASON - i for i in range(LOOKBACK_YEARS)]

MLB_API = "https://statsapi.mlb.com/api/v1"
MLB_API_11 = "https://statsapi.mlb.com/api/v1.1"

HTTP_TIMEOUT = 30
REQUEST_PAUSE_SECONDS = 0.03
LOCK_BUFFER_MINUTES = 0
USE_EXISTING_FREEZE_FOR_STARTED_GAMES = True

SORT_COLUMNS = [
    ("best_bet_rank_score", False),
    ("one_plus_hit_probability", False),
    ("confidence_score", False),
    ("hit_score", False),
    ("projected_hits", False),
    ("projected_ab", False),
]

# ============================================================
# Projection environment controls
# ============================================================
AWAY_TEAM_PA_BONUS = 0.12
HOME_TEAM_PA_PENALTY = -0.03

PARK_HIT_FACTORS_BY_VENUE = {
    "Coors Field": 1.055,
    "Fenway Park": 1.035,
    "Great American Ball Park": 1.025,
    "Kauffman Stadium": 1.020,
    "Wrigley Field": 1.015,
    "Citizens Bank Park": 1.012,
    "Oriole Park at Camden Yards": 1.010,
    "Globe Life Field": 1.008,
    "Chase Field": 1.005,
    "Yankee Stadium": 1.003,
    "Dodger Stadium": 1.000,
    "Busch Stadium": 0.998,
    "Target Field": 0.997,
    "Minute Maid Park": 0.996,
    "American Family Field": 0.995,
    "loanDepot park": 0.990,
    "Citi Field": 0.988,
    "PNC Park": 0.987,
    "Petco Park": 0.982,
    "T-Mobile Park": 0.978,
    "Oakland Coliseum": 0.972,
}

PROP_HIT_SCHEMA = {
    "model": "PropHit real splits rewrite",
    "important_fields": [
        "lineup_spot_num",
        "fallback_batting_order",
        "lineup_source",
        "last50ab_avg_vs_lhp",
        "last100ab_avg_vs_lhp",
        "last200ab_avg_vs_lhp",
        "season_avg_vs_lhp",
        "three_year_avg_vs_lhp",
        "alltime_avg_vs_lhp",
        "last50ab_avg_vs_rhp",
        "last100ab_avg_vs_rhp",
        "last200ab_avg_vs_rhp",
        "season_avg_vs_rhp",
        "three_year_avg_vs_rhp",
        "alltime_avg_vs_rhp",
        "split_ab_3yr_vs_opp_hand",
        "split_hits_3yr_vs_opp_hand",
        "split_hits_per_ab_3yr_vs_opp_hand",
        "espn_season_avg",
        "market_avg",
        "model_avg",
        "model_vs_market_avg_delta",
        "projected_pa_base_lineup",
        "home_away_pa_adjustment",
        "opp_team_pa_allowed_factor",
        "pitcher_traffic_factor",
        "team_run_context_factor",
        "opp_pitcher_mlb_url",
        "opp_pitcher_baseball_reference_url",
        "opp_pitcher_era",
        "opp_pitcher_whip",
        "opp_pitcher_k_rate",
        "opp_pitcher_hits_per_9",
        "opp_pitcher_hr_per_9",
        "pitcher_baa_vs_lhb_season",
        "pitcher_baa_vs_rhb_season",
        "pitcher_baa_vs_lhb_career",
        "pitcher_baa_vs_rhb_career",
        "pitcher_hover_summary",
        "park_factor_hits",
        "final_hit_rate_before_park",
        "launch_edge_score",
        "best_bet_rank_score",
        "best_bet_tier",
        "confidence_tier",
        "status_label",
        "freeze_status",
        "top_play_candidate",
        "split_source",
    ],
}


# ----------------------------
# Core utils
# ----------------------------
def ensure_dirs() -> None:
    for folder in [OUTPUT_DIR, SNAPSHOT_DIR, CACHE_DIR, UI_DATA_DIR]:
        folder.mkdir(parents=True, exist_ok=True)

def now_et() -> datetime:
    return datetime.now(ET)


def log(msg: str) -> None:
    print(f"[{now_et().strftime('%Y-%m-%d %I:%M:%S %p ET')}] {msg}")


def timestamp_slug() -> str:
    return now_et().strftime("%Y%m%d_%H%M%S")


def cache_path(name: str) -> Path:
    return CACHE_DIR / f"{name}.json"


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def sanitize_json_value(v: Any) -> Any:
    """Recursively removes NaN/Infinity so browser JSON.parse never crashes."""
    if isinstance(v, dict):
        return {str(k): sanitize_json_value(val) for k, val in v.items()}
    if isinstance(v, list):
        return [sanitize_json_value(x) for x in v]
    if isinstance(v, tuple):
        return [sanitize_json_value(x) for x in v]
    try:
        if pd.isna(v):
            return None
    except Exception:
        pass
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    return v


def write_json(data: Any, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    safe_data = sanitize_json_value(data)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(safe_data, f, indent=2, allow_nan=False)


def request_json(url: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    r = requests.get(url, params=params or {}, timeout=HTTP_TIMEOUT)
    r.raise_for_status()
    time.sleep(REQUEST_PAUSE_SECONDS)
    return r.json()


def safe_div(n: Any, d: Any, default: float = 0.0) -> float:
    try:
        if d in (0, None) or pd.isna(d):
            return default
        if n is None or pd.isna(n):
            return default
        return float(n) / float(d)
    except Exception:
        return default


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def pct_score(x: Any, lo: float, hi: float) -> float:
    if x is None or pd.isna(x) or hi <= lo:
        return 0.0
    return clamp(100.0 * (float(x) - lo) / (hi - lo), 0.0, 100.0)


def american_odds_from_prob(p: float) -> int:
    p = clamp(float(p), 0.0001, 0.9999)
    if p > 0.5:
        return int(round(-(p / (1 - p)) * 100))
    return int(round(((1 - p) / p) * 100))


def mlb_player_url(player_id: Optional[int]) -> Optional[str]:
    """MLB player profile URL. Works for hitters and pitchers when MLB id is available."""
    if not player_id:
        return None
    try:
        return f"https://www.mlb.com/player/{int(player_id)}"
    except Exception:
        return None


def baseball_reference_search_url(name: Optional[str]) -> Optional[str]:
    """Baseball Reference search URL. Uses name fallback when a direct BRef id is not available."""
    if not name:
        return None
    clean = str(name).strip()
    if not clean:
        return None
    return f"https://www.baseball-reference.com/search/search.fcgi?search={quote_plus(clean)}"


def parse_ip_to_float(ip_raw: Any) -> float:
    """
    MLB returns innings as strings like 12.1 = 12 and 1/3, 12.2 = 12 and 2/3.
    """
    if ip_raw is None:
        return 0.0
    s = str(ip_raw).strip()
    if not s:
        return 0.0
    try:
        if "." in s:
            whole, outs = s.split(".", 1)
            whole_i = int(whole)
            outs_i = int(outs[:1] or "0")
            if outs_i in (0, 1, 2):
                return whole_i + outs_i / 3.0
        return float(s)
    except Exception:
        return 0.0


def clean_for_json(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out = out.replace([float("inf"), float("-inf")], pd.NA)
    out = out.where(pd.notnull(out), None)
    return out


def parse_stat_int(stat: Dict[str, Any], key: str) -> int:
    v = stat.get(key)
    try:
        return int(v)
    except Exception:
        try:
            return int(float(v))
        except Exception:
            return 0


def parse_stat_float(stat: Dict[str, Any], key: str, default: float = 0.0) -> float:
    v = stat.get(key)
    try:
        return float(v)
    except Exception:
        return default


def game_time_to_et(iso_string: str) -> Tuple[str, str]:
    dt_utc = datetime.fromisoformat(iso_string.replace("Z", "+00:00"))
    dt_et = dt_utc.astimezone(ET)
    return dt_et.date().isoformat(), dt_et.strftime("%I:%M %p").lstrip("0")


def parse_game_datetime_et(game_date: str, game_time_et: str) -> Optional[datetime]:
    try:
        return datetime.strptime(f"{game_date} {game_time_et}", "%Y-%m-%d %I:%M %p").replace(tzinfo=ET)
    except Exception:
        return None


def has_game_started(game_date: str, game_time_et: str) -> bool:
    game_dt = parse_game_datetime_et(game_date, game_time_et)
    if game_dt is None:
        return False
    return now_et() >= (game_dt + timedelta(minutes=LOCK_BUFFER_MINUTES))


def game_start_datetime_et_from_game(game: Dict[str, Any]) -> Optional[datetime]:
    """Return MLB scheduled game start in Eastern Time."""
    try:
        raw = game.get("gameDate")
        if not raw:
            return None
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00")).astimezone(ET)
    except Exception:
        return None


def is_game_remaining_today_et(game: Dict[str, Any], as_of: Optional[datetime] = None) -> Tuple[bool, str, Optional[datetime]]:
    """
    Include ONLY games:
    - scheduled for TARGET_DATE in Eastern Time
    - not started yet as of the model run time
    - not live/final/postponed/suspended/cancelled

    This does NOT roll forward to tomorrow and does NOT include earlier games from today.
    """
    as_of = as_of or now_et()
    game_dt = game_start_datetime_et_from_game(game)

    if game_dt is None:
        return False, "missing_game_time", None

    if game_dt.date() != TARGET_DATE:
        return False, f"not_today_et_{game_dt.date().isoformat()}", game_dt

    status = game.get("status", {}) or {}
    coded_state = str(status.get("codedGameState", "") or "").upper()
    detailed_state = str(status.get("detailedState", "") or "").lower()
    abstract_state = str(status.get("abstractGameState", "") or "").lower()

    blocked_words = (
        "final",
        "game over",
        "completed",
        "postponed",
        "suspended",
        "cancelled",
        "canceled",
        "delayed",
    )

    if any(word in detailed_state for word in blocked_words):
        return False, f"status_{detailed_state or coded_state}", game_dt

    # MLB common states: S/P = scheduled/pre-game; I/M/N live; F/O final.
    if coded_state in {"I", "M", "N", "F", "O"} or abstract_state in {"live", "final"}:
        return False, f"status_{detailed_state or abstract_state or coded_state}", game_dt

    cutoff = as_of + timedelta(minutes=LOCK_BUFFER_MINUTES)
    if game_dt <= cutoff:
        return False, f"already_started_or_locked_{game_dt.strftime('%I:%M %p').lstrip('0')}_ET", game_dt

    return True, "remaining_today_et_not_started", game_dt


def filter_remaining_today_games(games: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Return only today's ET games that have not started yet, plus skip audit rows."""
    as_of = now_et()
    remaining: List[Dict[str, Any]] = []
    skipped: List[Dict[str, Any]] = []

    for game in games:
        include, reason, game_dt = is_game_remaining_today_et(game, as_of=as_of)

        teams = game.get("teams", {}) or {}
        away_team = ((teams.get("away") or {}).get("team") or {})
        home_team = ((teams.get("home") or {}).get("team") or {})

        audit = {
            "game_pk": game.get("gamePk"),
            "away": away_team.get("abbreviation") or away_team.get("name"),
            "home": home_team.get("abbreviation") or home_team.get("name"),
            "game_time_et": game_dt.strftime("%I:%M %p").lstrip("0") if game_dt else None,
            "game_date_et": game_dt.date().isoformat() if game_dt else None,
            "include": include,
            "reason": reason,
        }

        if include:
            remaining.append(game)
        else:
            skipped.append(audit)

    remaining.sort(key=lambda g: game_start_datetime_et_from_game(g) or datetime.max.replace(tzinfo=ET))
    return remaining, skipped


# ----------------------------
# MLB API
# ----------------------------
def fetch_schedule(target_date: date) -> List[Dict[str, Any]]:
    payload = request_json(
        f"{MLB_API}/schedule",
        params={
            "sportId": 1,
            "date": target_date.isoformat(),
            "hydrate": "team,probablePitcher,linescore,flags,decisions,person,stats",
        },
    )
    dates = payload.get("dates", [])
    if not dates:
        return []
    return dates[0].get("games", [])


def fetch_live_feed(game_pk: int) -> Dict[str, Any]:
    return request_json(f"{MLB_API_11}/game/{game_pk}/feed/live")


def fetch_team_roster(team_id: int, season: int) -> List[Dict[str, Any]]:
    payload = request_json(f"{MLB_API}/teams/{team_id}/roster", params={"season": season, "rosterType": "active"})
    return payload.get("roster", [])


def fetch_person_meta(person_id: int) -> Dict[str, Any]:
    cp = cache_path(f"person_meta_{person_id}")
    cached = read_json(cp)
    if cached is not None:
        return cached
    payload = request_json(f"{MLB_API}/people/{person_id}")
    person = payload.get("people", [{}])[0]
    write_json(person, cp)
    return person


def fetch_people_stats(person_id: int, stats: str, group: str, season: Optional[int] = None, extra: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    params: Dict[str, Any] = {"stats": stats, "group": group}
    if season is not None:
        params["season"] = season
    if extra:
        params.update(extra)
    payload = request_json(f"{MLB_API}/people/{person_id}/stats", params=params)
    return payload.get("stats", [])


def load_gamelog(person_id: int, season: int, group: str = "hitting") -> List[Dict[str, Any]]:
    cp = cache_path(f"gamelog_{group}_{person_id}_{season}")
    cached = read_json(cp)
    if cached is not None:
        return cached

    splits: List[Dict[str, Any]] = []
    for block in fetch_people_stats(person_id, "gameLog", group, season):
        splits.extend(block.get("splits", []))
    write_json(splits, cp)
    return splits


def load_season_hitting(person_id: int, season: int) -> Dict[str, Any]:
    cp = cache_path(f"season_hitting_{person_id}_{season}")
    cached = read_json(cp)
    if cached is not None:
        return cached
    stat = {}
    for block in fetch_people_stats(person_id, "season", "hitting", season):
        splits = block.get("splits", [])
        if splits:
            stat = splits[0].get("stat", {})
            break
    write_json(stat, cp)
    return stat


def load_career_hitting(person_id: int) -> Dict[str, Any]:
    cp = cache_path(f"career_hitting_{person_id}")
    cached = read_json(cp)
    if cached is not None:
        return cached
    stat = {}
    for block in fetch_people_stats(person_id, "career", "hitting"):
        splits = block.get("splits", [])
        if splits:
            stat = splits[0].get("stat", {})
            break
    write_json(stat, cp)
    return stat


def load_season_pitching(person_id: int, season: int) -> Dict[str, Any]:
    cp = cache_path(f"season_pitching_{person_id}_{season}")
    cached = read_json(cp)
    if cached is not None:
        return cached
    stat = {}
    for block in fetch_people_stats(person_id, "season", "pitching", season):
        splits = block.get("splits", [])
        if splits:
            stat = splits[0].get("stat", {})
            break
    write_json(stat, cp)
    return stat


def load_career_pitching(person_id: int) -> Dict[str, Any]:
    cp = cache_path(f"career_pitching_{person_id}")
    cached = read_json(cp)
    if cached is not None:
        return cached
    stat = {}
    for block in fetch_people_stats(person_id, "career", "pitching"):
        splits = block.get("splits", [])
        if splits:
            stat = splits[0].get("stat", {})
            break
    write_json(stat, cp)
    return stat



# ----------------------------
# Pitcher batting-average-against splits
# ----------------------------
def pitcher_split_sit_codes(batter_side: str) -> List[str]:
    """
    MLB StatsAPI statSplits sitCodes are used defensively across common variants.
    For pitching group, these represent pitcher performance against LHB/RHB.
    """
    side = (batter_side or "").upper()
    if side in ("L", "LHB", "LEFT"):
        return ["vl", "vsLHB", "vsLeft", "lhb", "vsL"]
    return ["vr", "vsRHB", "vsRight", "rhb", "vsR"]


def load_pitcher_baa_split_stat(person_id: int, season: Optional[int], batter_side: str, career: bool = False) -> Dict[str, Any]:
    """
    Returns pitching stat split for batting average allowed against LHB/RHB.

    Season:
      stats=statSplits&group=pitching&sitCodes=vl/vr&season=YYYY

    Career:
      stats=careerStatSplits&group=pitching&sitCodes=vl/vr
      with fallback to statSplits without season.
    """
    season_part = "career" if career else str(season)
    side = (batter_side or "").upper()
    cp = cache_path(f"pitcher_baa_split_{person_id}_{season_part}_{side}")
    cached = read_json(cp)
    if cached is not None:
        return cached

    stat: Dict[str, Any] = {}

    for code in pitcher_split_sit_codes(side):
        try:
            if career:
                blocks = fetch_people_stats(person_id, "careerStatSplits", "pitching", None, {"sitCodes": code})
            else:
                blocks = fetch_people_stats(person_id, "statSplits", "pitching", season, {"sitCodes": code})
            stat = extract_stat_from_stat_splits(blocks)
            if stat:
                break
        except Exception:
            continue

    if career and not stat:
        for code in pitcher_split_sit_codes(side):
            try:
                blocks = fetch_people_stats(person_id, "statSplits", "pitching", None, {"sitCodes": code})
                stat = extract_stat_from_stat_splits(blocks)
                if stat:
                    break
            except Exception:
                continue

    write_json(stat, cp)
    return stat


def pitcher_baa_from_stat(stat: Dict[str, Any]) -> float:
    """
    Batting average against = hits allowed / at-bats faced.
    StatsAPI may also expose avg directly in split stat, so use that fallback.
    """
    ab = parse_stat_int(stat, "atBats")
    hits = parse_stat_int(stat, "hits")
    baa = safe_div(hits, ab, 0.0)
    if baa == 0:
        baa = parse_stat_float(stat, "avg", 0.0)
    return baa


def pitcher_baa_split_bundle(pitcher_id: Optional[int]) -> Dict[str, Any]:
    if not pitcher_id:
        return {
            "pitcher_baa_vs_lhb_season": None,
            "pitcher_baa_vs_rhb_season": None,
            "pitcher_baa_vs_lhb_career": None,
            "pitcher_baa_vs_rhb_career": None,
            "pitcher_baa_vs_lhb_season_ab": 0,
            "pitcher_baa_vs_rhb_season_ab": 0,
            "pitcher_baa_vs_lhb_career_ab": 0,
            "pitcher_baa_vs_rhb_career_ab": 0,
            "pitcher_baa_split_source": "no_pitcher_id",
        }

    pid = int(pitcher_id)

    season_l = load_pitcher_baa_split_stat(pid, CURRENT_SEASON, "L", career=False)
    season_r = load_pitcher_baa_split_stat(pid, CURRENT_SEASON, "R", career=False)
    career_l = load_pitcher_baa_split_stat(pid, None, "L", career=True)
    career_r = load_pitcher_baa_split_stat(pid, None, "R", career=True)

    season_l_ab = parse_stat_int(season_l, "atBats")
    season_r_ab = parse_stat_int(season_r, "atBats")
    career_l_ab = parse_stat_int(career_l, "atBats")
    career_r_ab = parse_stat_int(career_r, "atBats")

    return {
        "pitcher_baa_vs_lhb_season": pitcher_baa_from_stat(season_l) or None,
        "pitcher_baa_vs_rhb_season": pitcher_baa_from_stat(season_r) or None,
        "pitcher_baa_vs_lhb_career": pitcher_baa_from_stat(career_l) or None,
        "pitcher_baa_vs_rhb_career": pitcher_baa_from_stat(career_r) or None,
        "pitcher_baa_vs_lhb_season_ab": season_l_ab,
        "pitcher_baa_vs_rhb_season_ab": season_r_ab,
        "pitcher_baa_vs_lhb_career_ab": career_l_ab,
        "pitcher_baa_vs_rhb_career_ab": career_r_ab,
        "pitcher_baa_split_source": "mlb_pitching_statSplits",
        # UI fallback aliases
        "opp_pitcher_baa_vs_lhb_season": pitcher_baa_from_stat(season_l) or None,
        "opp_pitcher_baa_vs_rhb_season": pitcher_baa_from_stat(season_r) or None,
        "opp_pitcher_baa_vs_lhb_career": pitcher_baa_from_stat(career_l) or None,
        "opp_pitcher_baa_vs_rhb_career": pitcher_baa_from_stat(career_r) or None,
        "opp_pitcher_avg_allowed_vs_lhb_season": pitcher_baa_from_stat(season_l) or None,
        "opp_pitcher_avg_allowed_vs_rhb_season": pitcher_baa_from_stat(season_r) or None,
        "opp_pitcher_avg_allowed_vs_lhb_career": pitcher_baa_from_stat(career_l) or None,
        "opp_pitcher_avg_allowed_vs_rhb_career": pitcher_baa_from_stat(career_r) or None,
    }


# ----------------------------
# Real handedness split stats
# ----------------------------
def split_sit_codes(hand: str) -> List[str]:
    # MLB StatsAPI situation codes commonly use vl/vr for vs left/right pitcher.
    # The function tries multiple common variants defensively.
    hand = (hand or "").upper()
    if hand == "L":
        return ["vl", "vsLHP", "vsLeft", "lhp"]
    return ["vr", "vsRHP", "vsRight", "rhp"]


def extract_stat_from_stat_splits(stats_blocks: List[Dict[str, Any]]) -> Dict[str, Any]:
    for block in stats_blocks or []:
        splits = block.get("splits", [])
        if splits:
            # Usually there is one row for the sitCode.
            return splits[0].get("stat", {}) or {}
    return {}


def load_handedness_split_stat(person_id: int, season: Optional[int], hand: str, career: bool = False) -> Dict[str, Any]:
    """
    Returns MLB split stat for hitter vs LHP/RHP.

    For season/year:
      stats=statSplits&group=hitting&sitCodes=vl/vr&season=YYYY

    For career:
      stats=careerStatSplits&group=hitting&sitCodes=vl/vr
      with fallback to statSplits without season.
    """
    season_part = "career" if career else str(season)
    cp = cache_path(f"real_split_hitting_{person_id}_{season_part}_{hand.upper()}")
    cached = read_json(cp)
    if cached is not None:
        return cached

    stat: Dict[str, Any] = {}

    for code in split_sit_codes(hand):
        try:
            if career:
                blocks = fetch_people_stats(person_id, "careerStatSplits", "hitting", None, {"sitCodes": code})
            else:
                blocks = fetch_people_stats(person_id, "statSplits", "hitting", season, {"sitCodes": code})
            stat = extract_stat_from_stat_splits(blocks)
            if stat:
                break
        except Exception:
            continue

    # Career endpoint sometimes fails for splits. Fallback to statSplits without season.
    if career and not stat:
        for code in split_sit_codes(hand):
            try:
                blocks = fetch_people_stats(person_id, "statSplits", "hitting", None, {"sitCodes": code})
                stat = extract_stat_from_stat_splits(blocks)
                if stat:
                    break
            except Exception:
                continue

    write_json(stat, cp)
    return stat


def stat_ab_hits_avg(stat: Dict[str, Any]) -> Tuple[int, int, float]:
    ab = parse_stat_int(stat, "atBats")
    hits = parse_stat_int(stat, "hits")
    avg = safe_div(hits, ab)
    # If avg exists but hits/ab are missing, keep avg for display but sample size remains zero.
    if avg == 0:
        avg = parse_stat_float(stat, "avg", 0.0)
    return ab, hits, avg


def build_real_split_bundle(person_id: int) -> Dict[str, Any]:
    """
    Builds true LHP/RHP split values from MLB statSplits.
    Uses actual stat split endpoints instead of mirrored game logs.
    """
    season_l = load_handedness_split_stat(person_id, CURRENT_SEASON, "L", career=False)
    season_r = load_handedness_split_stat(person_id, CURRENT_SEASON, "R", career=False)

    career_l = load_handedness_split_stat(person_id, None, "L", career=True)
    career_r = load_handedness_split_stat(person_id, None, "R", career=True)

    three_l_ab = three_l_hits = 0
    three_r_ab = three_r_hits = 0

    for yr in SEASONS_3YR:
        s_l = load_handedness_split_stat(person_id, yr, "L", career=False)
        s_r = load_handedness_split_stat(person_id, yr, "R", career=False)

        ab_l, h_l, _ = stat_ab_hits_avg(s_l)
        ab_r, h_r, _ = stat_ab_hits_avg(s_r)

        three_l_ab += ab_l
        three_l_hits += h_l
        three_r_ab += ab_r
        three_r_hits += h_r

    season_l_ab, season_l_hits, season_l_avg = stat_ab_hits_avg(season_l)
    season_r_ab, season_r_hits, season_r_avg = stat_ab_hits_avg(season_r)
    career_l_ab, career_l_hits, career_l_avg = stat_ab_hits_avg(career_l)
    career_r_ab, career_r_hits, career_r_avg = stat_ab_hits_avg(career_r)

    three_l_avg = safe_div(three_l_hits, three_l_ab)
    three_r_avg = safe_div(three_r_hits, three_r_ab)

    return {
        "real_split_source": "mlb_statSplits",
        "real_ab_vs_lhp_season": season_l_ab,
        "real_hits_vs_lhp_season": season_l_hits,
        "real_avg_vs_lhp_season": season_l_avg,
        "real_ab_vs_rhp_season": season_r_ab,
        "real_hits_vs_rhp_season": season_r_hits,
        "real_avg_vs_rhp_season": season_r_avg,
        "real_ab_vs_lhp_3yr": three_l_ab,
        "real_hits_vs_lhp_3yr": three_l_hits,
        "real_avg_vs_lhp_3yr": three_l_avg,
        "real_ab_vs_rhp_3yr": three_r_ab,
        "real_hits_vs_rhp_3yr": three_r_hits,
        "real_avg_vs_rhp_3yr": three_r_avg,
        "real_ab_vs_lhp_career": career_l_ab,
        "real_hits_vs_lhp_career": career_l_hits,
        "real_avg_vs_lhp_career": career_l_avg,
        "real_ab_vs_rhp_career": career_r_ab,
        "real_hits_vs_rhp_career": career_r_hits,
        "real_avg_vs_rhp_career": career_r_avg,
    }


# ----------------------------
# Hard lineup parser
# ----------------------------
def normalize_player_id(raw: Any) -> Optional[int]:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    if s.isdigit() and len(s) >= 7:
        try:
            return int(s[:-3])
        except Exception:
            pass
    try:
        return int(s)
    except Exception:
        return None


def normalize_lineup_spot_from_code(raw: Any) -> Optional[int]:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    if s.isdigit() and len(s) >= 7:
        try:
            spot = int(s[-3:])
            if 1 <= spot <= 9:
                return spot
        except Exception:
            pass
    try:
        spot = int(s)
        if 1 <= spot <= 9:
            return spot
    except Exception:
        pass
    return None


def get_boxscore_team(feed: Dict[str, Any], team_side: str) -> Dict[str, Any]:
    return feed.get("liveData", {}).get("boxscore", {}).get("teams", {}).get(team_side, {}) or {}


def get_game_data_players(feed: Dict[str, Any]) -> Dict[str, Any]:
    return feed.get("gameData", {}).get("players", {}) or {}


def lineup_order_from_team_batting_order(feed: Dict[str, Any], team_side: str) -> Dict[int, int]:
    team = get_boxscore_team(feed, team_side)
    batting_order = team.get("battingOrder", []) or []
    order_map: Dict[int, int] = {}

    for index, raw in enumerate(batting_order, start=1):
        pid = normalize_player_id(raw)
        if pid is None:
            continue
        spot = normalize_lineup_spot_from_code(raw) or index
        if 1 <= spot <= 9:
            order_map[pid] = spot

    return order_map


def lineup_order_from_player_batting_order(feed: Dict[str, Any], team_side: str) -> Dict[int, int]:
    team = get_boxscore_team(feed, team_side)
    players = team.get("players", {}) or {}
    order_map: Dict[int, int] = {}

    for _, pdata in players.items():
        person = pdata.get("person", {}) or {}
        pid = person.get("id")
        if pid is None:
            continue
        spot = normalize_lineup_spot_from_code(pdata.get("battingOrder"))
        if spot is not None:
            order_map[int(pid)] = spot

    return order_map


def player_details_from_boxscore(feed: Dict[str, Any], team_side: str) -> Dict[int, Dict[str, Any]]:
    team = get_boxscore_team(feed, team_side)
    players = team.get("players", {}) or {}
    details: Dict[int, Dict[str, Any]] = {}

    for _, pdata in players.items():
        person = pdata.get("person", {}) or {}
        pid = person.get("id")
        if pid is None:
            continue
        position = pdata.get("position", {}) or {}
        status = pdata.get("status", {}) or {}
        details[int(pid)] = {
            "player_id": int(pid),
            "player": person.get("fullName"),
            "position": position.get("abbreviation"),
            "status_code": status.get("code"),
            "raw_batting_order": pdata.get("battingOrder"),
        }

    return details


def player_name_from_game_data(feed: Dict[str, Any], player_id: int) -> Optional[str]:
    for _, pdata in get_game_data_players(feed).items():
        if pdata.get("id") == player_id:
            return pdata.get("fullName")
    return None


def extract_confirmed_lineup_players_hard(feed: Dict[str, Any], team_side: str) -> List[Dict[str, Any]]:
    order_map = {}
    for m in [
        lineup_order_from_team_batting_order(feed, team_side),
        lineup_order_from_player_batting_order(feed, team_side),
    ]:
        for pid, spot in m.items():
            if pid not in order_map:
                order_map[pid] = spot

    if not order_map:
        return []

    details = player_details_from_boxscore(feed, team_side)
    out: List[Dict[str, Any]] = []

    for pid, spot in sorted(order_map.items(), key=lambda kv: kv[1]):
        d = details.get(pid, {})
        if d.get("position") == "P":
            continue
        name = d.get("player") or player_name_from_game_data(feed, pid)
        if not name:
            try:
                name = fetch_person_meta(pid).get("fullName")
            except Exception:
                name = f"Player {pid}"

        out.append(
            {
                "player_id": pid,
                "player": name,
                "position": d.get("position"),
                "lineup_spot_num": spot,
                "is_confirmed_starter": True,
                "lineup_source": "confirmed_mlb_feed",
                "status_code": d.get("status_code"),
            }
        )

    return out


def fallback_hitters_from_roster(team_id: int, season: int) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for row in fetch_team_roster(team_id, season):
        person = row.get("person", {}) or {}
        position = row.get("position", {}) or {}
        pid = person.get("id")
        if not pid or position.get("abbreviation") == "P":
            continue
        out.append(
            {
                "player_id": int(pid),
                "player": person.get("fullName"),
                "position": position.get("abbreviation"),
                "lineup_spot_num": None,
                "is_confirmed_starter": False,
                "lineup_source": "active_roster_fallback",
                "status_code": None,
            }
        )
    return out


# ----------------------------
# Hitter/pitcher feature engineering
# ----------------------------
def bats_for_player(player_id: int) -> str:
    return fetch_person_meta(player_id).get("batSide", {}).get("code", "R") or "R"


def pitch_hand_for_player(player_id: Optional[int]) -> str:
    if not player_id:
        return "R"
    return fetch_person_meta(int(player_id)).get("pitchHand", {}).get("code", "R") or "R"


def derive_ab_hits(logs: List[Dict[str, Any]], limit: Optional[int] = None) -> Tuple[int, int, float]:
    selected = logs[:limit] if limit else logs
    ab = sum(parse_stat_int(g.get("stat", {}), "atBats") for g in selected)
    hits = sum(parse_stat_int(g.get("stat", {}), "hits") for g in selected)
    return ab, hits, safe_div(hits, ab)


def derive_one_plus_rate(logs: List[Dict[str, Any]], limit: Optional[int] = None) -> Tuple[int, int, float, int]:
    selected = logs[:limit] if limit else logs
    total = 0
    hit_games = 0
    multi = 0
    for g in selected:
        hits = parse_stat_int(g.get("stat", {}), "hits")
        total += 1
        if hits >= 1:
            hit_games += 1
        if hits >= 2:
            multi += 1
    return hit_games, multi, safe_div(hit_games, total), total


def last_n_ab(logs: List[Dict[str, Any]], target_ab: int) -> Tuple[int, int, float, int, int]:
    ab = 0
    hits = 0
    hit_games = 0
    multi = 0
    for g in logs:
        stat = g.get("stat", {})
        g_ab = parse_stat_int(stat, "atBats")
        g_hits = parse_stat_int(stat, "hits")
        if g_ab <= 0:
            continue
        ab += g_ab
        hits += g_hits
        if g_hits >= 1:
            hit_games += 1
        if g_hits >= 2:
            multi += 1
        if ab >= target_ab:
            break
    return ab, hits, safe_div(hits, ab), hit_games, multi


def estimate_fallback_batting_order_from_gamelog(logs: List[Dict[str, Any]]) -> Optional[int]:
    spots: List[int] = []
    for g in logs[:40]:
        spot = normalize_lineup_spot_from_code((g.get("stat", {}) or {}).get("battingOrder"))
        if spot is not None:
            spots.append(spot)
    if not spots:
        return None

    numerator = 0.0
    denominator = 0.0
    for idx, spot in enumerate(spots):
        weight = max(1.0, 40.0 - idx)
        numerator += spot * weight
        denominator += weight
    return int(round(numerator / denominator))


def blended_real_split_avg(season_avg: float, season_ab: int, three_avg: float, three_ab: int, career_avg: float, career_ab: int, base_avg: float) -> float:
    # Weight recent season heavily when sample exists, then 3yr, then career, with base fallback.
    season_w = min(season_ab / 120.0, 1.0) * 0.45
    three_w = min(three_ab / 300.0, 1.0) * 0.35
    career_w = min(career_ab / 700.0, 1.0) * 0.20
    total_w = season_w + three_w + career_w
    if total_w <= 0:
        return base_avg
    raw = (season_avg * season_w + three_avg * three_w + career_avg * career_w) / total_w
    # Blend to base if total sample is weak.
    trust = clamp(total_w / 1.0, 0.0, 1.0)
    return trust * raw + (1 - trust) * base_avg


def build_hitter_features(player_id: int, player: str, bats: str, opp_hand: str) -> Dict[str, Any]:
    season_stat = load_season_hitting(player_id, CURRENT_SEASON)
    career_stat = load_career_hitting(player_id)

    logs: List[Dict[str, Any]] = []
    for season in SEASONS_3YR:
        logs.extend(load_gamelog(player_id, season, "hitting"))

    fallback_order = estimate_fallback_batting_order_from_gamelog(logs)

    ab_3yr, hits_3yr, hpa_3yr = derive_ab_hits(logs)
    _, _, one_plus_3yr, _ = derive_one_plus_rate(logs)

    season_ab = parse_stat_int(season_stat, "atBats")
    season_hits = parse_stat_int(season_stat, "hits")
    season_pa = parse_stat_int(season_stat, "plateAppearances")
    season_hpa = safe_div(season_hits, season_ab)

    # Overall recent form: last 7 is still a game-count snapshot, but 15/30/50/100/200
    # below are true AT-BAT accumulation windows. The UI labels these as AB windows.
    last7_ab, last7_hits, last7_hpa = derive_ab_hits(logs, 7)
    last15_ab, last15_hits, last15_hpa, hit15, multi15 = last_n_ab(logs, 15)
    last30_ab, last30_hits, last30_hpa, _, _ = last_n_ab(logs, 30)
    last50_ab, last50_hits, last50_hpa, hit50, multi50 = last_n_ab(logs, 50)
    last100_ab, last100_hits, last100_hpa, hit100, multi100 = last_n_ab(logs, 100)
    last200_ab, last200_hits, last200_hpa, hit200, multi200 = last_n_ab(logs, 200)

    _, _, last7_one_plus, _ = derive_one_plus_rate(logs, 7)
    _, _, last15_one_plus, _ = derive_one_plus_rate(logs, 15)
    _, _, last30_one_plus, _ = derive_one_plus_rate(logs, 30)
    _, _, last50_one_plus, _ = derive_one_plus_rate(logs, 50)
    _, _, last100_one_plus, _ = derive_one_plus_rate(logs, 100)
    _, _, last200_one_plus, _ = derive_one_plus_rate(logs, 200)
    _, _, season_one_plus, _ = derive_one_plus_rate(logs, min(162, len(logs)))

    real_splits = build_real_split_bundle(player_id)

    base_avg = hpa_3yr or season_hpa or 0.245

    lhp_blend = blended_real_split_avg(
        real_splits["real_avg_vs_lhp_season"],
        real_splits["real_ab_vs_lhp_season"],
        real_splits["real_avg_vs_lhp_3yr"],
        real_splits["real_ab_vs_lhp_3yr"],
        real_splits["real_avg_vs_lhp_career"],
        real_splits["real_ab_vs_lhp_career"],
        base_avg,
    )
    rhp_blend = blended_real_split_avg(
        real_splits["real_avg_vs_rhp_season"],
        real_splits["real_ab_vs_rhp_season"],
        real_splits["real_avg_vs_rhp_3yr"],
        real_splits["real_ab_vs_rhp_3yr"],
        real_splits["real_avg_vs_rhp_career"],
        real_splits["real_ab_vs_rhp_career"],
        base_avg,
    )

    if opp_hand == "L":
        split_ab_3yr = real_splits["real_ab_vs_lhp_3yr"]
        split_hits_3yr = real_splits["real_hits_vs_lhp_3yr"]
        split_hpa_3yr = lhp_blend
        split_ab_season = real_splits["real_ab_vs_lhp_season"]
        split_hits_season = real_splits["real_hits_vs_lhp_season"]
        split_hpa_season = real_splits["real_avg_vs_lhp_season"] or lhp_blend
        split_ab_last100 = min(split_ab_3yr, 100)
        split_hits_last100 = int(round(split_hpa_3yr * split_ab_last100))
        split_hpa_last100 = split_hpa_3yr
    else:
        split_ab_3yr = real_splits["real_ab_vs_rhp_3yr"]
        split_hits_3yr = real_splits["real_hits_vs_rhp_3yr"]
        split_hpa_3yr = rhp_blend
        split_ab_season = real_splits["real_ab_vs_rhp_season"]
        split_hits_season = real_splits["real_hits_vs_rhp_season"]
        split_hpa_season = real_splits["real_avg_vs_rhp_season"] or rhp_blend
        split_ab_last100 = min(split_ab_3yr, 100)
        split_hits_last100 = int(round(split_hpa_3yr * split_ab_last100))
        split_hpa_last100 = split_hpa_3yr

    split_one_plus = clamp(1 - math.exp(-4.0 * split_hpa_3yr), 0.0, 0.98)

    # UI display: recent handedness windows use true MLB handedness split as the anchor,
    # then blend in overall AB-window form. These are labeled as AB windows in the drawer.
    # StatsAPI does not provide recent split-by-hand game logs cleanly, so this avoids mirrored
    # fake split values while keeping recent AB form in the estimate.
    last50ab_lhp = 0.75 * lhp_blend + 0.25 * last50_hpa
    last100ab_lhp = 0.80 * lhp_blend + 0.20 * last100_hpa
    last200ab_lhp = 0.85 * lhp_blend + 0.15 * last200_hpa

    last50ab_rhp = 0.75 * rhp_blend + 0.25 * last50_hpa
    last100ab_rhp = 0.80 * rhp_blend + 0.20 * last100_hpa
    last200ab_rhp = 0.85 * rhp_blend + 0.15 * last200_hpa

    return {
        "player_id": player_id,
        "player": player,
        "bats": bats,
        "fallback_batting_order": fallback_order,
        "ab_3yr": ab_3yr,
        "hits_3yr": hits_3yr,
        "hits_per_ab_3yr": hpa_3yr,
        "one_plus_hit_rate_3yr": one_plus_3yr,
        "season_ab": season_ab,
        "season_hits": season_hits,
        "season_pa": season_pa,
        "season_hits_per_ab": season_hpa,
        "season_one_plus_hit_rate": season_one_plus,
        "last7_ab": last7_ab,
        "last7_hits": last7_hits,
        "last7_hits_per_ab": last7_hpa,
        "last7_one_plus_hit_rate": last7_one_plus,
        "last15_ab": last15_ab,
        "last15_hits": last15_hits,
        "last15_hits_per_ab": last15_hpa,
        "last15_one_plus_hit_rate": last15_one_plus,
        "last30_ab": last30_ab,
        "last30_hits": last30_hits,
        "last30_hits_per_ab": last30_hpa,
        "last30_one_plus_hit_rate": last30_one_plus,
        "last50_ab": last50_ab,
        "last50_hits": last50_hits,
        "last50_hits_per_ab": last50_hpa,
        "last50_one_plus_hit_rate": last50_one_plus,
        "last100_ab": last100_ab,
        "last100_hits": last100_hits,
        "last100_hits_per_ab": last100_hpa,
        "last100_one_plus_hit_rate": last100_one_plus,
        "last200_ab": last200_ab,
        "last200_hits": last200_hits,
        "last200_hits_per_ab": last200_hpa,
        "last200_one_plus_hit_rate": last200_one_plus,
        "games_with_hit_last15": hit15,
        "games_with_multi_hit_last15": multi15,
        "games_with_hit_last50": hit50,
        "games_with_multi_hit_last50": multi50,
        "games_with_hit_last100": hit100,
        "games_with_multi_hit_last100": multi100,
        "games_with_hit_last200": hit200,
        "games_with_multi_hit_last200": multi200,
        "split_source": "real_mlb_statSplits",
        "split_ab_3yr_vs_opp_hand": split_ab_3yr,
        "split_hits_3yr_vs_opp_hand": split_hits_3yr,
        "split_hits_per_ab_3yr_vs_opp_hand": split_hpa_3yr,
        "split_one_plus_hit_rate_3yr_vs_opp_hand": split_one_plus,
        "split_ab_season_vs_opp_hand": split_ab_season,
        "split_hits_season_vs_opp_hand": split_hits_season,
        "split_hits_per_ab_season_vs_opp_hand": split_hpa_season,
        "split_ab_last100_vs_opp_hand": split_ab_last100,
        "split_hits_last100_vs_opp_hand": split_hits_last100,
        "split_hits_per_ab_last100_vs_opp_hand": split_hpa_last100,
        "last50ab_avg_vs_lhp": last50ab_lhp,
        "last100ab_avg_vs_lhp": last100ab_lhp,
        "last200ab_avg_vs_lhp": last200ab_lhp,
        # Backward-compatible aliases for older UI copies.
        "last15_avg_vs_lhp": last50ab_lhp,
        "last50_avg_vs_lhp": last50ab_lhp,
        "last100_avg_vs_lhp": last100ab_lhp,
        "season_avg_vs_lhp": real_splits["real_avg_vs_lhp_season"] or lhp_blend,
        "three_year_avg_vs_lhp": real_splits["real_avg_vs_lhp_3yr"] or lhp_blend,
        "alltime_avg_vs_lhp": real_splits["real_avg_vs_lhp_career"] or lhp_blend,
        "last50ab_avg_vs_rhp": last50ab_rhp,
        "last100ab_avg_vs_rhp": last100ab_rhp,
        "last200ab_avg_vs_rhp": last200ab_rhp,
        # Backward-compatible aliases for older UI copies.
        "last15_avg_vs_rhp": last50ab_rhp,
        "last50_avg_vs_rhp": last50ab_rhp,
        "last100_avg_vs_rhp": last100ab_rhp,
        "season_avg_vs_rhp": real_splits["real_avg_vs_rhp_season"] or rhp_blend,
        "three_year_avg_vs_rhp": real_splits["real_avg_vs_rhp_3yr"] or rhp_blend,
        "alltime_avg_vs_rhp": real_splits["real_avg_vs_rhp_career"] or rhp_blend,
        **real_splits,
    }



def park_hit_factor_for_venue(venue: Optional[str]) -> float:
    if not venue:
        return 1.00
    venue_clean = str(venue).strip()
    if venue_clean in PARK_HIT_FACTORS_BY_VENUE:
        return PARK_HIT_FACTORS_BY_VENUE[venue_clean]
    lower = venue_clean.lower()
    for known, factor in PARK_HIT_FACTORS_BY_VENUE.items():
        if known.lower() in lower or lower in known.lower():
            return factor
    return 1.00


def opponent_pa_allowed_factor_from_pitching(stat: Dict[str, Any]) -> float:
    ip_raw = str(stat.get("inningsPitched", "0") or "0")
    try:
        if "." in ip_raw:
            whole, outs = ip_raw.split(".")
            ip = int(whole) + int(outs) / 3
        else:
            ip = float(ip_raw)
    except Exception:
        ip = 0.0

    hits_allowed = parse_stat_int(stat, "hits")
    walks = parse_stat_int(stat, "baseOnBalls")
    hbp = parse_stat_int(stat, "hitByPitch")
    strikeouts = parse_stat_int(stat, "strikeOuts")
    batters_faced = parse_stat_int(stat, "battersFaced")

    whip = parse_stat_float(stat, "whip", 1.28)
    hits_per_ip = safe_div(hits_allowed, ip, 1.00)
    walks_hbp_per_ip = safe_div(walks + hbp, ip, 0.38)
    k_rate = safe_div(strikeouts, batters_faced, 0.22)

    traffic_component = 0.50 * clamp((whip - 1.28) / 0.35, -1.0, 1.0)
    hits_component = 0.30 * clamp((hits_per_ip - 1.00) / 0.32, -1.0, 1.0)
    walk_component = 0.20 * clamp((walks_hbp_per_ip - 0.38) / 0.20, -1.0, 1.0)
    k_component = -0.20 * clamp((k_rate - 0.22) / 0.10, -1.0, 1.0)
    raw = traffic_component + hits_component + walk_component + k_component

    return clamp(1.00 + 0.035 * raw, 0.960, 1.040)


def team_run_context_factor_from_pitching(stat: Dict[str, Any]) -> float:
    whip = parse_stat_float(stat, "whip", 1.28)
    strikeouts = parse_stat_int(stat, "strikeOuts")
    batters_faced = parse_stat_int(stat, "battersFaced")
    k_rate = safe_div(strikeouts, batters_faced, 0.22)

    traffic = clamp((whip - 1.28) / 0.35, -1.0, 1.0)
    strikeout_drag = clamp((k_rate - 0.22) / 0.10, -1.0, 1.0)

    return clamp(1.00 + 0.020 * traffic - 0.015 * strikeout_drag, 0.970, 1.030)


def pitcher_features(pitcher_id: Optional[int]) -> Dict[str, Any]:
    """
    Pitcher context for PropHit.

    This keeps the original model behavior intact, while adding UI-ready pitcher fields:
    - opp_pitcher_mlb_url
    - opp_pitcher_baseball_reference_url is added later when pitcher name is known
    - opp_pitcher_era
    - opp_pitcher_whip
    - opp_pitcher_k_rate
    - opp_pitcher_bb_rate
    - opp_pitcher_hits_per_9
    - opp_pitcher_hr_per_9
    - opp_pitcher_batters_faced
    - pitcher_hover_summary

    The existing scoring inputs remain compatible:
    - opp_pitcher_hits_allowed_per_ip
    - opp_pitcher_whip
    - opp_pitcher_k_rate
    - opp_team_pa_allowed_factor
    - pitcher_traffic_factor
    - team_run_context_factor
    """
    if not pitcher_id:
        return {
            "opp_pitcher_mlb_url": None,
            "opp_pitcher_era": None,
            "opp_pitcher_whip": 1.28,
            "opp_pitcher_k_rate": 0.22,
            "opp_pitcher_bb_rate": None,
            "opp_pitcher_hits_per_9": None,
            "opp_pitcher_hr_per_9": None,
            "opp_pitcher_batters_faced": None,
            "opp_pitcher_hits_allowed_per_ip": 1.00,
            "opp_pitcher_split_hits_allowed_vs_batter_hand": 0.245,
            "opp_team_pa_allowed_factor": 1.00,
            "pitcher_traffic_factor": 1.00,
            "team_run_context_factor": 1.00,
            "pitcher_hover_summary": {
                "era": None,
                "whip": 1.28,
                "k_rate": 0.22,
                "bb_rate": None,
                "hits_per_9": None,
                "hr_per_9": None,
                "baa_vs_lhb_season": None,
                "baa_vs_rhb_season": None,
                "baa_vs_lhb_career": None,
                "baa_vs_rhb_career": None,
            },
        }

    stat = load_season_pitching(int(pitcher_id), CURRENT_SEASON)
    pitcher_baa_splits = pitcher_baa_split_bundle(int(pitcher_id))

    ip = parse_ip_to_float(stat.get("inningsPitched", "0"))

    hits_allowed = parse_stat_int(stat, "hits")
    home_runs_allowed = parse_stat_int(stat, "homeRuns")
    walks = parse_stat_int(stat, "baseOnBalls")
    strikeouts = parse_stat_int(stat, "strikeOuts")
    batters_faced = parse_stat_int(stat, "battersFaced")

    era = parse_stat_float(stat, "era", None)
    whip = parse_stat_float(stat, "whip", 1.28)

    k_rate = safe_div(strikeouts, batters_faced, 0.22)
    bb_rate = safe_div(walks, batters_faced, 0.08)
    hits_per_ip = safe_div(hits_allowed, ip, 1.00)
    hits_per_9 = safe_div(hits_allowed * 9.0, ip, None)
    hr_per_9 = safe_div(home_runs_allowed * 9.0, ip, None)

    opp_pa_factor = opponent_pa_allowed_factor_from_pitching(stat)
    run_context_factor = team_run_context_factor_from_pitching(stat)

    return {
        "opp_pitcher_mlb_url": mlb_player_url(int(pitcher_id)),
        "opp_pitcher_era": era,
        "opp_pitcher_whip": whip,
        "opp_pitcher_k_rate": k_rate,
        "opp_pitcher_bb_rate": bb_rate,
        "opp_pitcher_hits_per_9": hits_per_9,
        "opp_pitcher_hr_per_9": hr_per_9,
        "opp_pitcher_batters_faced": batters_faced,
        "opp_pitcher_hits_allowed": hits_allowed,
        "opp_pitcher_home_runs_allowed": home_runs_allowed,
        "opp_pitcher_walks": walks,
        "opp_pitcher_strikeouts": strikeouts,
        "opp_pitcher_innings_pitched": ip,
        "opp_pitcher_hits_allowed_per_ip": hits_per_ip,
        "opp_pitcher_split_hits_allowed_vs_batter_hand": 0.245,
        **pitcher_baa_splits,
        "opp_team_pa_allowed_factor": opp_pa_factor,
        "pitcher_traffic_factor": opp_pa_factor,
        "team_run_context_factor": run_context_factor,
        "pitcher_hover_summary": {
            "era": era,
            "whip": whip,
            "k_rate": k_rate,
            "bb_rate": bb_rate,
            "hits_per_9": hits_per_9,
            "hr_per_9": hr_per_9,
            "batters_faced": batters_faced,
            "baa_vs_lhb_season": pitcher_baa_splits.get("pitcher_baa_vs_lhb_season"),
            "baa_vs_rhb_season": pitcher_baa_splits.get("pitcher_baa_vs_rhb_season"),
            "baa_vs_lhb_career": pitcher_baa_splits.get("pitcher_baa_vs_lhb_career"),
            "baa_vs_rhb_career": pitcher_baa_splits.get("pitcher_baa_vs_rhb_career"),
        },
    }

# ----------------------------
# Projection/scoring
# ----------------------------
def estimate_projected_pa(
    lineup_spot: Optional[int],
    confirmed: bool,
    fallback_order: Optional[int],
    home_away: str = "",
    opp_team_pa_allowed_factor: float = 1.00,
    pitcher_traffic_factor: float = 1.00,
    team_run_context_factor: float = 1.00,
) -> float:
    order = lineup_spot if lineup_spot is not None else fallback_order
    mapping_confirmed = {1: 4.8, 2: 4.6, 3: 4.5, 4: 4.4, 5: 4.2, 6: 4.0, 7: 3.9, 8: 3.8, 9: 3.7}
    mapping_fallback = {1: 4.55, 2: 4.40, 3: 4.30, 4: 4.20, 5: 4.05, 6: 3.90, 7: 3.75, 8: 3.60, 9: 3.50}

    if order is None:
        base_pa = 3.35 if not confirmed else 4.0
    else:
        try:
            order_i = int(order)
        except Exception:
            order_i = None
        if order_i is None:
            base_pa = 3.35 if not confirmed else 4.0
        else:
            base_pa = mapping_confirmed.get(order_i, 4.0) if confirmed else mapping_fallback.get(order_i, 3.75)

    home_away_clean = str(home_away or "").lower()
    home_away_adj = AWAY_TEAM_PA_BONUS if home_away_clean == "away" else HOME_TEAM_PA_PENALTY

    pa = base_pa + home_away_adj
    pa *= clamp(float(opp_team_pa_allowed_factor or 1.00), 0.960, 1.040)
    pa *= clamp(float(pitcher_traffic_factor or 1.00), 0.960, 1.040)
    pa *= clamp(float(team_run_context_factor or 1.00), 0.970, 1.030)

    return clamp(pa, 2.85, 5.15)


def estimate_projected_ab(projected_pa: float, season_ab: int = 0, season_pa: int = 0) -> float:
    if season_pa and season_pa > 0 and season_ab and season_ab > 0:
        ab_per_pa = clamp(float(season_ab) / float(season_pa), 0.78, 0.94)
        return max(2.4, projected_pa * ab_per_pa)
    return max(2.4, projected_pa - 0.42)


def estimate_pinch_hit_risk(lineup_spot: Optional[int], bats: str, opp_hand: str, confirmed: bool) -> float:
    risk = 0.10 if confirmed else 0.36
    if lineup_spot is None:
        risk += 0.08
    elif lineup_spot >= 7:
        risk += 0.06
    if bats == "S":
        risk -= 0.04
    if opp_hand == "L" and bats == "L":
        risk += 0.06
    return clamp(risk, 0.02, 0.75)



def confidence_tier_from_score(score: float) -> str:
    if score >= 75:
        return "High"
    if score >= 55:
        return "Medium"
    return "Low"


def best_bet_tier_from_score(score: float) -> str:
    if score >= 82:
        return "A"
    if score >= 72:
        return "B"
    if score >= 62:
        return "C"
    return "Watch"


def launch_status_labels(row: Dict[str, Any]) -> Tuple[str, str]:
    if row.get("projection_locked"):
        return "Locked", "Projection frozen at game start"
    if row.get("game_started"):
        return "Started", "Game has started"
    if row.get("is_confirmed_starter"):
        return "Confirmed", "Confirmed MLB lineup"
    if row.get("fallback_batting_order"):
        return "Projected", "Lineup not confirmed; using fallback recent order"
    return "Unconfirmed", "Lineup not confirmed"


def compute_projection(row: Dict[str, Any]) -> Dict[str, Any]:
    row = dict(row)

    row["home_away_pa_adjustment"] = AWAY_TEAM_PA_BONUS if str(row.get("home_away", "")).lower() == "away" else HOME_TEAM_PA_PENALTY
    row["opp_team_pa_allowed_factor"] = row.get("opp_team_pa_allowed_factor", 1.00)
    row["pitcher_traffic_factor"] = row.get("pitcher_traffic_factor", 1.00)
    row["team_run_context_factor"] = row.get("team_run_context_factor", 1.00)

    row["projected_pa_base_lineup"] = estimate_projected_pa(
        row.get("lineup_spot_num"),
        bool(row.get("is_confirmed_starter")),
        row.get("fallback_batting_order"),
        home_away="neutral",
        opp_team_pa_allowed_factor=1.00,
        pitcher_traffic_factor=1.00,
        team_run_context_factor=1.00,
    )

    row["projected_pa"] = estimate_projected_pa(
        row.get("lineup_spot_num"),
        bool(row.get("is_confirmed_starter")),
        row.get("fallback_batting_order"),
        home_away=row.get("home_away", ""),
        opp_team_pa_allowed_factor=row.get("opp_team_pa_allowed_factor", 1.00),
        pitcher_traffic_factor=row.get("pitcher_traffic_factor", 1.00),
        team_run_context_factor=row.get("team_run_context_factor", 1.00),
    )
    row["projected_ab"] = estimate_projected_ab(row["projected_pa"], row.get("season_ab", 0), row.get("season_pa", 0))
    row["pinch_hit_risk"] = estimate_pinch_hit_risk(row.get("lineup_spot_num"), row.get("bats", "R"), row.get("opp_pitcher_hand", "R"), bool(row.get("is_confirmed_starter")))
    row["park_factor_hits"] = park_hit_factor_for_venue(row.get("venue"))

    deep_skill = 0.55 * row["hits_per_ab_3yr"] + 0.25 * row["season_hits_per_ab"] + 0.20 * row["last100_hits_per_ab"]

    split_rel = clamp(row["split_ab_3yr_vs_opp_hand"] / 220.0, 0.0, 1.0)
    split_raw = (
        0.55 * row["split_hits_per_ab_3yr_vs_opp_hand"]
        + 0.25 * row["split_hits_per_ab_season_vs_opp_hand"]
        + 0.20 * row["split_hits_per_ab_last100_vs_opp_hand"]
    )
    adj_split = split_rel * split_raw + (1 - split_rel) * deep_skill

    current_raw = 0.45 * row["last30_hits_per_ab"] + 0.30 * row["last15_hits_per_ab"] + 0.15 * row["last7_hits_per_ab"] + 0.10 * row["last50_hits_per_ab"]
    adj_current = 0.70 * current_raw + 0.30 * deep_skill

    skill_hit_rate = clamp(0.52 * deep_skill + 0.30 * adj_split + 0.18 * adj_current, 0.12, 0.42)

    hits_allowed_boost = clamp((row["opp_pitcher_hits_allowed_per_ip"] - 1.00) / 0.35, -1.0, 1.0)
    k_penalty = clamp((row["opp_pitcher_k_rate"] - 0.22) / 0.10, -1.0, 1.0)
    matchup_multiplier = clamp(1.00 + 0.08 * hits_allowed_boost - 0.07 * k_penalty, 0.90, 1.10)

    final_hit_rate_before_park = clamp(skill_hit_rate * matchup_multiplier, 0.10, 0.45)
    final_hit_rate = clamp(final_hit_rate_before_park * row["park_factor_hits"], 0.10, 0.47)
    projected_hits = clamp(row["projected_ab"] * final_hit_rate, 0.0, 2.85)
    one_plus = clamp(1.0 - math.exp(-projected_hits), 0.0, 0.98)

    espn_season_avg = row.get("season_hits_per_ab") or 0.0
    market_avg = espn_season_avg
    model_avg = final_hit_rate
    model_vs_market_avg_delta = model_avg - market_avg

    row.update(
        {
            "deep_skill": deep_skill,
            "split_skill_raw": split_raw,
            "adj_split_skill": adj_split,
            "current_form_raw": current_raw,
            "adj_current_form": adj_current,
            "skill_hit_rate": skill_hit_rate,
            "matchup_multiplier": matchup_multiplier,
            "final_hit_rate_before_park": final_hit_rate_before_park,
            "park_factor_hits": row["park_factor_hits"],
            "final_hit_rate": final_hit_rate,
            "espn_season_avg": espn_season_avg,
            "market_avg": market_avg,
            "model_avg": model_avg,
            "model_vs_market_avg_delta": model_vs_market_avg_delta,
            "model_vs_market_avg_delta_abs": abs(model_vs_market_avg_delta),
            "projected_hits": projected_hits,
            "one_plus_hit_probability": one_plus,
            "fair_odds_american": american_odds_from_prob(one_plus),
        }
    )

    row["recent_form_index"] = 0.50 * row["last15_hits_per_ab"] + 0.30 * row["last30_hits_per_ab"] + 0.20 * row["last50_hits_per_ab"]

    row["projected_hits_score"] = pct_score(row["projected_hits"], 0.45, 1.05)
    row["recent30_one_plus_hit_score"] = pct_score(row["last30_one_plus_hit_rate"], 0.40, 0.80)
    row["split_score"] = pct_score(row["split_hits_per_ab_3yr_vs_opp_hand"], 0.18, 0.35)
    row["projected_ab_score"] = pct_score(row["projected_ab"], 3.0, 4.2)
    row["recent_form_score"] = pct_score(row["recent_form_index"], 0.18, 0.35)
    row["sample_size_score"] = pct_score(row["ab_3yr"], 200, 1200)
    row["split_reliability_score"] = pct_score(row["split_ab_3yr_vs_opp_hand"], 40, 450)

    starter_score = 60 if row["is_confirmed_starter"] else 25
    lineup_score = 35 if row.get("lineup_spot_num") else (22 if row.get("fallback_batting_order") else 8)
    row["opportunity_certainty_score"] = clamp(starter_score + lineup_score - 30 * row["pinch_hit_risk"], 0.0, 100.0)

    volatility = abs(row["last30_one_plus_hit_rate"] - row["last7_one_plus_hit_rate"])
    row["consistency_score"] = clamp(
        0.50 * pct_score(row["last30_one_plus_hit_rate"], 0.40, 0.80)
        + 0.30 * pct_score(row["season_one_plus_hit_rate"], 0.40, 0.80)
        + 0.20 * (100 - pct_score(volatility, 0.00, 0.35)),
        0.0,
        100.0,
    )

    row["matchup_score"] = clamp(
        0.40 * pct_score(row["split_hits_per_ab_3yr_vs_opp_hand"], 0.18, 0.35)
        + 0.25 * pct_score(row["opp_pitcher_hits_allowed_per_ip"], 0.90, 1.35)
        + 0.20 * pct_score(row["opp_pitcher_whip"], 1.00, 1.45)
        + 0.15 * (100 - pct_score(row["opp_pitcher_k_rate"], 0.16, 0.34)),
        0.0,
        100.0,
    )

    row["data_quality_flag"] = "ok"
    if row["ab_3yr"] < 100:
        row["data_quality_flag"] = "small_3yr_sample"
    if row["split_ab_3yr_vs_opp_hand"] < 30:
        row["data_quality_flag"] = "thin_real_split_sample"
    if not row.get("lineup_spot_num") and row.get("fallback_batting_order"):
        row["data_quality_flag"] = "fallback_lineup_order"
    if not row.get("lineup_spot_num") and not row.get("fallback_batting_order"):
        row["data_quality_flag"] = "no_lineup_order"

    row["hit_score"] = clamp(
        0.30 * row["projected_hits_score"]
        + 0.25 * row["recent30_one_plus_hit_score"]
        + 0.23 * row["split_score"]
        + 0.14 * row["projected_ab_score"]
        + 0.08 * row["recent_form_score"],
        0.0,
        100.0,
    )

    dq_score = 100.0 if row["data_quality_flag"] == "ok" else 70.0 if row["data_quality_flag"] in ["fallback_lineup_order", "thin_real_split_sample"] else 55.0

    row["confidence_score"] = clamp(
        0.28 * row["sample_size_score"]
        + 0.27 * row["split_reliability_score"]
        + 0.20 * row["opportunity_certainty_score"]
        + 0.15 * row["consistency_score"]
        + 0.10 * dq_score,
        0.0,
        100.0,
    )

    # Launch-grade decision layer.
    # Since live sportsbook market odds are not wired yet, "market_avg" is the current season average baseline.
    # This ranks plays by model advantage, probability, confidence, AB volume, and risk.
    row["confidence_tier"] = confidence_tier_from_score(row["confidence_score"])
    row["launch_edge_score"] = clamp(
        50.0
        + 240.0 * row.get("model_vs_market_avg_delta", 0.0)
        + 0.18 * row["hit_score"]
        + 0.14 * row["confidence_score"]
        + 0.10 * row["matchup_score"]
        - 20.0 * row["pinch_hit_risk"],
        0.0,
        100.0,
    )
    row["best_bet_rank_score"] = clamp(
        0.34 * row["hit_score"]
        + 0.24 * row["confidence_score"]
        + 0.18 * row["matchup_score"]
        + 0.14 * row["projected_ab_score"]
        + 0.10 * pct_score(row["one_plus_hit_probability"], 0.48, 0.72),
        0.0,
        100.0,
    )
    row["best_bet_tier"] = best_bet_tier_from_score(row["best_bet_rank_score"])
    row["top_play_candidate"] = (
        row["best_bet_rank_score"] >= 72
        and row["confidence_score"] >= 60
        and row["one_plus_hit_probability"] >= 0.56
        and row["projected_ab"] >= 3.65
        and row["pinch_hit_risk"] <= 0.42
    )
    row["status_label"], row["freeze_status"] = launch_status_labels(row)

    row["strong_play_tag"] = row["one_plus_hit_probability"] >= 0.58 and row["confidence_score"] >= 60 and row["projected_ab"] >= 3.8
    row["elite_play_tag"] = row["one_plus_hit_probability"] >= 0.64 and row["confidence_score"] >= 70 and row["hit_score"] >= 75
    row["fade_risk_tag"] = row["projected_ab"] < 3.3 or row["confidence_score"] < 45 or row["pinch_hit_risk"] > 0.50 or row["data_quality_flag"] == "no_lineup_order"

    positives: List[str] = []
    risks: List[str] = []

    if row["projected_ab"] >= 4.0:
        positives.append("High projected AB volume")

    if row["last30_one_plus_hit_rate"] >= 0.65:
        positives.append("Strong recent 1+ hit consistency")

    if row["split_hits_per_ab_3yr_vs_opp_hand"] >= 0.275:
        positives.append(f"Real MLB split is favorable vs {row['opp_pitcher_hand']}-handed pitching")

    pitcher_baa_vs_hand = row.get("pitcher_season_baa_allowed_vs_batter_hand")

    if pitcher_baa_vs_hand is not None and pd.notna(pitcher_baa_vs_hand):
        if pitcher_baa_vs_hand >= 0.280:
            positives.append(f"Favorable pitcher matchup: opposing pitcher allows a {pitcher_baa_vs_hand:.3f} season BAA vs this batter hand")
        elif pitcher_baa_vs_hand >= 0.250:
            positives.append(f"Neutral-to-favorable pitcher matchup: opposing pitcher allows a {pitcher_baa_vs_hand:.3f} season BAA vs this batter hand")
        elif pitcher_baa_vs_hand < 0.230:
            risks.append(f"Pitcher matchup risk: opposing pitcher has limited this batter hand to a {pitcher_baa_vs_hand:.3f} season BAA")
        else:
            risks.append(f"Moderate pitcher matchup caution: opposing pitcher allows only a {pitcher_baa_vs_hand:.3f} season BAA vs this batter hand")
    else:
        if row["matchup_score"] >= 65:
            positives.append("Favorable matchup profile")

    if row.get("lineup_spot_num") in [1, 2, 3, 4]:
        positives.append("Confirmed favorable lineup slot")

    if row["split_ab_3yr_vs_opp_hand"] < 75:
        risks.append("Real handedness split sample is smaller than preferred")

    if not row.get("lineup_spot_num"):
        risks.append("No confirmed lineup slot from MLB feed yet")

    if row["opp_pitcher_k_rate"] >= 0.28:
        risks.append("Opposing pitcher strikeout rate is elevated")

    if row["pinch_hit_risk"] > 0.35:
        risks.append("Some pinch-hit or role risk")

    row["why_it_grades_well"] = positives
    row["risk_factors"] = risks
    row["summary_blurb"] = f"{row['player']} projects for {row['projected_hits']:.2f} hits with a {row['one_plus_hit_probability']:.1%} 1+ hit probability."
    row["row_key"] = f"{row['date']}|{row['game_pk']}|{row['player_id']}"
    return row



# ----------------------------
# Slate building
# ----------------------------
def game_context(game: Dict[str, Any]) -> Dict[str, Any]:
    game_date, game_time_et = game_time_to_et(game["gameDate"])
    home_team = game["teams"]["home"]["team"]
    away_team = game["teams"]["away"]["team"]
    home_pitcher = game["teams"]["home"].get("probablePitcher") or {}
    away_pitcher = game["teams"]["away"].get("probablePitcher") or {}

    return {
        "game_pk": int(game["gamePk"]),
        "date": game_date,
        "game_time_et": game_time_et,
        "venue": game.get("venue", {}).get("name"),
        "home_team_id": home_team.get("id"),
        "home_team": home_team.get("abbreviation"),
        "away_team_id": away_team.get("id"),
        "away_team": away_team.get("abbreviation"),
        "home_probable_pitcher_id": home_pitcher.get("id"),
        "home_probable_pitcher": home_pitcher.get("fullName"),
        "away_probable_pitcher_id": away_pitcher.get("id"),
        "away_probable_pitcher": away_pitcher.get("fullName"),
    }


def build_game_rows(game: Dict[str, Any]) -> List[Dict[str, Any]]:
    ctx = game_context(game)
    game_pk = ctx["game_pk"]
    feed = fetch_live_feed(game_pk)

    output: List[Dict[str, Any]] = []

    sides = [
        ("away", ctx["away_team"], ctx["home_team"], ctx["away_team_id"], ctx["home_probable_pitcher_id"], ctx["home_probable_pitcher"], "away"),
        ("home", ctx["home_team"], ctx["away_team"], ctx["home_team_id"], ctx["away_probable_pitcher_id"], ctx["away_probable_pitcher"], "home"),
    ]

    for team_side, team_abbr, opp_abbr, team_id, opp_pitcher_id, opp_pitcher_name, home_away in sides:
        hitters = extract_confirmed_lineup_players_hard(feed, team_side)
        confirmed_count = len(hitters)

        if not hitters:
            hitters = fallback_hitters_from_roster(int(team_id), CURRENT_SEASON)

        opp_pitcher_hand = pitch_hand_for_player(int(opp_pitcher_id)) if opp_pitcher_id else "R"

        for h in hitters:
            player_id = int(h["player_id"])
            player = h["player"]
            bats = bats_for_player(player_id)

            hf = build_hitter_features(player_id, player, bats, opp_pitcher_hand)
            pf = pitcher_features(int(opp_pitcher_id) if opp_pitcher_id else None)

            lineup_spot = h.get("lineup_spot_num")
            fallback_order = hf.get("fallback_batting_order")

            base = {
                "date": ctx["date"],
                "game_time_et": ctx["game_time_et"],
                "game_pk": game_pk,
                "player_id": player_id,
                "player": player,
                "team": team_abbr,
                "opp": opp_abbr,
                "home_away": home_away,
                "batting_order": lineup_spot,
                "lineup_spot_num": lineup_spot,
                "fallback_batting_order": fallback_order,
                "lineup_source": h.get("lineup_source", "unknown"),
                "confirmed_lineup_count_for_team": confirmed_count,
                "position": h.get("position"),
                "bats": bats,
                "is_confirmed_starter": bool(h.get("is_confirmed_starter")),
                "player_mlb_url": mlb_player_url(player_id),
                "player_baseball_reference_url": baseball_reference_search_url(player),
                "opp_pitcher_id": int(opp_pitcher_id) if opp_pitcher_id else None,
                "opp_pitcher": opp_pitcher_name,
                "opp_pitcher_hand": opp_pitcher_hand,
                "opp_pitcher_mlb_url": mlb_player_url(int(opp_pitcher_id) if opp_pitcher_id else None),
                "opp_pitcher_baseball_reference_url": baseball_reference_search_url(opp_pitcher_name),
                "venue": ctx["venue"],
                "projection_locked": False,
                "lock_timestamp_et": None,
            }
            base.update(hf)
            base.update(pf)

            # UI-ready pitcher hover/link payload.
            # This is additive only; it does not change core PropHit scoring.
            base["opp_pitcher_mlb_url"] = base.get("opp_pitcher_mlb_url") or mlb_player_url(int(opp_pitcher_id) if opp_pitcher_id else None)
            base["opp_pitcher_baseball_reference_url"] = base.get("opp_pitcher_baseball_reference_url") or baseball_reference_search_url(opp_pitcher_name)
            base["player_mlb_url"] = base.get("player_mlb_url") or mlb_player_url(player_id)
            base["player_baseball_reference_url"] = base.get("player_baseball_reference_url") or baseball_reference_search_url(player)

            hover = dict(base.get("pitcher_hover_summary") or {})
            hover.update(
                {
                    "pitcher": opp_pitcher_name,
                    "pitcher_id": int(opp_pitcher_id) if opp_pitcher_id else None,
                    "pitcher_hand": opp_pitcher_hand,
                    "pitcher_mlb_url": base.get("opp_pitcher_mlb_url"),
                    "pitcher_baseball_reference_url": base.get("opp_pitcher_baseball_reference_url"),
                    "hitter": player,
                    "hitter_id": player_id,
                    "bats": bats,
                    "team": team_abbr,
                    "opp": opp_abbr,
                    "game_pk": game_pk,
                    "game_time_et": ctx["game_time_et"],
                }
            )
            base["pitcher_hover_summary"] = hover

            output.append(compute_projection(base))

    return output


def build_slate_df(target_date: date) -> Tuple[pd.DataFrame, List[Dict[str, Any]]]:
    """
    Full-day board / freeze-update rule.

    - Fetch today's full MLB schedule using Eastern date.
    - Build fresh projections ONLY for games that have not started yet.
    - Started/live/final/ineligible games are not recalculated here.
    - They are brought back later from FREEZE_STATE_JSON so the UI still shows the full day.
    """
    all_games = fetch_schedule(target_date)
    upcoming_games, skipped_games = filter_remaining_today_games(all_games)

    log(f"Fetched {len(all_games)} games for {target_date} ET")
    log(f"Fresh-update eligible games not started yet: {len(upcoming_games)}")
    log(f"Games to preserve from freeze state if available: {len(skipped_games)}")

    if skipped_games:
        for skipped in skipped_games[:30]:
            log(
                f"FREEZE/SKIP game_pk={skipped.get('game_pk')} "
                f"{skipped.get('away')}@{skipped.get('home')} "
                f"{skipped.get('game_time_et')} reason={skipped.get('reason')}"
            )

    all_rows: List[Dict[str, Any]] = []

    for game in upcoming_games:
        try:
            rows = build_game_rows(game)
            all_rows.extend(rows)

            confirmed = sum(1 for r in rows if r.get("is_confirmed_starter"))
            fallback = len(rows) - confirmed
            log(
                f"Updated upcoming game {game.get('gamePk')}: "
                f"{len(rows)} rows | confirmed starters {confirmed} | fallback rows {fallback}"
            )
        except Exception as exc:
            log(f"Failed upcoming game {game.get('gamePk')}: {exc}")

    if not all_rows:
        return pd.DataFrame(), skipped_games

    df = pd.DataFrame(all_rows)
    df["game_started"] = df.apply(lambda r: has_game_started(str(r["date"]), str(r["game_time_et"])), axis=1)
    df["row_key"] = df.apply(lambda r: f"{r['date']}|{r['game_pk']}|{r['player_id']}", axis=1)

    # If a game starts while the script is running, do not publish freshly changed rows.
    # Those rows will be restored from the prior freeze state in main().
    before = len(df)
    df = df[df["game_started"] == False].reset_index(drop=True)
    removed = before - len(df)
    if removed:
        log(f"Removed {removed} freshly-built rows because their games started during this run")

    return df, skipped_games


# ----------------------------
# Freeze/output
# ----------------------------
def load_freeze_state() -> pd.DataFrame:
    payload = read_json(FREEZE_STATE_JSON, [])
    return pd.DataFrame(payload) if payload else pd.DataFrame()


def save_freeze_state(df: pd.DataFrame) -> None:
    write_json(clean_for_json(df).to_dict(orient="records"), FREEZE_STATE_JSON)


def freeze_started_rows(current_df: pd.DataFrame, previous_df: pd.DataFrame) -> pd.DataFrame:
    if current_df.empty:
        return current_df

    current = current_df.copy()
    current["projection_locked"] = current.get("projection_locked", False)
    current["lock_timestamp_et"] = current.get("lock_timestamp_et", None)

    if previous_df.empty or not USE_EXISTING_FREEZE_FOR_STARTED_GAMES or "row_key" not in previous_df.columns:
        return current

    prev = previous_df.set_index("row_key").to_dict(orient="index")
    rows: List[Dict[str, Any]] = []

    for _, row in current.iterrows():
        d = row.to_dict()
        key = d["row_key"]

        if key in prev and prev[key].get("projection_locked"):
            frozen = dict(prev[key])
            frozen["game_started"] = True
            frozen["projection_locked"] = True
            rows.append(frozen)
            continue

        if d.get("game_started") and key in prev:
            frozen = dict(prev[key])
            frozen["game_started"] = True
            frozen["projection_locked"] = True
            frozen["lock_timestamp_et"] = frozen.get("lock_timestamp_et") or now_et().strftime("%Y-%m-%d %I:%M:%S %p")
            rows.append(frozen)
        else:
            d["projection_locked"] = False
            rows.append(d)

    return pd.DataFrame(rows).drop_duplicates(subset=["row_key"], keep="first").reset_index(drop=True)


def merge_full_day_freeze_board(
    fresh_upcoming_df: pd.DataFrame,
    previous_df: pd.DataFrame,
    skipped_games: Optional[List[Dict[str, Any]]] = None,
) -> pd.DataFrame:
    """
    Full-day board behavior:
    - Keep fresh rows for games that have not started yet.
    - Keep started/live/final games from the prior saved freeze state.
    - Do not recalculate started games.
    - Do not roll forward to tomorrow.
    """
    skipped_games = skipped_games or []
    target_date_str = TARGET_DATE.isoformat()

    frames: List[pd.DataFrame] = []

    if fresh_upcoming_df is not None and not fresh_upcoming_df.empty:
        fresh = fresh_upcoming_df.copy()
        fresh["projection_locked"] = False
        fresh["game_started"] = False
        fresh["projection_status"] = "LIVE_REFRESH"
        fresh["freeze_status"] = "Upcoming game refreshed this run"
        fresh["status_label"] = fresh.get("status_label", "Upcoming")
        fresh["last_refreshed_et"] = now_et().strftime("%Y-%m-%d %I:%M:%S %p")
        frames.append(fresh)

    if previous_df is not None and not previous_df.empty:
        prev = previous_df.copy()

        if "date" in prev.columns:
            prev = prev[prev["date"].astype(str) == target_date_str].copy()

        if not prev.empty and "game_pk" in prev.columns:
            skipped_game_pks = {
                int(g["game_pk"])
                for g in skipped_games
                if g.get("game_pk") is not None
            }

            if skipped_game_pks:
                prev["game_pk_int_for_freeze"] = pd.to_numeric(prev["game_pk"], errors="coerce").astype("Int64")
                frozen = prev[prev["game_pk_int_for_freeze"].isin(skipped_game_pks)].copy()
                frozen = frozen.drop(columns=["game_pk_int_for_freeze"], errors="ignore")
            else:
                frozen = prev.head(0).copy()

            if not frozen.empty:
                frozen["game_started"] = True
                frozen["projection_locked"] = True
                frozen["projection_status"] = "FROZEN_STARTED"
                frozen["freeze_status"] = "Game started; projection frozen from last pregame run"
                frozen["status_label"] = "Frozen"
                frozen["lock_timestamp_et"] = frozen.get("lock_timestamp_et", None)
                frozen["frozen_as_of_et"] = now_et().strftime("%Y-%m-%d %I:%M:%S %p")
                frames.append(frozen)

                log(f"Preserved {len(frozen)} rows from freeze state for started/ineligible games")
            elif skipped_game_pks:
                log(
                    "No freeze rows found for started/ineligible games. "
                    "If this is the first run after games already started, those games cannot be restored from pregame state."
                )

    if not frames:
        return pd.DataFrame()

    combined = pd.concat(frames, ignore_index=True, sort=False)

    if "row_key" in combined.columns:
        # Fresh upcoming rows win over older rows; frozen rows fill the started games.
        combined = combined.drop_duplicates(subset=["row_key"], keep="first")

    # Recompute status labels only where they are missing; do not change frozen labels.
    if "status_label" not in combined.columns:
        combined["status_label"] = None
    if "freeze_status" not in combined.columns:
        combined["freeze_status"] = None

    return combined.reset_index(drop=True)


def sort_df(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    cols = [c for c, _ in SORT_COLUMNS if c in df.columns]
    asc = [a for c, a in SORT_COLUMNS if c in df.columns]
    return df.sort_values(cols, ascending=asc).reset_index(drop=True)


def write_outputs(df: pd.DataFrame) -> None:
    clean = clean_for_json(df)
    records = clean.to_dict(orient="records")

    try:
        df.to_excel(EXCEL_OUTPUT, index=False)
        log(f"Saved Excel: {EXCEL_OUTPUT}")
    except PermissionError:
        fallback = EXCEL_OUTPUT.with_name(f"{EXCEL_OUTPUT.stem}_{timestamp_slug()}.xlsx")
        df.to_excel(fallback, index=False)
        log(f"Excel was locked. Saved fallback: {fallback}")

       # Add model run stamp for UI header
    eastern = ZoneInfo("America/New_York")
    run_now = datetime.now(eastern)

    latest_payload = {
        "meta": {
            "model_name": "PropHit",
            "last_model_run_et": run_now.strftime("%m/%d/%Y %I:%M %p ET"),
            "last_model_run_iso": run_now.isoformat(),
            "run_type": "manual_or_scheduled",
            "freeze_rule": "Started games remain frozen at their pregame projection."
        },
        "players": records
    }

    write_json(latest_payload, LATEST_JSON)
    write_json(records, LATEST_ALL_PLAYERS_JSON)
    write_json(PROP_HIT_SCHEMA, SCHEMA_JSON)
    write_json(build_performance_summary(df), PERFORMANCE_SUMMARY_JSON)

    snap_json = SNAPSHOT_DIR / f"prophit_snapshot_{timestamp_slug()}.json"
    snap_xlsx = SNAPSHOT_DIR / f"prophit_snapshot_{timestamp_slug()}.xlsx"
    write_json(records, snap_json)
    df.to_excel(snap_xlsx, index=False)

    log(f"UI JSON written to: {LATEST_JSON}")
    log(f"All players JSON written to: {LATEST_ALL_PLAYERS_JSON}")
    log(f"Schema JSON written to: {SCHEMA_JSON}")
    log(f"Performance summary written to: {PERFORMANCE_SUMMARY_JSON}")
    log(f"Snapshot JSON written to: {snap_json}")
    log(f"Snapshot Excel written to: {snap_xlsx}")



def build_performance_summary(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Lightweight launch panel summary.

    This is not postgame grading yet. It summarizes today's current launch board:
    visible top plays, confirmed lineup coverage, locked rows, and average model quality.
    Postgame hit-rate tracking can be added once actual-results grading is wired into snapshots.
    """
    if df.empty:
        return {
            "status": "no_data",
            "updated_et": now_et().strftime("%Y-%m-%d %I:%M:%S %p"),
        }

    top_df = df[df.get("top_play_candidate", False) == True] if "top_play_candidate" in df.columns else df.head(0)
    confirmed = int(df["is_confirmed_starter"].fillna(False).sum()) if "is_confirmed_starter" in df.columns else 0
    locked = int(df["projection_locked"].fillna(False).sum()) if "projection_locked" in df.columns else 0

    return {
        "status": "live",
        "updated_et": now_et().strftime("%Y-%m-%d %I:%M:%S %p"),
        "target_date": TARGET_DATE.isoformat(),
        "total_players": int(len(df)),
        "confirmed_starters": confirmed,
        "confirmed_lineup_pct": safe_div(confirmed, len(df)),
        "locked_rows": locked,
        "top_play_count": int(len(top_df)),
        "avg_top_play_probability": float(top_df["one_plus_hit_probability"].mean()) if len(top_df) and "one_plus_hit_probability" in top_df.columns else None,
        "avg_top_play_confidence": float(top_df["confidence_score"].mean()) if len(top_df) and "confidence_score" in top_df.columns else None,
        "best_bet_rank_score_avg": float(df["best_bet_rank_score"].mean()) if "best_bet_rank_score" in df.columns else None,
        "note": "Full-day board. Started games remain visible as frozen pregame projections; only upcoming games refresh on reruns."
    }


def append_run_log(df: pd.DataFrame) -> None:
    history = read_json(RUN_LOG_JSON, []) or []
    history.append(
        {
            "run_timestamp_et": now_et().strftime("%Y-%m-%d %I:%M:%S %p"),
            "target_date": TARGET_DATE.isoformat(),
            "players": int(len(df)),
            "confirmed_starters": int(df["is_confirmed_starter"].fillna(False).sum()) if (not df.empty and "is_confirmed_starter" in df.columns) else 0,
            "real_split_rows": int((df["split_source"] == "real_mlb_statSplits").sum()) if (not df.empty and "split_source" in df.columns) else 0,
            "thin_real_split_rows": int((df["data_quality_flag"] == "thin_real_split_sample").sum()) if (not df.empty and "data_quality_flag" in df.columns) else 0,
            "locked_rows": int(df["projection_locked"].fillna(False).sum()) if (not df.empty and "projection_locked" in df.columns) else 0,
        }
    )
    write_json(history[-100:], RUN_LOG_JSON)



def stamp_run_scope_columns(df: pd.DataFrame, skipped_games: Optional[List[Dict[str, Any]]] = None) -> pd.DataFrame:
    out = df.copy()
    as_of = now_et()
    out["run_scope"] = RUN_SCOPE_LABEL
    out["run_rule"] = (
        "Full-day board: all projected players remain visible. "
        "Games that have started are frozen from the last saved pregame projection. "
        "Only games that have not started are refreshed on reruns."
    )
    out["run_date_et"] = TARGET_DATE.isoformat()
    out["run_as_of_et"] = as_of.isoformat()
    out["model_refresh_window_et"] = "Hourly from 11:00 AM through 10:00 PM Eastern Time"
    out["started_or_ineligible_games_preserved_from_freeze_count"] = len(skipped_games or [])
    return out


def main() -> None:
    ensure_dirs()
    log("Starting PropHit model build: full-day board with started games frozen")

    previous = load_freeze_state()
    fresh_upcoming, skipped_games = build_slate_df(TARGET_DATE)

    full_day = merge_full_day_freeze_board(fresh_upcoming, previous, skipped_games)

    if full_day.empty:
        log(
            "No rows available. This usually means either no games remain and no prior freeze state exists, "
            "or this is the first run after games have already started."
        )
        full_day = stamp_run_scope_columns(pd.DataFrame(), skipped_games)
        write_outputs(full_day)
        append_run_log(full_day)
        log("Finished PropHit model. Rows: 0")
        return

    full_day = sort_df(full_day)
    full_day = stamp_run_scope_columns(full_day, skipped_games)

    # Save the combined full-day board. This is what future runs use to keep started games visible/frozen.
    save_freeze_state(full_day)
    write_outputs(full_day)
    append_run_log(full_day)

    confirmed = int(full_day["is_confirmed_starter"].fillna(False).sum()) if "is_confirmed_starter" in full_day.columns else 0
    locked = int(full_day["projection_locked"].fillna(False).sum()) if "projection_locked" in full_day.columns else 0
    fresh = int((full_day["projection_status"] == "LIVE_REFRESH").sum()) if "projection_status" in full_day.columns else 0
    frozen = int((full_day["projection_status"] == "FROZEN_STARTED").sum()) if "projection_status" in full_day.columns else 0

    log(
        f"Finished PropHit model. Rows: {len(full_day)} | fresh upcoming rows: {fresh} | "
        f"frozen started rows: {frozen} | confirmed starters: {confirmed} | locked rows: {locked}"
    )


if __name__ == "__main__":
    main()