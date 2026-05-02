from __future__ import annotations

import argparse
import json
import math
import re
import time
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

import pandas as pd
import requests

ET = ZoneInfo("America/New_York")
BASE_DIR = Path.cwd()
SNAPSHOT_DIR = BASE_DIR / "outputs" / "snapshots"
GRADE_DIR = BASE_DIR / "outputs" / "grades"
DATA_DIR = BASE_DIR / "data"
LEDGER_JSON = GRADE_DIR / "graded_ledger.json"
PERFORMANCE_SUMMARY_JSON = DATA_DIR / "prophit_performance_summary.json"
VALIDATION_ROWS_JSON = DATA_DIR / "prophit_validation_rows.json"
MLB_API = "https://statsapi.mlb.com/api/v1"
MLB_LIVE_FEED_API = "https://statsapi.mlb.com/api/v1.1"
HTTP_TIMEOUT = 30
REQUEST_PAUSE_SECONDS = 0.05


def now_et() -> datetime:
    return datetime.now(ET)


def log(message: str) -> None:
    print(f"[{now_et().strftime('%Y-%m-%d %I:%M:%S %p ET')}] {message}")


def ensure_dirs() -> None:
    GRADE_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def sanitize_json_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): sanitize_json_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize_json_value(v) for v in value]
    if isinstance(value, tuple):
        return [sanitize_json_value(v) for v in value]
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(sanitize_json_value(data), f, indent=2, allow_nan=False)


def request_json(url: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    response = requests.get(url, params=params or {}, timeout=HTTP_TIMEOUT)
    response.raise_for_status()
    time.sleep(REQUEST_PAUSE_SECONDS)
    return response.json()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Grade PropHit snapshots against MLB final box scores.")
    parser.add_argument("--date", default=None, help="Target game date in YYYY-MM-DD. Defaults to yesterday ET.")
    parser.add_argument("--force", action="store_true", help="Re-grade rows already in the ledger.")
    return parser.parse_args()


def default_target_date() -> str:
    return (now_et().date() - timedelta(days=1)).isoformat()


def parse_snapshot_run_id(path: Path) -> Tuple[str, Optional[datetime]]:
    match = re.search(r"prophit_snapshot_(\d{8}_\d{6})\.json$", path.name)
    if not match:
        return path.stem, None
    run_id = match.group(1)
    try:
        run_dt = datetime.strptime(run_id, "%Y%m%d_%H%M%S").replace(tzinfo=ET)
    except Exception:
        run_dt = None
    return run_id, run_dt


def load_snapshot_rows(target_date: str) -> List[Dict[str, Any]]:
    if not SNAPSHOT_DIR.exists():
        log(f"No snapshot folder found at {SNAPSHOT_DIR}")
        return []
    rows: List[Dict[str, Any]] = []
    files = sorted(SNAPSHOT_DIR.glob("prophit_snapshot_*.json"))
    log(f"Found {len(files)} snapshot JSON files.")
    for path in files:
        run_id, run_dt = parse_snapshot_run_id(path)
        payload = read_json(path, default=[])
        if isinstance(payload, dict):
            raw_rows = payload.get("players") or payload.get("data") or payload.get("rows") or []
            meta = payload.get("meta") or {}
            if meta.get("last_model_run_iso"):
                try:
                    run_dt = datetime.fromisoformat(str(meta["last_model_run_iso"]))
                    run_dt = run_dt.replace(tzinfo=ET) if run_dt.tzinfo is None else run_dt.astimezone(ET)
                except Exception:
                    pass
        elif isinstance(payload, list):
            raw_rows = payload
        else:
            raw_rows = []
        for row in raw_rows:
            if not isinstance(row, dict):
                continue
            if str(row.get("date") or "") != target_date:
                continue
            enriched = dict(row)
            enriched["_snapshot_file"] = path.name
            enriched["_model_run_id"] = run_id
            enriched["_model_run_dt_et"] = run_dt.isoformat() if run_dt else None
            rows.append(enriched)
    log(f"Loaded {len(rows)} snapshot rows for {target_date}.")
    return rows


def parse_game_start_et(row: Dict[str, Any]) -> Optional[datetime]:
    game_date = str(row.get("date") or "")
    game_time = str(row.get("game_time_et") or "").strip()
    if not game_date or not game_time:
        return None
    for fmt in ("%Y-%m-%d %I:%M %p", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(f"{game_date} {game_time}", fmt).replace(tzinfo=ET)
        except Exception:
            continue
    return None


def model_run_dt(row: Dict[str, Any]) -> Optional[datetime]:
    raw = row.get("_model_run_dt_et")
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(str(raw))
        return dt.replace(tzinfo=ET) if dt.tzinfo is None else dt.astimezone(ET)
    except Exception:
        return None


def final_grade_key(row: Dict[str, Any]) -> str:
    return f"{row.get('date')}|{row.get('game_pk')}|{row.get('player_id')}|one_plus_hit"


def select_latest_eligible_projection(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    grouped: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if row.get("game_pk") and row.get("player_id"):
            grouped[final_grade_key(row)].append(row)
    selected: List[Dict[str, Any]] = []
    for _, group in grouped.items():
        eligible = []
        fallback = []
        for row in group:
            run_dt = model_run_dt(row)
            start_dt = parse_game_start_et(row)
            if run_dt is not None:
                fallback.append(row)
            if run_dt is not None and start_dt is not None and run_dt <= start_dt:
                eligible.append(row)
        if eligible:
            chosen = max(eligible, key=lambda r: model_run_dt(r) or datetime.min.replace(tzinfo=ET))
        elif fallback:
            chosen = max(fallback, key=lambda r: model_run_dt(r) or datetime.min.replace(tzinfo=ET))
            chosen["_selection_warning"] = "No pregame run time match found; selected latest available snapshot."
        else:
            chosen = group[-1]
            chosen["_selection_warning"] = "Missing run timestamp; selected last row encountered."
        selected.append(chosen)
    selected.sort(key=lambda r: (str(r.get("game_time_et") or ""), str(r.get("team") or ""), str(r.get("player") or "")))
    log(f"Selected {len(selected)} final projections to grade from {len(grouped)} player/game groups.")
    return selected


def fetch_game_feed(game_pk: int, cache: Dict[int, Dict[str, Any]]) -> Dict[str, Any]:
    if game_pk not in cache:
        cache[game_pk] = request_json(f"{MLB_LIVE_FEED_API}/game/{game_pk}/feed/live")
    return cache[game_pk]


def game_is_final(feed: Dict[str, Any]) -> Tuple[bool, str]:
    status = feed.get("gameData", {}).get("status", {}) or {}
    detailed = str(status.get("detailedState") or "")
    abstract = str(status.get("abstractGameState") or "")
    coded = str(status.get("codedGameState") or "")
    status_text = detailed or abstract or coded
    is_final = any(word in status_text.lower() for word in ("final", "game over", "completed")) or abstract.lower() == "final" or coded.upper() in {"F", "O"}
    return is_final, status_text


def extract_player_boxscore(feed: Dict[str, Any], player_id: int) -> Dict[str, Any]:
    box = feed.get("liveData", {}).get("boxscore", {}).get("teams", {}) or {}
    for side in ("away", "home"):
        players = (box.get(side) or {}).get("players", {}) or {}
        for _, pdata in players.items():
            person = pdata.get("person", {}) or {}
            if int(person.get("id") or -1) != int(player_id):
                continue
            batting = ((pdata.get("stats") or {}).get("batting") or {})
            return {
                "actual_hits": int(batting.get("hits") or 0),
                "actual_ab": int(batting.get("atBats") or 0),
                "actual_total_bases": int(batting.get("totalBases") or 0),
                "actual_rbi": int(batting.get("rbi") or 0),
                "actual_runs": int(batting.get("runs") or 0),
                "actual_walks": int(batting.get("baseOnBalls") or 0),
                "actual_strikeouts": int(batting.get("strikeOuts") or 0),
                "actual_plate_appearances": int(batting.get("plateAppearances") or 0),
                "boxscore_found": True,
            }
    return {"actual_hits": None, "actual_ab": None, "actual_total_bases": None, "actual_rbi": None, "actual_runs": None, "actual_walks": None, "actual_strikeouts": None, "actual_plate_appearances": None, "boxscore_found": False}


def bucket_hit_score(score: Any) -> str:
    try:
        s = float(score)
    except Exception:
        return "Unknown"
    if s >= 90:
        return "90+"
    if s >= 80:
        return "80-89"
    if s >= 70:
        return "70-79"
    if s >= 60:
        return "60-69"
    return "<60"


def bucket_confidence(score: Any) -> str:
    try:
        s = float(score)
    except Exception:
        return "Unknown"
    if s >= 80:
        return "A 80+"
    if s >= 70:
        return "B 70-79"
    if s >= 60:
        return "C 60-69"
    if s >= 45:
        return "D 45-59"
    return "F <45"


def bucket_lineup(row: Dict[str, Any]) -> str:
    if row.get("is_confirmed_starter"):
        try:
            spot_i = int(row.get("lineup_spot_num"))
        except Exception:
            return "Confirmed - spot unknown"
        if spot_i <= 4:
            return "Confirmed 1-4"
        if spot_i <= 9:
            return "Confirmed 5-9"
    return "Unconfirmed/Fallback"


def summarize_group(rows: List[Dict[str, Any]], field: str) -> List[Dict[str, Any]]:
    out = []
    groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[str(row.get(field) or "Unknown")].append(row)
    for bucket, bucket_rows in sorted(groups.items()):
        graded = [r for r in bucket_rows if r.get("grade_status") == "graded"]
        wins = sum(1 for r in graded if r.get("one_plus_hit_win") is True)
        total = len(graded)
        out.append({"bucket": bucket, "graded": total, "wins": wins, "hit_rate": round(wins / total, 4) if total else None})
    return out


def build_performance_summary(target_date: str, graded_rows: List[Dict[str, Any]], pending_count: int) -> Dict[str, Any]:
    graded = [r for r in graded_rows if r.get("grade_status") == "graded"]
    wins = sum(1 for r in graded if r.get("one_plus_hit_win") is True)
    losses = sum(1 for r in graded if r.get("one_plus_hit_win") is False)
    total = len(graded)
    return {
        "meta": {"summary_type": "postgame_grading", "target_date": target_date, "generated_at_et": now_et().strftime("%Y-%m-%d %I:%M:%S %p ET"), "rule": "Grades only the last eligible model snapshot where the player appeared before game start."},
        "overall": {"graded": total, "wins": wins, "losses": losses, "pending": pending_count, "one_plus_hit_rate": round(wins / total, 4) if total else None},
        "by_hit_score_bucket": summarize_group(graded_rows, "hit_score_bucket"),
        "by_confidence_bucket": summarize_group(graded_rows, "confidence_bucket"),
        "by_lineup_bucket": summarize_group(graded_rows, "lineup_bucket"),
    }


def grade_rows(target_date: str, force: bool = False) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    ensure_dirs()
    ledger: Dict[str, Any] = read_json(LEDGER_JSON, default={}) or {}
    selected_rows = select_latest_eligible_projection(load_snapshot_rows(target_date))
    feed_cache: Dict[int, Dict[str, Any]] = {}
    graded_output: List[Dict[str, Any]] = []
    pending_count = 0

    for row in selected_rows:
        key = final_grade_key(row)
        if key in ledger and not force:
            existing = dict(ledger[key])
            existing["grade_status"] = existing.get("grade_status") or "already_graded"
            graded_output.append(existing)
            continue
        try:
            game_pk = int(row.get("game_pk"))
            player_id = int(row.get("player_id"))
        except Exception:
            result = {**row, "final_grade_key": key, "market": "one_plus_hit", "grade_status": "skipped_missing_game_or_player_id", "graded_at_et": now_et().strftime("%Y-%m-%d %I:%M:%S %p ET")}
            graded_output.append(result)
            continue
        try:
            feed = fetch_game_feed(game_pk, feed_cache)
            is_final, status_text = game_is_final(feed)
            if not is_final:
                pending_count += 1
                graded_output.append({**row, "final_grade_key": key, "market": "one_plus_hit", "game_status": status_text, "grade_status": "pending_game_not_final", "graded_at_et": now_et().strftime("%Y-%m-%d %I:%M:%S %p ET")})
                continue
            actual = extract_player_boxscore(feed, player_id)
            actual_hits = actual.get("actual_hits")
            if actual_hits is None or not actual.get("boxscore_found"):
                pending_count += 1
                graded_output.append({**row, **actual, "final_grade_key": key, "market": "one_plus_hit", "game_status": status_text, "grade_status": "pending_player_not_found_in_boxscore", "graded_at_et": now_et().strftime("%Y-%m-%d %I:%M:%S %p ET")})
                continue
            one_plus_win = int(actual_hits) >= 1
            try:
                projected_hits_error = float(row.get("projected_hits") or 0) - float(actual_hits)
            except Exception:
                projected_hits_error = None
            result = {
                **row,
                **actual,
                "final_grade_key": key,
                "market": "one_plus_hit",
                "game_status": status_text,
                "grade_status": "graded",
                "graded_projection_run_id": row.get("_model_run_id"),
                "graded_projection_run_dt_et": row.get("_model_run_dt_et"),
                "one_plus_hit_win": one_plus_win,
                "result": "win" if one_plus_win else "loss",
                "projected_hits_error": projected_hits_error,
                "hit_score_bucket": bucket_hit_score(row.get("hit_score")),
                "confidence_bucket": bucket_confidence(row.get("confidence_score")),
                "lineup_bucket": bucket_lineup(row),
                "graded_at_et": now_et().strftime("%Y-%m-%d %I:%M:%S %p ET"),
            }
            ledger[key] = result
            graded_output.append(result)
        except Exception as exc:
            graded_output.append({**row, "final_grade_key": key, "market": "one_plus_hit", "grade_status": "error", "error": str(exc), "graded_at_et": now_et().strftime("%Y-%m-%d %I:%M:%S %p ET")})

    write_json(LEDGER_JSON, ledger)
    summary = build_performance_summary(target_date, graded_output, pending_count)
    write_json(PERFORMANCE_SUMMARY_JSON, summary)
    return graded_output, summary


def write_validation_rows_from_ledger() -> None:
    """
    Writes compact row-level graded history for the UI Validation Lab.
    The browser cannot browse GitHub folders, so the UI needs a known file
    under /data that GitHub Pages deploys.
    """
    ledger = read_json(LEDGER_JSON, default={}) or {}
    rows = []

    for item in ledger.values():
        if not isinstance(item, dict):
            continue
        if item.get("grade_status") != "graded":
            continue

        rows.append({
            "date": item.get("date"),
            "game_pk": item.get("game_pk"),
            "player_id": item.get("player_id"),
            "player": item.get("player"),
            "team": item.get("team"),
            "opp": item.get("opp"),
            "game_time_et": item.get("game_time_et"),
            "lineup_spot_num": item.get("lineup_spot_num"),
            "is_confirmed_starter": item.get("is_confirmed_starter"),
            "projected_ab": item.get("projected_ab"),
            "projected_hits": item.get("projected_hits"),
            "one_plus_hit_probability": item.get("one_plus_hit_probability"),
            "hit_score": item.get("hit_score"),
            "confidence_score": item.get("confidence_score"),
            "best_bet_tier": item.get("best_bet_tier"),
            "model_vs_market_avg_delta": item.get("model_vs_market_avg_delta"),
            "pitcher_season_baa_allowed_vs_batter_hand": item.get("pitcher_season_baa_allowed_vs_batter_hand"),
            "opp_pitcher_k_rate": item.get("opp_pitcher_k_rate"),
            "actual_hits": item.get("actual_hits"),
            "one_plus_hit_win": item.get("one_plus_hit_win"),
            "result": item.get("result"),
            "graded_projection_run_id": item.get("graded_projection_run_id"),
            "graded_at_et": item.get("graded_at_et"),
        })

    rows.sort(key=lambda r: (str(r.get("date") or ""), str(r.get("player") or "")))
    write_json(VALIDATION_ROWS_JSON, {
        "meta": {
            "generated_at_et": now_et().strftime("%Y-%m-%d %I:%M:%S %p ET"),
            "row_count": len(rows),
            "purpose": "Row-level graded history for PropHit Validation Lab.",
        },
        "rows": rows,
    })

    log(f"Updated UI validation rows: {VALIDATION_ROWS_JSON} ({len(rows)} graded rows)")


def write_grade_outputs(target_date: str, graded_rows: List[Dict[str, Any]], summary: Dict[str, Any]) -> None:
    ensure_dirs()
    grade_json = GRADE_DIR / f"prophit_grade_{target_date}.json"
    grade_xlsx = GRADE_DIR / f"prophit_grade_{target_date}.xlsx"
    summary_json = GRADE_DIR / f"prophit_grade_summary_{target_date}.json"
    write_json(grade_json, graded_rows)
    write_json(summary_json, summary)
    df = pd.DataFrame(graded_rows)
    preferred = ["date", "game_time_et", "game_pk", "team", "opp", "player", "player_id", "market", "graded_projection_run_id", "graded_projection_run_dt_et", "lineup_spot_num", "is_confirmed_starter", "projected_ab", "projected_hits", "one_plus_hit_probability", "fair_odds_american", "hit_score", "confidence_score", "best_bet_tier", "actual_hits", "actual_ab", "actual_total_bases", "one_plus_hit_win", "result", "projected_hits_error", "grade_status", "final_grade_key", "graded_at_et", "game_status", "_snapshot_file"]
    if not df.empty:
        df = df[[c for c in preferred if c in df.columns] + [c for c in df.columns if c not in preferred]]
    with pd.ExcelWriter(grade_xlsx, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="graded_rows", index=False)
        pd.DataFrame([summary.get("overall", {})]).to_excel(writer, sheet_name="overall", index=False)
        pd.DataFrame(summary.get("by_hit_score_bucket", [])).to_excel(writer, sheet_name="by_hit_score", index=False)
        pd.DataFrame(summary.get("by_confidence_bucket", [])).to_excel(writer, sheet_name="by_confidence", index=False)
        pd.DataFrame(summary.get("by_lineup_bucket", [])).to_excel(writer, sheet_name="by_lineup", index=False)
    log(f"Wrote grade JSON: {grade_json}")
    log(f"Wrote grade Excel: {grade_xlsx}")
    log(f"Wrote grade summary: {summary_json}")
    log(f"Updated UI performance summary: {PERFORMANCE_SUMMARY_JSON}")


def main() -> None:
    args = parse_args()
    target_date = args.date or default_target_date()
    log(f"Starting PropHit postgame grader for {target_date}")
    log(f"Force regrade: {args.force}")
    graded_rows, summary = grade_rows(target_date, force=args.force)
    write_grade_outputs(target_date, graded_rows, summary)
    write_validation_rows_from_ledger()
    overall = summary.get("overall", {})
    log(f"Finished grading. graded={overall.get('graded')} wins={overall.get('wins')} losses={overall.get('losses')} pending={overall.get('pending')} hit_rate={overall.get('one_plus_hit_rate')}")


if __name__ == "__main__":
    main()
