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


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


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


def normalize_payload(payload, source_path: Path) -> dict:
    rows = extract_rows(payload)

    if isinstance(payload, dict):
        generated_at = (
            payload.get("generated_at")
            or payload.get("run_timestamp")
            or payload.get("timestamp")
            or payload.get("updated_at")
            or datetime.now(ZoneInfo("America/New_York")).strftime("%Y-%m-%d %H:%M:%S ET")
        )
        model_name = payload.get("model") or payload.get("model_name") or "PropHit live MLB hits model"
        performance = payload.get("performance", {})
        history = payload.get("history", [])
    else:
        generated_at = datetime.now(ZoneInfo("America/New_York")).strftime("%Y-%m-%d %H:%M:%S ET")
        model_name = "PropHit live MLB hits model"
        performance = {}
        history = []

    return {
        "generated_at": generated_at,
        "published_at": datetime.now(ZoneInfo("America/New_York")).strftime("%Y-%m-%d %H:%M:%S ET"),
        "model": model_name,
        "mode": "live_json",
        "source_file": str(source_path),
        "row_count": len(rows),
        "players": rows,
        "performance": performance,
        "history": history,
    }


def find_best_source() -> Path:
    existing = [path for path in SOURCE_CANDIDATES if path.exists()]
    if not existing:
        raise SystemExit(
            "No model JSON source found. Expected one of: "
            + ", ".join(str(p) for p in SOURCE_CANDIDATES)
        )

    # Use most recently modified candidate so the UI receives the newest model output.
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


if __name__ == "__main__":
    main()
