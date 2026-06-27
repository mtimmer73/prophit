from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


SOURCE_CANDIDATES = [
    Path("data/prophit_latest.json"),
    Path("data/latest.json"),
    Path("data/prophit_all_players.json"),
    Path("outputs/prophit_latest.json"),
    Path("outputs/latest.json"),
    Path("docs/data/prophit_latest.json"),
    Path("proppulse-ui-app/public/data/prophit_latest.json"),
    Path("data/prophit_today.json"),
]

OUTPUT_PATHS = [
    Path("data/prophit_today.json"),
    Path("docs/data/prophit_today.json"),
    Path("proppulse-ui-app/public/data/prophit_today.json"),
]

VALIDATION_OUTPUT_PATHS = [
    Path("data/prophit_validation_rows.json"),
    Path("docs/data/prophit_validation_rows.json"),
    Path("proppulse-ui-app/public/data/prophit_validation_rows.json"),
]

PERFORMANCE_OUTPUT_PATHS = [
    Path("data/prophit_performance_summary.json"),
    Path("docs/data/prophit_performance_summary.json"),
    Path("proppulse-ui-app/public/data/prophit_performance_summary.json"),
]

GRADE_FILES = [
    Path("outputs/grades/prophit_grades.json"),
    Path("outputs/grades/graded_results.json"),
    Path("data/graded_results.json"),
    Path("data/prophit_grades.json"),
    Path("data/prophit_grade_history.json"),
    Path("data/prophit_validation_rows.json"),
]

GRADE_DIRS = [
    Path("outputs/grades"),
    Path("data/graded"),
]


def now_et() -> str:
    return datetime.now(ZoneInfo("America/New_York")).strftime("%Y-%m-%d %H:%M:%S ET")


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def safe_load_json(path: Path):
    try:
        return load_json(path)
    except Exception as exc:
        print(f"WARNING: Could not load {path}: {exc}")
        return None


def save_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
        f.write("\n")


def extract_rows(payload):
    if isinstance(payload, list):
        return payload

    if not isinstance(payload, dict):
        return []

    for key in ("players", "rows", "board", "data", "model_rows", "today"):
        value = payload.get(key)

        if isinstance(value, list):
            return value

        if isinstance(value, dict):
            return list(value.values())

    return []


def extract_grade_rows(payload):
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]

    if not isinstance(payload, dict):
        return []

    for key in ("results", "grades", "rows", "data", "history"):
        value = payload.get(key)

        if isinstance(value, list):
            return [row for row in value if isinstance(row, dict)]

        if isinstance(value, dict):
            return [row for row in value.values() if isinstance(row, dict)]

    return []


def get_grade_date(row: dict) -> str:
    for key in (
        "grade_date",
        "date",
        "game_date",
        "gameDate",
        "prediction_date",
        "predictionDate",
        "run_date",
        "runDate",
    ):
        value = row.get(key)
        if isinstance(value, str) and value.strip():
            return value[:10]

    return ""


def get_player_name(row: dict) -> str:
    for key in (
        "player",
        "player_name",
        "playerName",
        "name",
        "batter",
        "hitter",
        "fullName",
        "full_name",
    ):
        value = row.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    return ""


def get_team(row: dict) -> str:
    for key in (
        "team",
        "player_team",
        "playerTeam",
        "actual_team",
        "team_abbr",
        "teamAbbr",
    ):
        value = row.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    return ""


def is_hit(row: dict) -> bool | None:
    if isinstance(row.get("one_plus_hit_win"), bool):
        return row["one_plus_hit_win"]

    if isinstance(row.get("is_hit"), bool):
        return row["is_hit"]

    for key in (
        "result",
        "outcome",
        "hit_result",
        "grade",
        "status",
    ):
        value = row.get(key)
        if value is None:
            continue

        text = str(value).strip().upper()

        if text in {"HIT", "WIN", "WON", "TRUE", "YES", "Y", "1"}:
            return True

        if text in {"MISS", "LOSS", "LOST", "FALSE", "NO", "N", "0"}:
            return False

    for key in (
        "actual_hits",
        "hits_actual",
        "box_score_hits",
        "result_hits",
        "postgame_hits",
    ):
        value = row.get(key)

        if value is None:
            continue

        try:
            return float(value) >= 1
        except Exception:
            continue

    return None


def normalize_grade_row(row: dict) -> dict:
    """
    Keeps all existing row fields, but adds compatibility fields that index.html expects.
    """
    cleaned = dict(row)

    hit_value = is_hit(cleaned)
    player = get_player_name(cleaned)
    grade_date = get_grade_date(cleaned)

    if player and not cleaned.get("player"):
        cleaned["player"] = player

    if player and not cleaned.get("player_name"):
        cleaned["player_name"] = player

    if grade_date and not cleaned.get("date"):
        cleaned["date"] = grade_date

    if grade_date and not cleaned.get("grade_date"):
        cleaned["grade_date"] = grade_date

    if hit_value is not None:
        cleaned["one_plus_hit_win"] = hit_value
        cleaned["is_hit"] = hit_value
        cleaned["actual_hit"] = hit_value

        if "result" not in cleaned:
            cleaned["result"] = "HIT" if hit_value else "MISS"

    if "actual_hits" in cleaned and "postgame_hits" not in cleaned:
        cleaned["postgame_hits"] = cleaned["actual_hits"]

    if "line" not in cleaned:
        cleaned["line"] = 0.5

    if "result_id" not in cleaned:
        cleaned["result_id"] = (
            f"{grade_date}:{player}:{get_team(cleaned)}:{cleaned.get('game_pk', '')}"
        )

    return cleaned


def load_all_grades() -> list[dict]:
    rows: list[dict] = []
    seen: set[str] = set()

    def add_rows_from_payload(payload, source_name: str) -> None:
        for raw_row in extract_grade_rows(payload):
            row = normalize_grade_row(raw_row)

            player = get_player_name(row)
            hit_value = is_hit(row)

            if not player:
                continue

            if hit_value is None:
                continue

            row_id = (
                row.get("result_id")
                or f"{get_grade_date(row)}:{player}:{get_team(row)}:{row.get('game_pk', '')}"
            )

            # Add source name to make debugging easier.
            row["_grade_source"] = source_name

            if row_id in seen:
                continue

            seen.add(row_id)
            rows.append(row)

    for path in GRADE_FILES:
        if not path.exists():
            continue

        payload = safe_load_json(path)
        if payload is None:
            continue

        add_rows_from_payload(payload, str(path))

    for folder in GRADE_DIRS:
        if not folder.exists():
            continue

        for path in sorted(folder.glob("*.json")):
            lower_name = path.name.lower()

            if "ledger" in lower_name:
                continue

            payload = safe_load_json(path)
            if payload is None:
                continue

            add_rows_from_payload(payload, str(path))

    rows.sort(
        key=lambda row: (
            get_grade_date(row),
            get_player_name(row).lower(),
            str(row.get("game_pk", "")),
        )
    )

    return rows


def build_performance_summary(grade_rows: list[dict]) -> dict:
    graded = []

    for row in grade_rows:
        hit_value = is_hit(row)
        if hit_value is not None:
            graded.append((row, hit_value))

    total = len(graded)
    hits = sum(1 for _, hit_value in graded if hit_value)
    misses = total - hits
    hit_rate = round((hits / total) * 100, 2) if total else 0.0

    by_date: dict[str, dict] = {}

    for row, hit_value in graded:
        grade_date = get_grade_date(row) or "unknown"

        if grade_date not in by_date:
            by_date[grade_date] = {
                "date": grade_date,
                "graded": 0,
                "hits": 0,
                "misses": 0,
                "hit_rate": 0.0,
            }

        by_date[grade_date]["graded"] += 1

        if hit_value:
            by_date[grade_date]["hits"] += 1
        else:
            by_date[grade_date]["misses"] += 1

    history = []

    for item in sorted(by_date.values(), key=lambda x: x["date"]):
        if item["graded"]:
            item["hit_rate"] = round((item["hits"] / item["graded"]) * 100, 2)

        history.append(item)

    recent_10 = history[-10:]

    recent_total = sum(item["graded"] for item in recent_10)
    recent_hits = sum(item["hits"] for item in recent_10)
    recent_hit_rate = round((recent_hits / recent_total) * 100, 2) if recent_total else 0.0

    return {
        "all_time": {
            "graded": total,
            "hits": hits,
            "misses": misses,
            "hit_rate": hit_rate,
            "one_plus_hit_rate": round(hit_rate / 100, 4) if total else None,
        },
        "recent_10_days": {
            "days": len(recent_10),
            "graded": recent_total,
            "hits": recent_hits,
            "misses": recent_total - recent_hits,
            "hit_rate": recent_hit_rate,
            "one_plus_hit_rate": round(recent_hit_rate / 100, 4) if recent_total else None,
        },
        "history": history,
        "last_updated": now_et(),
    }


def write_validation_rows(grade_rows: list[dict]) -> None:
    """
    This is the critical compatibility file.

    index.html loads ./data/prophit_validation_rows.json, then uses validationRows
    for Validation Lab, Correlation Board, and Best Player-Specific Correlations.
    """
    payload = {
        "updated_at": now_et(),
        "source": "publish_prophit_live_json.py",
        "row_count": len(grade_rows),
        "rows": grade_rows,
    }

    for output in VALIDATION_OUTPUT_PATHS:
        save_json(output, payload)
        print(f"Wrote validation rows: {output} ({len(grade_rows)} rows)")


def write_performance_summary(grade_summary: dict) -> None:
    payload = {
        "updated_at": now_et(),
        "source": "publish_prophit_live_json.py",
        **grade_summary,
    }

    for output in PERFORMANCE_OUTPUT_PATHS:
        save_json(output, payload)
        print(f"Wrote performance summary: {output}")


def normalize_payload(payload, source_path: Path) -> dict:
    rows = extract_rows(payload)

    grade_rows = load_all_grades()
    grade_summary = build_performance_summary(grade_rows)

    write_validation_rows(grade_rows)
    write_performance_summary(grade_summary)

    if isinstance(payload, dict):
        generated_at = (
            payload.get("generated_at")
            or payload.get("run_timestamp")
            or payload.get("timestamp")
            or payload.get("updated_at")
            or payload.get("meta", {}).get("last_model_run_et")
            or now_et()
        )

        model_name = (
            payload.get("model")
            or payload.get("model_name")
            or payload.get("meta", {}).get("model_name")
            or "PropHit live MLB hits model"
        )

        existing_performance = payload.get("performance", {})
        existing_history = payload.get("history", [])
    else:
        generated_at = now_et()
        model_name = "PropHit live MLB hits model"
        existing_performance = {}
        existing_history = []

    performance = {
        **existing_performance,
        "grades": grade_summary,
    }

    history = grade_summary.get("history") or existing_history

    live_payload = {
        "generated_at": generated_at,
        "published_at": now_et(),
        "model": model_name,
        "mode": "live_json",
        "source_file": str(source_path),
        "row_count": len(rows),
        "players": rows,
        "performance": performance,
        "history": history,
        "grade_file_count": len(grade_rows),
    }

    # Preserve any existing model-generated sections.
    passthrough_keys = [
        "meta",
        "schema",
        "summary",
        "top_plays",
        "topPlays",
        "correlations",
        "correlation_board",
        "correlationBoard",
        "top_correlations",
        "topCorrelations",
        "player_specific_correlations",
        "playerSpecificCorrelations",
        "player_specific_signals",
        "playerSpecificSignals",
        "playerSignals",
        "same_player_signals",
        "samePlayerSignals",
        "signals",
    ]

    if isinstance(payload, dict):
        for key in passthrough_keys:
            if key in payload and key not in live_payload:
                live_payload[key] = payload[key]
                print(f"Preserved field from source JSON: {key}")

    return live_payload


def find_best_source() -> Path:
    existing = [path for path in SOURCE_CANDIDATES if path.exists()]

    if not existing:
        raise SystemExit(
            "No model JSON source found. Expected one of: "
            + ", ".join(str(path) for path in SOURCE_CANDIDATES)
        )

    return max(existing, key=lambda path: path.stat().st_mtime)


def main() -> None:
    source = find_best_source()
    print(f"Using source JSON: {source}")

    payload = load_json(source)
    live_payload = normalize_payload(payload, source)

    rows = live_payload["players"]

    if not isinstance(rows, list):
        raise SystemExit("Live payload players must be a list.")

    if len(rows) == 0:
        print("WARNING: Source JSON produced 0 rows. Publishing anyway so UI does not 404.")

    for output in OUTPUT_PATHS:
        save_json(output, live_payload)
        print(f"Wrote {output}")

    print(f"Published {len(rows)} rows from {source}")
    print(f"Loaded grade rows: {live_payload['grade_file_count']}")
    print(f"All-time grade summary: {live_payload['performance']['grades']['all_time']}")
    print(f"Recent 10-day grade summary: {live_payload['performance']['grades']['recent_10_days']}")


if __name__ == "__main__":
    main()
