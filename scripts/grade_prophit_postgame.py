#!/usr/bin/env python3
"""
PropHit Postgame Grader

Purpose:
- Grades saved PropHit MLB hit predictions after games finish.
- Pulls official box score data from the public MLB Stats API.
- Adds/updates graded result files in your repo.

Expected usage from GitHub Actions:
    python scripts/grade_prophit_postgame.py --date 2026-06-26

Also supports:
    python scripts/grade_prophit_postgame.py --date 2026-06-26 --force

The script tries to find your prediction file automatically.
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests


ROOT = Path(__file__).resolve().parents[1]

# Places the script will look for predictions, in order.
PREDICTION_CANDIDATES = [
    ROOT / "data" / "prophit_predictions.json",
    ROOT / "data" / "predictions.json",
    ROOT / "data" / "today.json",
    ROOT / "data" / "model_output.json",
    ROOT / "prophit_predictions.json",
    ROOT / "predictions.json",
    ROOT / "today.json",
    ROOT / "model_output.json",
]

OUTPUT_DIR = ROOT / "data"
OUTPUT_RESULTS = OUTPUT_DIR / "graded_results.json"
OUTPUT_BY_DATE_DIR = OUTPUT_DIR / "graded"

MLB_SCHEDULE_URL = "https://statsapi.mlb.com/api/v1/schedule"
MLB_BOXSCORE_URL = "https://statsapi.mlb.com/api/v1/game/{game_pk}/boxscore"


def log(message: str) -> None:
    print(message, flush=True)


def normalize_name(name: str) -> str:
    if not name:
        return ""
    name = name.lower().strip()
    name = re.sub(r"[^\w\s]", "", name)
    name = re.sub(r"\s+", " ", name)
    return name


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:
        log(f"WARNING: Could not read JSON from {path}: {exc}")
        return default


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def find_prediction_file() -> Optional[Path]:
    for path in PREDICTION_CANDIDATES:
        if path.exists():
            return path

    # Fallback: look for likely json files.
    likely_files = []
    for path in ROOT.rglob("*.json"):
        name = path.name.lower()
        if any(word in name for word in ["prediction", "prophit", "model", "today"]):
            if "graded" not in str(path).lower() and "result" not in name:
                likely_files.append(path)

    if likely_files:
        likely_files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        return likely_files[0]

    return None


def parse_date(value: Optional[str]) -> str:
    if value:
        return value.strip()

    # GitHub Actions input/env fallbacks.
    for key in ["INPUT_DATE", "DATE", "GRADE_DATE"]:
        if os.environ.get(key):
            return os.environ[key].strip()

    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def env_force(cli_force: bool) -> bool:
    if cli_force:
        return True

    for key in ["INPUT_FORCE", "FORCE", "GRADE_FORCE"]:
        val = os.environ.get(key, "").strip().lower()
        if val in ["1", "true", "yes", "y"]:
            return True

    return False


def flatten_predictions(raw: Any) -> List[Dict[str, Any]]:
    """
    Accepts many possible shapes:
    - list of picks
    - {"predictions": [...]}
    - {"picks": [...]}
    - {"rows": [...]}
    - {"date": "...", "players": [...]}
    - {"2026-06-26": [...]}
    """
    if isinstance(raw, list):
        return [x for x in raw if isinstance(x, dict)]

    if not isinstance(raw, dict):
        return []

    for key in ["predictions", "picks", "rows", "players", "data", "today"]:
        if isinstance(raw.get(key), list):
            return [x for x in raw[key] if isinstance(x, dict)]

    # Date-keyed object.
    output = []
    for value in raw.values():
        if isinstance(value, list):
            output.extend([x for x in value if isinstance(x, dict)])
    return output


def prediction_date_matches(pred: Dict[str, Any], target_date: str) -> bool:
    date_keys = [
        "date",
        "game_date",
        "gameDate",
        "model_date",
        "modelDate",
        "run_date",
        "runDate",
    ]

    for key in date_keys:
        val = pred.get(key)
        if isinstance(val, str) and target_date in val:
            return True

    # If prediction has no date at all, allow it.
    if not any(pred.get(k) for k in date_keys):
        return True

    return False


def get_player_name(pred: Dict[str, Any]) -> str:
    for key in [
        "player",
        "player_name",
        "playerName",
        "name",
        "batter",
        "hitter",
        "fullName",
    ]:
        val = pred.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()

    return ""


def get_team(pred: Dict[str, Any]) -> str:
    for key in ["team", "player_team", "playerTeam", "abbr", "team_abbr", "teamAbbr"]:
        val = pred.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return ""


def get_pick_line(pred: Dict[str, Any]) -> float:
    """
    Hits picks are usually 0.5 for 1+ hit.
    If no line exists, default to 0.5.
    """
    for key in ["line", "hit_line", "hitLine", "hits_line", "hitsLine"]:
        val = pred.get(key)
        if isinstance(val, (int, float)):
            return float(val)
        if isinstance(val, str):
            try:
                return float(val)
            except ValueError:
                pass
    return 0.5


def fetch_schedule(target_date: str) -> List[int]:
    params = {
        "sportId": 1,
        "date": target_date,
    }

    response = requests.get(MLB_SCHEDULE_URL, params=params, timeout=30)
    response.raise_for_status()
    data = response.json()

    game_pks = []
    for date_block in data.get("dates", []):
        for game in date_block.get("games", []):
            game_pk = game.get("gamePk")
            status = game.get("status", {}).get("abstractGameState", "")
            detailed_state = game.get("status", {}).get("detailedState", "")

            # Grade final/completed games only.
            if game_pk and (
                status == "Final"
                or "Final" in detailed_state
                or "Completed" in detailed_state
            ):
                game_pks.append(int(game_pk))

    return game_pks


def fetch_boxscore(game_pk: int) -> Dict[str, Any]:
    url = MLB_BOXSCORE_URL.format(game_pk=game_pk)
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    return response.json()


def build_hits_lookup(game_pks: List[int]) -> Dict[str, Dict[str, Any]]:
    """
    Returns name-normalized player lookup:
    {
      "pete alonso": {
         "player_name": "Pete Alonso",
         "team": "NYM",
         "hits": 2,
         "at_bats": 4,
         "game_pk": 123456
      }
    }
    """
    lookup: Dict[str, Dict[str, Any]] = {}

    for game_pk in game_pks:
        box = fetch_boxscore(game_pk)
        teams = box.get("teams", {})

        for side in ["away", "home"]:
            team_data = teams.get(side, {})
            team_abbr = (
                team_data.get("team", {}).get("abbreviation")
                or team_data.get("team", {}).get("teamName")
                or ""
            )
            players = team_data.get("players", {})

            for player_obj in players.values():
                person = player_obj.get("person", {})
                stats = player_obj.get("stats", {})
                batting = stats.get("batting", {})

                player_name = person.get("fullName", "")
                if not player_name:
                    continue

                # Only hitters who appeared batting will have these.
                hits = batting.get("hits")
                at_bats = batting.get("atBats")

                if hits is None:
                    continue

                key = normalize_name(player_name)
                lookup[key] = {
                    "player_name": player_name,
                    "team": team_abbr,
                    "hits": int(hits or 0),
                    "at_bats": int(at_bats or 0),
                    "game_pk": game_pk,
                }

    return lookup


def find_actual_for_prediction(
    pred: Dict[str, Any],
    hits_lookup: Dict[str, Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    player_name = get_player_name(pred)
    if not player_name:
        return None

    key = normalize_name(player_name)
    if key in hits_lookup:
        return hits_lookup[key]

    # Light fuzzy fallback for middle initials / suffixes.
    pred_parts = key.split()
    if len(pred_parts) >= 2:
        first_last = f"{pred_parts[0]} {pred_parts[-1]}"
        for actual_key, actual in hits_lookup.items():
            actual_parts = actual_key.split()
            if len(actual_parts) >= 2:
                actual_first_last = f"{actual_parts[0]} {actual_parts[-1]}"
                if first_last == actual_first_last:
                    return actual

    return None


def make_result_id(pred: Dict[str, Any], target_date: str) -> str:
    player = normalize_name(get_player_name(pred)).replace(" ", "_")
    team = normalize_name(get_team(pred)).replace(" ", "_")
    return f"{target_date}:{player}:{team}"


def grade_prediction(
    pred: Dict[str, Any],
    actual: Dict[str, Any],
    target_date: str,
) -> Dict[str, Any]:
    line = get_pick_line(pred)
    hits = int(actual.get("hits", 0))
    result = "HIT" if hits > line else "MISS"

    graded = dict(pred)
    graded.update(
        {
            "grade_date": target_date,
            "graded_at": datetime.now(timezone.utc).isoformat(),
            "actual_hits": hits,
            "actual_at_bats": int(actual.get("at_bats", 0)),
            "actual_team": actual.get("team", ""),
            "game_pk": actual.get("game_pk"),
            "line": line,
            "result": result,
            "is_hit": result == "HIT",
            "grader_version": "replacement-1.0",
            "result_id": make_result_id(pred, target_date),
        }
    )

    return graded


def summarize(results: List[Dict[str, Any]], skipped: List[Dict[str, Any]]) -> Dict[str, Any]:
    total = len(results)
    hits = sum(1 for r in results if r.get("result") == "HIT")
    misses = sum(1 for r in results if r.get("result") == "MISS")

    hit_rate = round((hits / total) * 100, 2) if total else 0.0

    return {
        "graded": total,
        "hits": hits,
        "misses": misses,
        "hit_rate": hit_rate,
        "skipped": len(skipped),
    }


def merge_results(
    existing: List[Dict[str, Any]],
    new_results: List[Dict[str, Any]],
    force: bool,
) -> List[Dict[str, Any]]:
    by_id: Dict[str, Dict[str, Any]] = {}

    for row in existing:
        rid = row.get("result_id")
        if rid:
            by_id[rid] = row

    for row in new_results:
        rid = row.get("result_id")
        if not rid:
            continue

        if rid in by_id and not force:
            continue

        by_id[rid] = row

    return list(by_id.values())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", dest="date", default=None, help="Date to grade, YYYY-MM-DD")
    parser.add_argument("--force", action="store_true", help="Overwrite existing grades for date")
    args = parser.parse_args()

    target_date = parse_date(args.date)
    force = env_force(args.force)

    log(f"PropHit grader starting for {target_date}")
    log(f"Force mode: {force}")

    prediction_file = find_prediction_file()
    if not prediction_file:
        log("ERROR: Could not find a predictions JSON file.")
        log("Looked for:")
        for p in PREDICTION_CANDIDATES:
            log(f" - {p.relative_to(ROOT)}")
        return 1

    log(f"Using prediction file: {prediction_file.relative_to(ROOT)}")

    raw_predictions = load_json(prediction_file, [])
    predictions = flatten_predictions(raw_predictions)

    if not predictions:
        log("ERROR: Prediction file was found but no predictions could be read.")
        return 1

    predictions_for_date = [
        p for p in predictions if prediction_date_matches(p, target_date)
    ]

    if not predictions_for_date:
        log(f"WARNING: No predictions found for {target_date}. Nothing to grade.")
        return 0

    log(f"Predictions found for grading: {len(predictions_for_date)}")

    game_pks = fetch_schedule(target_date)
    if not game_pks:
        log(f"WARNING: No completed MLB games found for {target_date}. Nothing to grade.")
        return 0

    log(f"Completed MLB games found: {len(game_pks)}")

    hits_lookup = build_hits_lookup(game_pks)
    log(f"Players with box score batting data: {len(hits_lookup)}")

    graded_results: List[Dict[str, Any]] = []
    skipped: List[Dict[str, Any]] = []

    for pred in predictions_for_date:
        player_name = get_player_name(pred)

        if not player_name:
            skipped.append(
                {
                    "reason": "missing_player_name",
                    "prediction": pred,
                }
            )
            continue

        actual = find_actual_for_prediction(pred, hits_lookup)

        if not actual:
            skipped.append(
                {
                    "reason": "player_not_found_in_completed_boxscores",
                    "player": player_name,
                    "team": get_team(pred),
                    "prediction": pred,
                }
            )
            continue

        graded_results.append(grade_prediction(pred, actual, target_date))

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_BY_DATE_DIR.mkdir(parents=True, exist_ok=True)

    existing_all = load_json(OUTPUT_RESULTS, [])
    if not isinstance(existing_all, list):
        existing_all = []

    merged = merge_results(existing_all, graded_results, force=force)

    by_date_output = {
        "date": target_date,
        "summary": summarize(graded_results, skipped),
        "results": graded_results,
        "skipped": skipped,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    save_json(OUTPUT_RESULTS, merged)
    save_json(OUTPUT_BY_DATE_DIR / f"{target_date}.json", by_date_output)

    summary = by_date_output["summary"]

    log("")
    log("Grade complete.")
    log(f"Graded: {summary['graded']}")
    log(f"Hits: {summary['hits']}")
    log(f"Misses: {summary['misses']}")
    log(f"Hit rate: {summary['hit_rate']}%")
    log(f"Skipped: {summary['skipped']}")
    log("")
    log(f"Wrote: {OUTPUT_RESULTS.relative_to(ROOT)}")
    log(f"Wrote: {(OUTPUT_BY_DATE_DIR / f'{target_date}.json').relative_to(ROOT)}")

    # Do not fail just because some players were skipped.
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except requests.HTTPError as exc:
        log(f"ERROR: MLB API request failed: {exc}")
        raise SystemExit(1)
    except requests.RequestException as exc:
        log(f"ERROR: Network/API error: {exc}")
        raise SystemExit(1)
    except Exception as exc:
        log(f"ERROR: Unexpected grader failure: {exc}")
        raise SystemExit(1)
