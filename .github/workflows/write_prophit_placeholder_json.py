from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import json

output_path = Path("docs/data/prophit_today.json")
output_path.parent.mkdir(parents=True, exist_ok=True)

payload = {
    "generated_at": datetime.now(ZoneInfo("America/New_York")).strftime("%Y-%m-%d %H:%M:%S ET"),
    "model": "PropHit live MLB hits model",
    "mode": "placeholder_until_model_script_runs",
    "note": "Placeholder JSON created by GitHub Action because no model script was found. Replace this by adding your real model script and writing rows to docs/data/prophit_today.json.",
    "players": [
        {
            "player": "Live JSON connected",
            "team": "TEST",
            "opp": "Model script needed",
            "position": "—",
            "bats": "—",
            "pitcher": "—",
            "pitcher_hand": "—",
            "batting_order": 1,
            "hit_score": 70,
            "hit_prob": 58,
            "proj_hits": 1.20,
            "fair_odds": -120,
            "confidence": 60,
            "delta_avg": 0,
            "model_status": "WATCH",
            "game_time": "TBD",
            "split_ba": "—",
            "pitcher_baa": "—",
            "last30_one_hit_rate": 58,
            "reliability": "Placeholder",
            "positives": "The site is now reading live JSON.",
            "risks": "Replace placeholder with real MLB model output."
        }
    ],
    "performance": {
        "status": "placeholder",
        "message": "No graded ledger connected yet."
    },
    "history": []
}

with output_path.open("w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2)

print(f"Wrote {output_path}")
