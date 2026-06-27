from __future__ import annotations

import json
import shutil
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

GRADE_FILES = [
    Path("outputs/grades/prophit_grades.json"),
    Path("outputs/grades/graded_results.json"),
    Path("data/graded_results.json"),
    Path("data/prophit_grades.json"),
    Path("data/prophit_grade_history.json"),
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
    for key in ("grade_date", "date", "game_date", "gameDate", "prediction_date", "run_date"):
        value = row.get(key)
        if isinstance(value, str) and value.strip():
            return value[:10]
    return ""


def get_player_name(row: dict) -> str:
    for key in ("player", "player_name", "playerName", "name", "batter", "hitter", "fullName"):
        value = row.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def is_hit(row: dict) -> bool | None:
    if isinstance(row.get("is_hit"), bool):
        return row["is_hit"]

    result = str(row.get("result", "")).strip().upper()
    if result == "HIT":
        return True
    if result == "MISS":
        return False

    outcome = str(row.get("outcome", "")).strip().upper()
    if outcome == "HIT":
        return True
    if outcome == "MISS":
        return False

    return None


def load_all_grades() -> list[dict]:
    rows: list[dict] = []
    seen: set[str] = set()

    for path in GRADE_FILES:
        if not path.exists():
            continue

        payload = safe_load_json(path)
        if payload is None:
            continue

        for row in extract_grade_rows(payload):
            row_id = (
                row.get("result_id")
                or f"{get_grade_date(row)}:{get_player_name(row)}:{row.get('team', '')}:{row.get('game_pk', '')}"
            )

            if row_id in seen:
                continue

            seen.add(row_id)
            rows.append(row)

    for folder in GRADE_DIRS:
        if not folder.exists():
            continue

        for path in sorted(folder.glob("*.json")):
            if path.name in {"graded_ledger.json"}:
                continue

            payload = safe_load_json(path)
            if payload is None:
                continue

            for row in extract_grade_rows(payload):
                row_id = (
                    row.get("result_id")
                    or f"{get_grade_date(row)}:{get_player_name(row)}:{row.get('team', '')}:{row.get('game_pk', '')}"
                )

                if row_id in seen:
                    continue

                seen.add(row_id)
                rows.append(row)

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
        },
        "recent_10_days": {
            "days": len(recent_10),
            "graded": recent_total,
            "hits": recent_hits,
            "misses": recent_total - recent_hits,
            "hit_rate": recent_hit_rate,
        },
        "history": history,
        "last_updated": now_et(),
    }


def normalize_payload(payload, source_path: Path) -> dict:
    rows = extract_rows(payload)

    grade_rows = load_all_grades()
    grade_summary = build_performance_summary(grade_rows)

    if isinstance(payload, dict):
        generated_at = (
            payload.get("generated_at")
            or payload.get("run_timestamp")
            or payload.get("timestamp")
            or payload.get("updated_at")
            or now_et()
        )
        model_name = payload.get("model") or payload.get("model_name") or "PropHit live MLB hits model"

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

    return {
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


def find_best_source() -> Path:
    existing = [path for path in SOURCE_CANDIDATES if path.exists()]
    if not existing:
        raise SystemExit(
            "No model JSON source found. Expected one of: "
            + ", ".join(str(p) for p in SOURCE_CANDIDATES)
        )

    return max(existing, key=lambda p: p.stat().st_mtime)


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
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open("w", encoding="utf-8") as f:
            json.dump(live_payload, f, indent=2)
        print(f"Wrote {output}")

    print(f"Published {len(rows)} rows from {source}")
    print(f"Loaded grade rows: {live_payload['grade_file_count']}")
    print(f"All-time grade summary: {live_payload['performance']['grades']['all_time']}")
    print(f"Recent 10-day grade summary: {live_payload['performance']['grades']['recent_10_days']}")


if __name__ == "__main__":
    main()
