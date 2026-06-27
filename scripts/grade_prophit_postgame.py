#!/usr/bin/env python3
"""
PropHit Postgame Grader

This replacement grader is intentionally forgiving so GitHub Actions will not fail
because of small workflow argument differences.

It grades MLB 1+ hit predictions by:
- Finding your prediction JSON file automatically
- Pulling official MLB completed box scores for the selected date
- Matching players by name
- Writing graded results to:
    data/graded_results.json
    data/graded/YYYY-MM-DD.json

Supported workflow arguments:
    --date 2026-06-26
    --game-date 2026-06-26
    --grade-date 2026-06-26
    --force
    --force true
    --force True
    --force false
    --overwrite
    --force-grade
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import requests
except ImportError:
    print("ERROR: The requests package is required. Add requests to the workflow install step.")
    sys.exit(1)


ROOT = Path(__file__).resolve().parents[1]

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

OUTPUT_DIR = ROOT / "outputs" / "grades"
OUTPUT_RESULTS = OUTPUT_DIR / "prophit_grades.json"
OUTPUT_BY_DATE_DIR = OUTPUT_DIR

MLB_SCHEDULE_URL = "https://statsapi.mlb.com/api/v1/schedule"
MLB_BOXSCORE_URL = "https://statsapi.mlb.com/api/v1/game/{game_pk}/boxscore"


def log(message: str) -> None:
    print(message, flush=True)


def str_to_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value

    if value is None:
        return False

    return str(value).strip().lower() in ["1", "true", "yes", "y", "on"]


def parse_date(value: Optional[str]) -> str:
    if value:
        return value.strip()

    for key in ["INPUT_DATE", "DATE", "GRADE_DATE", "GAME_DATE"]:
        env_value = os.environ.get(key)
        if env_value:
            return env_value.strip()

    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def env_force(cli_force: bool) -> bool:
    if cli_force:
        return True

    for key in ["INPUT_FORCE", "FORCE", "GRADE_FORCE", "OVERWRITE"]:
        val = os.environ.get(key)
        if str_to_bool(val):
            return True

    return False


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
        with path.open("r", encoding="utf-8") as file:
            return json.load(file)
    except Exception as exc:
        log(f"WARNING: Could not read JSON from {path}: {exc}")
        return default


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as file:
        json.dump(data, file, indent=2, ensure_ascii=False)
        file.write("\n")


def find_prediction_file() -> Optional[Path]:
    for path in PREDICTION_CANDIDATES:
        if path.exists():
            return path

    likely_files: List[Path] = []

    for path in ROOT.rglob("*.json"):
        path_text = str(path).lower()
        name = path.name.lower()

        if ".git" in path_text:
            continue

        if "graded" in path_text:
            continue

        if any(word in name for word in ["prediction", "prophit", "model", "today"]):
            likely_files.append(path)

    if likely_files:
        likely_files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        return likely_files[0]

    return None


def flatten_predictions(raw: Any) -> List[Dict[str, Any]]:
    if isinstance(raw, list):
        return [item for item in raw if isinstance(item, dict)]

    if not isinstance(raw, dict):
        return []

    for key in [
        "predictions",
        "picks",
        "rows",
        "players",
        "data",
        "today",
        "model",
        "results",
    ]:
        value = raw.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]

    output: List[Dict[str, Any]] = []

    for value in raw.values():
        if isinstance(value, list):
            output.extend([item for item in value if isinstance(item, dict)])

    return output


def prediction_date_matches(prediction: Dict[str, Any], target_date: str) -> bool:
    date_keys = [
        "date",
        "game_date",
        "gameDate",
        "model_date",
        "modelDate",
        "run_date",
        "runDate",
        "prediction_date",
        "predictionDate",
    ]

    found_date = False

    for key in date_keys:
        value = prediction.get(key)

        if value:
            found_date = True

        if isinstance(value, str) and target_date in value:
            return True

    # If the prediction row has no date field, allow it.
    # This helps if your site only stores today's predictions without dates.
    if not found_date:
        return True

    return False


def get_player_name(prediction: Dict[str, Any]) -> str:
    for key in [
        "player",
        "player_name",
        "playerName",
        "name",
        "batter",
        "hitter",
        "fullName",
        "full_name",
    ]:
        value = prediction.get(key)

        if isinstance(value, str) and value.strip():
            return value.strip()

    return ""


def get_team(prediction: Dict[str, Any]) -> str:
    for key in [
        "team",
        "player_team",
        "playerTeam",
        "abbr",
        "team_abbr",
        "teamAbbr",
        "team_abbreviation",
        "teamAbbreviation",
    ]:
        value = prediction.get(key)

        if isinstance(value, str) and value.strip():
            return value.strip()

    return ""


def get_pick_line(prediction: Dict[str, Any]) -> float:
    for key in [
        "line",
        "hit_line",
        "hitLine",
        "hits_line",
        "hitsLine",
        "prop_line",
        "propLine",
    ]:
        value = prediction.get(key)

        if isinstance(value, (int, float)):
            return float(value)

        if isinstance(value, str):
            try:
                return float(value)
            except ValueError:
                continue

    # Default for 1+ hit prop.
    return 0.5


def fetch_schedule(target_date: str) -> List[int]:
    response = requests.get(
        MLB_SCHEDULE_URL,
        params={
            "sportId": 1,
            "date": target_date,
        },
        timeout=30,
    )

    response.raise_for_status()
    data = response.json()

    game_pks: List[int] = []

    for date_block in data.get("dates", []):
        for game in date_block.get("games", []):
            game_pk = game.get("gamePk")
            status = game.get("status", {})
            abstract_state = status.get("abstractGameState", "")
            detailed_state = status.get("detailedState", "")

            is_final = (
                abstract_state == "Final"
                or "Final" in detailed_state
                or "Completed" in detailed_state
            )

            if game_pk and is_final:
                game_pks.append(int(game_pk))

    return game_pks


def fetch_boxscore(game_pk: int) -> Dict[str, Any]:
    response = requests.get(
        MLB_BOXSCORE_URL.format(game_pk=game_pk),
        timeout=30,
    )

    response.raise_for_status()
    return response.json()


def build_hits_lookup(game_pks: List[int]) -> Dict[str, Dict[str, Any]]:
    lookup: Dict[str, Dict[str, Any]] = {}

    for game_pk in game_pks:
        boxscore = fetch_boxscore(game_pk)
        teams = boxscore.get("teams", {})

        for side in ["away", "home"]:
            team_data = teams.get(side, {})
            team_info = team_data.get("team", {})

            team_abbr = (
                team_info.get("abbreviation")
                or team_info.get("teamName")
                or team_info.get("name")
                or ""
            )

            players = team_data.get("players", {})

            for player_data in players.values():
                person = player_data.get("person", {})
                stats = player_data.get("stats", {})
                batting = stats.get("batting", {})

                player_name = person.get("fullName", "")

                if not player_name:
                    continue

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
    prediction: Dict[str, Any],
    hits_lookup: Dict[str, Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    player_name = get_player_name(prediction)

    if not player_name:
        return None

    key = normalize_name(player_name)

    if key in hits_lookup:
        return hits_lookup[key]

    prediction_parts = key.split()

    if len(prediction_parts) >= 2:
        prediction_first_last = f"{prediction_parts[0]} {prediction_parts[-1]}"

        for actual_key, actual in hits_lookup.items():
            actual_parts = actual_key.split()

            if len(actual_parts) >= 2:
                actual_first_last = f"{actual_parts[0]} {actual_parts[-1]}"

                if prediction_first_last == actual_first_last:
                    return actual

    return None


def make_result_id(prediction: Dict[str, Any], target_date: str) -> str:
    player = normalize_name(get_player_name(prediction)).replace(" ", "_")
    team = normalize_name(get_team(prediction)).replace(" ", "_")

    if not player:
        player = "unknown_player"

    if not team:
        team = "unknown_team"

    return f"{target_date}:{player}:{team}"


def grade_prediction(
    prediction: Dict[str, Any],
    actual: Dict[str, Any],
    target_date: str,
) -> Dict[str, Any]:
    line = get_pick_line(prediction)
    hits = int(actual.get("hits", 0))

    result = "HIT" if hits > line else "MISS"

    graded = dict(prediction)

    graded.update(
        {
            "grade_date": target_date,
            "graded_at": datetime.now(timezone.utc).isoformat(),
            "actual_player_name": actual.get("player_name", ""),
            "actual_hits": hits,
            "actual_at_bats": int(actual.get("at_bats", 0)),
            "actual_team": actual.get("team", ""),
            "game_pk": actual.get("game_pk"),
            "line": line,
            "result": result,
            "is_hit": result == "HIT",
            "grader_version": "replacement-1.1",
            "result_id": make_result_id(prediction, target_date),
        }
    )

    return graded


def summarize(results: List[Dict[str, Any]], skipped: List[Dict[str, Any]]) -> Dict[str, Any]:
    total = len(results)
    hits = sum(1 for row in results if row.get("result") == "HIT")
    misses = sum(1 for row in results if row.get("result") == "MISS")
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
        result_id = row.get("result_id")

        if result_id:
            by_id[result_id] = row

    for row in new_results:
        result_id = row.get("result_id")

        if not result_id:
            continue

        if result_id in by_id and not force:
            continue

        by_id[result_id] = row

    merged = list(by_id.values())

    merged.sort(
        key=lambda row: (
            str(row.get("grade_date", "")),
            str(row.get("player", row.get("player_name", row.get("playerName", "")))),
        )
    )

    return merged


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(add_help=True)

    parser.add_argument("--date", dest="date", default=None)
    parser.add_argument("--game-date", dest="game_date", default=None)
    parser.add_argument("--grade-date", dest="grade_date", default=None)

    # These accept both:
    #   --force
    #   --force True
    #   --force false
    parser.add_argument("--force", nargs="?", const="true", default="false")
    parser.add_argument("--force-grade", nargs="?", const="true", default="false")
    parser.add_argument("--overwrite", nargs="?", const="true", default="false")

    args, unknown = parser.parse_known_args()

    if unknown:
        log(f"WARNING: Ignoring unknown workflow arguments: {unknown}")

    return args


def main() -> int:
    args = parse_args()

    target_date = parse_date(args.date or args.game_date or args.grade_date)

    force = env_force(
        str_to_bool(args.force)
        or str_to_bool(args.force_grade)
        or str_to_bool(args.overwrite)
    )

    log(f"PropHit grader starting for {target_date}")
    log(f"Force mode: {force}")

    prediction_file = find_prediction_file()

    if not prediction_file:
        log("ERROR: Could not find a predictions JSON file.")
        log("Looked for:")

        for path in PREDICTION_CANDIDATES:
            try:
                log(f" - {path.relative_to(ROOT)}")
            except ValueError:
                log(f" - {path}")

        return 1

    log(f"Using prediction file: {prediction_file.relative_to(ROOT)}")

    raw_predictions = load_json(prediction_file, [])
    predictions = flatten_predictions(raw_predictions)

    if not predictions:
        log("ERROR: Prediction file was found, but no predictions could be read.")
        return 1

    predictions_for_date = [
        prediction
        for prediction in predictions
        if prediction_date_matches(prediction, target_date)
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

    for prediction in predictions_for_date:
        player_name = get_player_name(prediction)

        if not player_name:
            skipped.append(
                {
                    "reason": "missing_player_name",
                    "prediction": prediction,
                }
            )
            continue

        actual = find_actual_for_prediction(prediction, hits_lookup)

        if not actual:
            skipped.append(
                {
                    "reason": "player_not_found_in_completed_boxscores",
                    "player": player_name,
                    "team": get_team(prediction),
                    "prediction": prediction,
                }
            )
            continue

        graded_results.append(
            grade_prediction(
                prediction=prediction,
                actual=actual,
                target_date=target_date,
            )
        )

    existing_all = load_json(OUTPUT_RESULTS, [])

    if not isinstance(existing_all, list):
        existing_all = []

    merged_results = merge_results(
        existing=existing_all,
        new_results=graded_results,
        force=force,
    )

    by_date_output = {
        "date": target_date,
        "summary": summarize(graded_results, skipped),
        "results": graded_results,
        "skipped": skipped,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "prediction_file": str(prediction_file.relative_to(ROOT)),
    }

    save_json(OUTPUT_RESULTS, merged_results)
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
