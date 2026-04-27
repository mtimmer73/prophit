import json
from pathlib import Path
from typing import List, Dict, Any, Optional

import pandas as pd

# =========================================================
# PROPPULSE UI JSON CONVERTER (AUTO-WRITE VERSION)
#
# What it does:
# - reads your latest hitter / pitcher / market intel workbooks
# - converts them into dashboard-ready JSON
# - writes JSON locally
# - writes JSON directly into your React app public folder
#
# IMPORTANT:
# Update UI_PUBLIC_PATH below to your actual React app public folder.
# Example:
#   C:\Users\Timmermann\Desktop\proppulse-ui-app\public
# =========================================================

UI_PUBLIC_PATH = Path(r"C:\Users\Timmermann\Desktop\proppulse-ui-app\public")
LOCAL_OUTPUT_PATH = Path(".")

HITTER_PATTERNS = [
    "prop_pulse_master_recommended_*.xlsx",
    "prop_pulse_master_confidence_timestamped_*.xlsx",
    "prop_pulse_master_confidence_*.xlsx",
]

PITCHER_PATTERNS = [
    "prop_pulse_pitcher_ensemble_recommended_*.xlsx",
    "prop_pulse_pitcher_ensemble_*.xlsx",
]

MARKET_INTEL_PATTERNS = [
    "prop_pulse_market_intel_matched.xlsx",
    "prop_pulse_market_intel_matched_*.xlsx",
]


def first_existing(patterns: List[str]) -> Optional[Path]:
    for pattern in patterns:
        matches = sorted(Path(".").glob(pattern), key=lambda p: p.stat().st_mtime, reverse=True)
        if matches:
            return matches[0]
    return None


def safe_float(value, default=0.0) -> float:
    try:
        if value in (None, "", "--", "-", ".---"):
            return default
        return float(value)
    except Exception:
        return default


def safe_int(value, default=0) -> int:
    try:
        return int(round(safe_float(value, default)))
    except Exception:
        return default


def safe_str(value, default="") -> str:
    if value is None:
        return default
    return str(value)


def yes_no_from_any(value) -> str:
    s = safe_str(value).strip().lower()
    if s in {"true", "yes", "y", "1"}:
        return "Yes"
    if s in {"false", "no", "n", "0"}:
        return "No"
    return safe_str(value) if safe_str(value) else "No"


def read_hitter_rows(path: Path) -> List[Dict[str, Any]]:
    df = pd.read_excel(path, sheet_name="Consensus").copy()
    rows = []
    for i, row in df.iterrows():
        rows.append({
            "id": i + 1,
            "player": safe_str(row.get("Player")),
            "team": safe_str(row.get("Team")),
            "opponent": safe_str(row.get("Opponent")),
            "bestProp": safe_str(row.get("Best Consensus Prop")),
            "recommended": yes_no_from_any(row.get("Recommended Play")),
            "playGrade": safe_str(row.get("Play Grade"), "Pass"),
            "confidence": safe_int(row.get("Consensus Confidence Score")),
            "confidenceTier": safe_str(row.get("Confidence Tier")),
            "agreement": safe_str(row.get("Consensus Label")),
            "splitPA": safe_float(row.get("Consensus Split PA")),
            "seasonPA": safe_float(row.get("Consensus Season PA")),
            "hitProb": round(safe_float(row.get("Consensus Hit Prob")), 3),
            "projTB": round(safe_float(row.get("Consensus Projected TB")), 3),
            "projHR": round(safe_float(row.get("Consensus Projected HR")), 3),
            "projRuns": round(safe_float(row.get("Consensus Projected Runs")), 3),
            "projRBI": round(safe_float(row.get("Consensus Projected RBI")), 3),
            "why": safe_str(row.get("Why Flagged")),
        })
    return rows


def read_pitcher_rows(path: Path) -> List[Dict[str, Any]]:
    df = pd.read_excel(path, sheet_name="Ensemble").copy()
    rows = []
    for i, row in df.iterrows():
        rows.append({
            "id": i + 1,
            "pitcher": safe_str(row.get("Pitcher")),
            "team": safe_str(row.get("Team")),
            "opponent": safe_str(row.get("Opponent")),
            "edgeType": safe_str(row.get("Primary Edge Type")),
            "recommended": yes_no_from_any(row.get("Recommended Pitcher Play")),
            "playGrade": safe_str(row.get("Pitcher Play Grade"), "Pass"),
            "confidence": safe_int(row.get("Consensus Confidence")),
            "strikeouts": round(safe_float(row.get("Ensemble Projected Strikeouts")), 3),
            "earnedRuns": round(safe_float(row.get("Ensemble Projected Earned Runs")), 3),
            "outs": round(safe_float(row.get("Ensemble Projected Total Outs")), 3),
            "walks": round(safe_float(row.get("Ensemble Projected Walks Allowed")), 3),
            "hitsAllowed": round(safe_float(row.get("Ensemble Projected Hits Allowed")), 3),
            "why": safe_str(row.get("Why Flagged")),
        })
    return rows


def read_market_rows(path: Path) -> List[Dict[str, Any]]:
    df = pd.read_excel(path, sheet_name="Matched Picks").copy()
    rows = []
    for i, row in df.iterrows():
        prop = f'{safe_str(row.get("prop_type"))} {safe_str(row.get("direction"))} {safe_str(row.get("line"))}'.strip()
        rows.append({
            "id": i + 1,
            "source": safe_str(row.get("source")),
            "player": safe_str(row.get("player")),
            "prop": prop,
            "modelVerdict": safe_str(row.get("market_vs_model"), "Unknown"),
            "shortlisted": yes_no_from_any(row.get("recommended_by_us")) == "Yes",
        })
    return rows


def write_json(path: Path, payload: Any):
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def write_all_outputs(base_path: Path, hitters, pitchers, market, meta):
    base_path.mkdir(parents=True, exist_ok=True)
    write_json(base_path / "ui_hitters.json", hitters)
    write_json(base_path / "ui_pitchers.json", pitchers)
    write_json(base_path / "ui_market_intel.json", market)
    write_json(
        base_path / "ui_dashboard_payload.json",
        {
            "hitters": hitters,
            "pitchers": pitchers,
            "marketIntel": market,
            "meta": meta,
        },
    )


def main():
    hitter_file = first_existing(HITTER_PATTERNS)
    pitcher_file = first_existing(PITCHER_PATTERNS)
    market_file = first_existing(MARKET_INTEL_PATTERNS)

    hitters = read_hitter_rows(hitter_file) if hitter_file else []
    pitchers = read_pitcher_rows(pitcher_file) if pitcher_file else []
    market = read_market_rows(market_file) if market_file else []

    meta = {
        "hitter_file": hitter_file.name if hitter_file else "",
        "pitcher_file": pitcher_file.name if pitcher_file else "",
        "market_file": market_file.name if market_file else "",
    }

    write_all_outputs(LOCAL_OUTPUT_PATH, hitters, pitchers, market, meta)
    write_all_outputs(UI_PUBLIC_PATH, hitters, pitchers, market, meta)

    print("✅ Wrote local JSON files:")
    print(f"   {LOCAL_OUTPUT_PATH / 'ui_hitters.json'}")
    print(f"   {LOCAL_OUTPUT_PATH / 'ui_pitchers.json'}")
    print(f"   {LOCAL_OUTPUT_PATH / 'ui_market_intel.json'}")
    print(f"   {LOCAL_OUTPUT_PATH / 'ui_dashboard_payload.json'}")
    print("")
    print("✅ Wrote UI public JSON files:")
    print(f"   {UI_PUBLIC_PATH / 'ui_hitters.json'}")
    print(f"   {UI_PUBLIC_PATH / 'ui_pitchers.json'}")
    print(f"   {UI_PUBLIC_PATH / 'ui_market_intel.json'}")
    print(f"   {UI_PUBLIC_PATH / 'ui_dashboard_payload.json'}")
    print("")
    print(f"Hitter source:  {hitter_file.name if hitter_file else 'not found'}")
    print(f"Pitcher source: {pitcher_file.name if pitcher_file else 'not found'}")
    print(f"Market source:  {market_file.name if market_file else 'not found'}")
    print("")
    print(f"Hitters rows: {len(hitters)}")
    print(f"Pitchers rows: {len(pitchers)}")
    print(f"Market rows: {len(market)}")


if __name__ == "__main__":
    main()
