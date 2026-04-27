import math
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional

import pandas as pd
import requests

# ============================================================
# PropPulse MLB Edge Model v1
#
# Purpose:
# - load your V6 projection file
# - pull MLB player props from The Odds API
# - match sportsbook players to model players
# - calculate line, price, edge, model probability, and EV
# - export Excel + JSON
#
# Notes:
# - keep this separate from v6
# - v6 = projection engine
# - edge_v1 = sportsbook layer
# ============================================================

# -----------------------------
# User settings
# -----------------------------
INPUT_PROJECTION_FILE = "proppulse_mlb_output_v6.xlsx"
OUTPUT_EDGE_FILE = "proppulse_mlb_edges_v1.xlsx"
OUTPUT_JSON_FILE = "proppulse_mlb_edges_v1.json"

ODDS_API_KEY = "PASTE_YOUR_REAL_ODDS_API_KEY_HERE"

SPORT = "baseball_mlb"
REGIONS = "us"
ODDS_FORMAT = "american"
DATE_FORMAT = "iso"

# Optional date filters for events. Leave as None unless needed.
COMMENCE_TIME_FROM = None
COMMENCE_TIME_TO = None

PAUSE_BETWEEN_EVENT_CALLS = 0.25
AUTO_OPEN_EXCEL = True
CREATE_DESKTOP_RUNNER = True
SAVE_JSON_EXPORT = True

# Books to request
BOOKMAKERS = [
    "draftkings",
    "fanduel",
    "betmgm",
    "espnbet",
    "betrivers",
]

# Markets to request
MARKETS = [
    "batter_hits",
    "batter_total_bases",
    "batter_home_runs",
    "batter_runs_scored",
    "batter_rbis",
    "batter_stolen_bases",
]

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "PropPulse-Edge-v1/1.2"})


# ============================================================
# Helpers
# ============================================================

def nz(value, default=0.0):
    try:
        if value is None:
            return default
        if pd.isna(value):
            return default
        return float(value)
    except Exception:
        return default


def normalize_name(name: str) -> str:
    return " ".join(
        str(name)
        .strip()
        .lower()
        .replace(".", "")
        .replace("'", "")
        .split()
    )


def compact_name_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", normalize_name(name))


def first_last_key(name: str) -> str:
    parts = normalize_name(name).split()
    if len(parts) >= 2:
        return f"{parts[0][0]}_{parts[-1]}"
    return compact_name_key(name)


def american_to_implied_prob(price: Optional[float]) -> Optional[float]:
    if price is None or pd.isna(price):
        return None
    price = float(price)
    if price > 0:
        return round(100.0 / (price + 100.0), 4)
    if price < 0:
        return round(abs(price) / (abs(price) + 100.0), 4)
    return None


def probability_over_poisson(expected: float, line: Optional[float]) -> Optional[float]:
    if line is None or pd.isna(line):
        return None

    threshold = int(math.floor(float(line)))
    lam = max(0.0001, float(expected))

    cdf = 0.0
    for k in range(threshold + 1):
        cdf += math.exp(-lam) * (lam ** k) / math.factorial(k)

    return round(1.0 - cdf, 4)


def expected_value_from_american(prob: Optional[float], price: Optional[float]) -> Optional[float]:
    if prob is None or price is None or pd.isna(prob) or pd.isna(price):
        return None

    prob = float(prob)
    price = float(price)

    if price > 0:
        payout = price / 100.0
    else:
        payout = 100.0 / abs(price)

    return round(prob * payout - (1 - prob), 4)


def get_script_directory() -> Path:
    try:
        return Path(__file__).resolve().parent
    except NameError:
        return Path.cwd()


def get_input_path(filename: str) -> Path:
    return get_script_directory() / filename


def open_file_with_default_app(file_path: Path) -> None:
    if not file_path.exists():
        return

    try:
        if sys.platform.startswith("win"):
            os.startfile(str(file_path))
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(file_path)])
        else:
            subprocess.Popen(["xdg-open", str(file_path)])
    except Exception as e:
        print(f"Could not auto-open file: {e}")


def create_windows_runner_bat(script_path: Path) -> Optional[Path]:
    if not CREATE_DESKTOP_RUNNER:
        return None

    desktop = Path.home() / "Desktop"
    if not desktop.exists():
        return None

    runner_path = desktop / "Run_PropPulse_Edge_V1.bat"
    bat_contents = f'''@echo off
cd /d "{script_path.parent}"
python "{script_path.name}"
if errorlevel 1 (
  echo.
  echo Python command failed. Trying py launcher...
  py "{script_path.name}"
)
echo.
echo Done. Press any key to close.
pause >nul
'''
    try:
        runner_path.write_text(bat_contents, encoding="utf-8")
        return runner_path
    except Exception as e:
        print(f"Could not create desktop runner: {e}")
        return None


# ============================================================
# File loading
# ============================================================

def load_projection_file(input_path: Path) -> pd.DataFrame:
    if not input_path.exists():
        raise FileNotFoundError(f"Projection file not found: {input_path}")

    if input_path.suffix.lower() == ".csv":
        df = pd.read_csv(input_path)
    else:
        df = pd.read_excel(input_path, sheet_name="Model")

    if df.empty:
        raise ValueError("Projection file loaded but contained no rows.")

    if "player" not in df.columns:
        raise ValueError("Projection file must contain a 'player' column.")

    df["player_key"] = df["player"].map(normalize_name)
    df["player_compact_key"] = df["player"].map(compact_name_key)
    df["player_first_last_key"] = df["player"].map(first_last_key)

    return df


# ============================================================
# Odds API
# ============================================================

def validate_api_key() -> None:
    if not ODDS_API_KEY or ODDS_API_KEY == "PASTE_YOUR_REAL_ODDS_API_KEY_HERE":
        raise ValueError("Please paste your real Odds API key into ODDS_API_KEY.")


def get_events(api_key: str) -> List[dict]:
    url = f"https://api.the-odds-api.com/v4/sports/{SPORT}/events"
    params = {
        "apiKey": api_key,
        "dateFormat": DATE_FORMAT,
    }

    if COMMENCE_TIME_FROM:
        params["commenceTimeFrom"] = COMMENCE_TIME_FROM
    if COMMENCE_TIME_TO:
        params["commenceTimeTo"] = COMMENCE_TIME_TO

    r = SESSION.get(url, params=params, timeout=45)
    r.raise_for_status()
    return r.json()


def get_event_odds(api_key: str, event_id: str) -> dict:
    url = f"https://api.the-odds-api.com/v4/sports/{SPORT}/events/{event_id}/odds"
    params = {
        "apiKey": api_key,
        "regions": REGIONS,
        "markets": ",".join(MARKETS),
        "oddsFormat": ODDS_FORMAT,
        "dateFormat": DATE_FORMAT,
        "bookmakers": ",".join(BOOKMAKERS),
    }

    r = SESSION.get(url, params=params, timeout=45)
    r.raise_for_status()
    return r.json()


def fetch_all_event_odds(api_key: str) -> List[dict]:
    validate_api_key()

    events = get_events(api_key)
    if not events:
        return []

    payloads: List[dict] = []

    for event in events:
        event_id = event.get("id")
        if not event_id:
            continue
        try:
            payloads.append(get_event_odds(api_key, event_id))
        except requests.HTTPError as e:
            print(f"Skipped event {event_id}: {e}")
        time.sleep(PAUSE_BETWEEN_EVENT_CALLS)

    return payloads


def market_key_to_prefix(market_key: str) -> Optional[str]:
    mapping = {
        "batter_hits": "hits",
        "batter_total_bases": "tb",
        "batter_home_runs": "hr",
        "batter_runs_scored": "runs",
        "batter_rbis": "rbi",
        "batter_stolen_bases": "sb",
    }
    return mapping.get(market_key)


def flatten_odds(event_payloads: List[dict]) -> pd.DataFrame:
    rows: List[dict] = []

    for event in event_payloads:
        event_id = event.get("id")
        commence_time = event.get("commence_time")
        home_team = event.get("home_team")
        away_team = event.get("away_team")

        for bookmaker in event.get("bookmakers", []):
            book_key = bookmaker.get("key")
            book_title = bookmaker.get("title")
            last_update = bookmaker.get("last_update")

            for market in bookmaker.get("markets", []):
                market_key = market.get("key")
                prefix = market_key_to_prefix(market_key)
                if not prefix:
                    continue

                for outcome in market.get("outcomes", []):
                    name = outcome.get("name")
                    description = outcome.get("description")
                    point = outcome.get("point")
                    price = outcome.get("price")

                    player_name = description if description else name
                    side = name if description else None

                    rows.append(
                        {
                            "odds_event_id": event_id,
                            "commence_time": commence_time,
                            "home_team": home_team,
                            "away_team": away_team,
                            "bookmaker_key": book_key,
                            "bookmaker": book_title,
                            "last_update": last_update,
                            "market_key": market_key,
                            "metric_prefix": prefix,
                            "player_name_odds": player_name,
                            "player_key": normalize_name(player_name),
                            "player_compact_key": compact_name_key(player_name),
                            "player_first_last_key": first_last_key(player_name),
                            "side": side,
                            "line": point,
                            "price": price,
                            "implied_prob": american_to_implied_prob(price),
                        }
                    )

    return pd.DataFrame(rows)


# ============================================================
# Matching + edge calculations
# ============================================================

def best_odds_by_player_metric(odds_df: pd.DataFrame) -> pd.DataFrame:
    if odds_df.empty:
        return odds_df

    out = odds_df.copy()

    if "side" in out.columns:
        out = out[out["side"].fillna("").str.lower().isin(["over", "yes", ""])].copy()

    out = out.sort_values(
        ["player_key", "metric_prefix", "line", "price"],
        ascending=[True, True, True, False],
    )
    best_same_line = out.drop_duplicates(
        subset=["player_key", "metric_prefix", "line"],
        keep="first",
    )

    best_same_line = best_same_line.sort_values(
        ["player_key", "metric_prefix", "price"],
        ascending=[True, True, False],
    )
    best_player_metric = best_same_line.drop_duplicates(
        subset=["player_key", "metric_prefix"],
        keep="first",
    )

    return best_player_metric


def merge_metric_lines(model_df: pd.DataFrame, odds_df: pd.DataFrame) -> pd.DataFrame:
    out = model_df.copy()

    projection_col_map = {
        "hits": "projected_hits",
        "tb": "projected_tb",
        "hr": "projected_hr",
        "runs": "projected_runs",
        "rbi": "projected_rbi",
        "sb": "projected_sb",
    }

    for prefix, proj_col in projection_col_map.items():
        metric_odds = odds_df[odds_df["metric_prefix"] == prefix].copy()

        for c in [
            f"{prefix}_line",
            f"{prefix}_price",
            f"{prefix}_bookmaker",
            f"{prefix}_implied_prob",
            f"{prefix}_model_over_prob",
            f"{prefix}_edge",
            f"{prefix}_ev",
        ]:
            if c not in out.columns:
                out[c] = None

        if metric_odds.empty:
            continue

        lookup_1 = metric_odds[
            ["player_key", "line", "price", "bookmaker", "implied_prob"]
        ].drop_duplicates("player_key")
        merged_1 = out[["player_key"]].merge(lookup_1, on="player_key", how="left")

        out[f"{prefix}_line"] = merged_1["line"]
        out[f"{prefix}_price"] = merged_1["price"]
        out[f"{prefix}_bookmaker"] = merged_1["bookmaker"]
        out[f"{prefix}_implied_prob"] = merged_1["implied_prob"]

        unmatched = out[f"{prefix}_line"].isna()
        if unmatched.any():
            lookup_2 = metric_odds[
                ["player_compact_key", "line", "price", "bookmaker", "implied_prob"]
            ].drop_duplicates("player_compact_key")
            fallback = out.loc[unmatched, ["player_compact_key"]].merge(
                lookup_2, on="player_compact_key", how="left"
            )
            out.loc[unmatched, f"{prefix}_line"] = fallback["line"].values
            out.loc[unmatched, f"{prefix}_price"] = fallback["price"].values
            out.loc[unmatched, f"{prefix}_bookmaker"] = fallback["bookmaker"].values
            out.loc[unmatched, f"{prefix}_implied_prob"] = fallback["implied_prob"].values

        unmatched = out[f"{prefix}_line"].isna()
        if unmatched.any():
            lookup_3 = metric_odds[
                ["player_first_last_key", "line", "price", "bookmaker", "implied_prob"]
            ].drop_duplicates("player_first_last_key")
            fallback = out.loc[unmatched, ["player_first_last_key"]].merge(
                lookup_3, on="player_first_last_key", how="left"
            )
            out.loc[unmatched, f"{prefix}_line"] = fallback["line"].values
            out.loc[unmatched, f"{prefix}_price"] = fallback["price"].values
            out.loc[unmatched, f"{prefix}_bookmaker"] = fallback["bookmaker"].values
            out.loc[unmatched, f"{prefix}_implied_prob"] = fallback["implied_prob"].values

        out[f"{prefix}_model_over_prob"] = out.apply(
            lambda r: probability_over_poisson(r.get(proj_col), r.get(f"{prefix}_line")),
            axis=1,
        )

        out[f"{prefix}_edge"] = out.apply(
            lambda r: round(float(r.get(proj_col)) - float(r.get(f"{prefix}_line")), 3)
            if pd.notna(r.get(proj_col)) and pd.notna(r.get(f"{prefix}_line"))
            else None,
            axis=1,
        )

        out[f"{prefix}_ev"] = out.apply(
            lambda r: expected_value_from_american(
                r.get(f"{prefix}_model_over_prob"),
                r.get(f"{prefix}_price"),
            ),
            axis=1,
        )

    return out


def build_best_play_flags(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()

    def choose_flag(row):
        flags = []

        if nz(row.get("hits_edge"), -999) >= 0.20 and nz(row.get("hits_ev"), -999) >= 0.03:
            flags.append("Hits Edge")
        if nz(row.get("tb_edge"), -999) >= 0.35 and nz(row.get("tb_ev"), -999) >= 0.03:
            flags.append("TB Edge")
        if nz(row.get("runs_edge"), -999) >= 0.18 and nz(row.get("runs_ev"), -999) >= 0.02:
            flags.append("Runs Edge")
        if nz(row.get("rbi_edge"), -999) >= 0.18 and nz(row.get("rbi_ev"), -999) >= 0.02:
            flags.append("RBI Edge")
        if nz(row.get("hr_edge"), -999) >= 0.07 and nz(row.get("hr_ev"), -999) >= 0.02:
            flags.append("HR Edge")
        if nz(row.get("sb_edge"), -999) >= 0.05 and nz(row.get("sb_ev"), -999) >= 0.02:
            flags.append("SB Edge")

        if nz(row.get("confidence_score"), 0) >= 80:
            flags.append("High Confidence")
        elif nz(row.get("confidence_score"), 0) >= 68:
            flags.append("Strong Confidence")

        return ", ".join(flags)

    out["edge_flags"] = out.apply(choose_flag, axis=1)
    return out


def build_top_plays_auto_sheet(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()

    out["auto_hits_play"] = (
        out.get("hits_ev", pd.Series([None] * len(out))).fillna(-999).ge(0.03)
        & out.get("hits_edge", pd.Series([None] * len(out))).fillna(-999).ge(0.20)
        & out.get("confidence_score", pd.Series([0] * len(out))).fillna(0).ge(68)
    )
    out["auto_tb_play"] = (
        out.get("tb_ev", pd.Series([None] * len(out))).fillna(-999).ge(0.03)
        & out.get("tb_edge", pd.Series([None] * len(out))).fillna(-999).ge(0.35)
        & out.get("confidence_score", pd.Series([0] * len(out))).fillna(0).ge(68)
    )
    out["auto_runs_play"] = (
        out.get("runs_ev", pd.Series([None] * len(out))).fillna(-999).ge(0.02)
        & out.get("runs_edge", pd.Series([None] * len(out))).fillna(-999).ge(0.18)
        & out.get("confidence_score", pd.Series([0] * len(out))).fillna(0).ge(68)
    )
    out["auto_rbi_play"] = (
        out.get("rbi_ev", pd.Series([None] * len(out))).fillna(-999).ge(0.02)
        & out.get("rbi_edge", pd.Series([None] * len(out))).fillna(-999).ge(0.18)
        & out.get("confidence_score", pd.Series([0] * len(out))).fillna(0).ge(68)
    )
    out["auto_hr_play"] = (
        out.get("hr_ev", pd.Series([None] * len(out))).fillna(-999).ge(0.02)
        & out.get("hr_edge", pd.Series([None] * len(out))).fillna(-999).ge(0.07)
        & out.get("confidence_score", pd.Series([0] * len(out))).fillna(0).ge(68)
    )

    def choose_best_prop(row):
        candidates = []
        for prop in ["hits", "tb", "runs", "rbi", "hr"]:
            ev = nz(row.get(f"{prop}_ev"), -999)
            edge = nz(row.get(f"{prop}_edge"), -999)
            if row.get(f"auto_{prop}_play", False):
                candidates.append((prop.upper(), ev, edge))
        if not candidates:
            return None, None, None
        best = sorted(candidates, key=lambda x: (x[1], x[2]), reverse=True)[0]
        return best

    best_prop = out.apply(lambda r: choose_best_prop(r), axis=1)
    out["best_prop"] = best_prop.apply(lambda x: x[0])
    out["best_prop_ev"] = best_prop.apply(lambda x: x[1])
    out["best_prop_edge"] = best_prop.apply(lambda x: x[2])

    auto_sheet = out[
        out[["auto_hits_play", "auto_tb_play", "auto_runs_play", "auto_rbi_play", "auto_hr_play"]].any(axis=1)
    ].copy()

    auto_sheet["top_play_label"] = auto_sheet.apply(
        lambda r: f"{r['best_prop']} Auto Play" if pd.notna(r.get("best_prop")) else None,
        axis=1,
    )

    keep_cols = [
        "player", "team", "opp", "pitcher", "lineup_spot",
        "best_prop", "best_prop_ev", "best_prop_edge", "top_play_label",
        "projected_hits", "hits_line", "hits_price", "hits_bookmaker", "hits_edge", "hits_ev", "auto_hits_play",
        "projected_tb", "tb_line", "tb_price", "tb_bookmaker", "tb_edge", "tb_ev", "auto_tb_play",
        "projected_runs", "runs_line", "runs_price", "runs_bookmaker", "runs_edge", "runs_ev", "auto_runs_play",
        "projected_rbi", "rbi_line", "rbi_price", "rbi_bookmaker", "rbi_edge", "rbi_ev", "auto_rbi_play",
        "projected_hr", "hr_line", "hr_price", "hr_bookmaker", "hr_edge", "hr_ev", "auto_hr_play",
        "confidence_score", "confidence_tier", "edge_flags",
    ]
    existing = [c for c in keep_cols if c in auto_sheet.columns]
    auto_sheet = auto_sheet[existing].sort_values(
        ["best_prop_ev", "confidence_score", "best_prop_edge"],
        ascending=[False, False, False],
    ).reset_index(drop=True)

    return auto_sheet


def build_top_edge_views(df: pd.DataFrame) -> Dict[str, pd.DataFrame]:
    views: Dict[str, pd.DataFrame] = {}

    sort_specs = {
        "Top Hits Edges": ["hits_ev", "hits_edge", "confidence_score"],
        "Top TB Edges": ["tb_ev", "tb_edge", "confidence_score"],
        "Top Runs Edges": ["runs_ev", "runs_edge", "confidence_score"],
        "Top RBI Edges": ["rbi_ev", "rbi_edge", "confidence_score"],
        "Top HR Edges": ["hr_ev", "hr_edge", "confidence_score"],
    }

    keep_cols = [
        "player", "team", "opp", "pitcher", "lineup_spot",
        "projected_hits", "hits_line", "hits_price", "hits_bookmaker", "hits_edge", "hits_ev",
        "projected_tb", "tb_line", "tb_price", "tb_bookmaker", "tb_edge", "tb_ev",
        "projected_runs", "runs_line", "runs_price", "runs_bookmaker", "runs_edge", "runs_ev",
        "projected_rbi", "rbi_line", "rbi_price", "rbi_bookmaker", "rbi_edge", "rbi_ev",
        "projected_hr", "hr_line", "hr_price", "hr_bookmaker", "hr_edge", "hr_ev",
        "projected_sb", "sb_line", "sb_price", "sb_bookmaker", "sb_edge", "sb_ev",
        "confidence_score", "confidence_tier", "edge_flags",
    ]
    existing = [c for c in keep_cols if c in df.columns]

    for title, sort_cols in sort_specs.items():
        available_sort = [c for c in sort_cols if c in df.columns]
        if not available_sort:
            continue
        view = df[existing].copy().sort_values(
            available_sort,
            ascending=[False] * len(available_sort),
        ).head(25)
        views[title] = view

    return views


# ============================================================
# Output
# ============================================================

def write_excel(
    output_path: Path,
    merged_df: pd.DataFrame,
    raw_odds_df: pd.DataFrame,
    top_views: Dict[str, pd.DataFrame],
    auto_sheet: pd.DataFrame,
) -> None:
    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        if not auto_sheet.empty:
            auto_sheet.to_excel(writer, index=False, sheet_name="Top Plays Auto")
        merged_df.to_excel(writer, index=False, sheet_name="Edges")
        if not raw_odds_df.empty:
            raw_odds_df.to_excel(writer, index=False, sheet_name="Raw Odds")
        for sheet_name, view_df in top_views.items():
            view_df.to_excel(writer, index=False, sheet_name=sheet_name[:31])


def write_json(output_path: Path, df: pd.DataFrame) -> None:
    import json

    export_cols = [
        "date", "player", "team", "opp", "pitcher", "lineup_spot",
        "projected_hits", "projected_tb", "projected_runs", "projected_rbi", "projected_hr", "projected_sb",
        "hits_line", "hits_price", "hits_bookmaker", "hits_edge", "hits_ev",
        "tb_line", "tb_price", "tb_bookmaker", "tb_edge", "tb_ev",
        "runs_line", "runs_price", "runs_bookmaker", "runs_edge", "runs_ev",
        "rbi_line", "rbi_price", "rbi_bookmaker", "rbi_edge", "rbi_ev",
        "hr_line", "hr_price", "hr_bookmaker", "hr_edge", "hr_ev",
        "sb_line", "sb_price", "sb_bookmaker", "sb_edge", "sb_ev",
        "confidence_score", "confidence_tier", "edge_flags",
    ]

    existing = [c for c in export_cols if c in df.columns]
    payload = df[existing].to_dict(orient="records")

    def clean_value(v):
        if v is None:
            return None
        if isinstance(v, float):
            if math.isnan(v) or math.isinf(v):
                return None
            return v
        return v

    cleaned_payload = []
    for row in payload:
        cleaned_payload.append({k: clean_value(v) for k, v in row.items()})

    output_path.write_text(
        json.dumps(cleaned_payload, indent=2, allow_nan=False),
        encoding="utf-8",
    )


# ============================================================
# Entrypoint
# ============================================================

def main():
    script_dir = get_script_directory()
    input_path = get_input_path(INPUT_PROJECTION_FILE)
    output_path = script_dir / OUTPUT_EDGE_FILE
    json_path = script_dir / OUTPUT_JSON_FILE
    script_path = script_dir / (Path(__file__).name if "__file__" in globals() else "proppulse_mlb_edge_v1.py")

    print(f"Loading projection file: {input_path}")
    model_df = load_projection_file(input_path)

    print("Pulling event-level prop markets from The Odds API...")
    event_payloads = fetch_all_event_odds(ODDS_API_KEY)
    raw_odds_df = flatten_odds(event_payloads)

    if raw_odds_df.empty:
        print("Warning: no player prop odds returned. Check API coverage, books, and market availability.")

    best_odds_df = best_odds_by_player_metric(raw_odds_df)
    merged_df = merge_metric_lines(model_df, best_odds_df)
    merged_df = build_best_play_flags(merged_df)

    sort_cols = [c for c in ["tb_ev", "hits_ev", "runs_ev", "confidence_score"] if c in merged_df.columns]
    if sort_cols:
        merged_df = merged_df.sort_values(sort_cols, ascending=[False] * len(sort_cols)).reset_index(drop=True)

    top_views = build_top_edge_views(merged_df)
    auto_sheet = build_top_plays_auto_sheet(merged_df)

    write_excel(output_path, merged_df, raw_odds_df, top_views, auto_sheet)
    print(f"Done. Edge file written to: {output_path}")

    if SAVE_JSON_EXPORT:
        try:
            write_json(json_path, merged_df)
            print(f"JSON export written to: {json_path}")
        except Exception as e:
            print(f"Could not write JSON export: {e}")

    runner_path = create_windows_runner_bat(script_path)
    if runner_path:
        print(f"Desktop one-click runner created: {runner_path}")

    if AUTO_OPEN_EXCEL:
        open_file_with_default_app(output_path)


if __name__ == "__main__":
    main()