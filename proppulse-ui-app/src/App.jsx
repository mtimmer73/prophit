import React, { useEffect, useMemo, useRef, useState } from "react";

const DATA_URL = "/data/prophit_latest.json";
const PERF_URL = "/data/prophit_performance_summary.json";

const toNum = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const fmtNum = (v, d = 2) => {
  const n = toNum(v);
  return n === null ? "—" : n.toFixed(d);
};

const fmtPct = (v, d = 1) => {
  const n = toNum(v);
  return n === null ? "—" : `${(n * 100).toFixed(d)}%`;
};

const fmtDeltaPct = (v, d = 1) => {
  const n = toNum(v);
  if (n === null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(d)}%`;
};

const fmtOdds = (v) => {
  const n = toNum(v);
  if (n === null) return "—";
  return n > 0 ? `+${Math.round(n)}` : `${Math.round(n)}`;
};

const fmtAvgDelta = (v) => {
  const n = toNum(v);
  if (n === null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(3)}`;
};

const getOrder = (row) => {
  const live = row?.lineup_spot_num;
  const batting = row?.batting_order;
  const fallback = row?.fallback_batting_order;
  if (live !== null && live !== undefined && live !== "") return live;
  if (batting !== null && batting !== undefined && batting !== "") return batting;
  if (fallback !== null && fallback !== undefined && fallback !== "") return fallback;
  return null;
};

const isOpponentHome = (row) => {
  const homeAway = String(row?.home_away ?? row?.homeAway ?? row?.venue_side ?? "").toLowerCase();

  // If the player's team is away, the opponent is home.
  if (homeAway === "away" || homeAway === "a" || homeAway.includes("away")) return true;
  if (row?.is_away === true || row?.away === true) return true;

  // Support alternate model/export fields if they exist.
  if (row?.opp_home === true || row?.opponent_home === true || row?.is_opp_home === true) return true;
  if (String(row?.opp_home_away ?? row?.opponent_home_away ?? "").toLowerCase().includes("home")) return true;

  return false;
};

const isAwayGame = (row) => isOpponentHome(row);

const formatOpponent = (row) => {
  const opp = row?.opp ?? row?.opponent ?? row?.opponent_team ?? "";
  if (!opp) return "—";
  const clean = String(opp).replace(/^@/, "");
  return isOpponentHome(row) ? `@${clean}` : clean;
};

const getSeasonAvgVsPitcherHand = (row) => {
  const hand = String(row?.opp_pitcher_hand ?? row?.pitcher_throws ?? "").toUpperCase();
  if (hand === "L") return row?.season_avg_vs_lhp ?? row?.split_hits_per_ab_season_vs_opp_hand ?? null;
  if (hand === "R") return row?.season_avg_vs_rhp ?? row?.split_hits_per_ab_season_vs_opp_hand ?? null;
  return row?.split_hits_per_ab_season_vs_opp_hand ?? null;
};

const getSeasonAvg = (row) => {
  const direct = row?.season_market_avg ?? row?.espn_season_avg ?? row?.season_hits_per_ab;
  if (direct !== null && direct !== undefined && direct !== "") return direct;
  const h = toNum(row?.season_hits);
  const ab = toNum(row?.season_ab);
  return h !== null && ab !== null && ab > 0 ? h / ab : null;
};

const getCareerAvgVsLHP = (row) =>
  row?.alltime_avg_vs_lhp ?? row?.career_avg_vs_lhp ?? row?.real_avg_vs_lhp_career ?? null;

const getCareerAvgVsRHP = (row) =>
  row?.alltime_avg_vs_rhp ?? row?.career_avg_vs_rhp ?? row?.real_avg_vs_rhp_career ?? null;


const getPitcherBAASeasonVsLHB = (row) =>
  row?.pitcher_baa_vs_lhb_season ??
  row?.opp_pitcher_baa_vs_lhb_season ??
  row?.opp_pitcher_avg_allowed_vs_lhb_season ??
  row?.pitcher_avg_allowed_vs_lhb_season ??
  row?.pitcher_season_avg_vs_lhb ??
  row?.opp_pitcher_split_avg_allowed_vs_lhb_season ??
  null;

const getPitcherBAASeasonVsRHB = (row) =>
  row?.pitcher_baa_vs_rhb_season ??
  row?.opp_pitcher_baa_vs_rhb_season ??
  row?.opp_pitcher_avg_allowed_vs_rhb_season ??
  row?.pitcher_avg_allowed_vs_rhb_season ??
  row?.pitcher_season_avg_vs_rhb ??
  row?.opp_pitcher_split_avg_allowed_vs_rhb_season ??
  null;

const getPitcherBAACareerVsLHB = (row) =>
  row?.pitcher_baa_vs_lhb_career ??
  row?.opp_pitcher_baa_vs_lhb_career ??
  row?.opp_pitcher_avg_allowed_vs_lhb_career ??
  row?.pitcher_avg_allowed_vs_lhb_career ??
  row?.pitcher_career_avg_vs_lhb ??
  row?.opp_pitcher_split_avg_allowed_vs_lhb_career ??
  null;

const getPitcherBAACareerVsRHB = (row) =>
  row?.pitcher_baa_vs_rhb_career ??
  row?.opp_pitcher_baa_vs_rhb_career ??
  row?.opp_pitcher_avg_allowed_vs_rhb_career ??
  row?.pitcher_avg_allowed_vs_rhb_career ??
  row?.pitcher_career_avg_vs_rhb ??
  row?.opp_pitcher_split_avg_allowed_vs_rhb_career ??
  null;


const getPitcherSeasonBAAAllowedVsBatterHand = (row) => {
  const batHand = String(row?.bats ?? row?.batter_hand ?? "").toUpperCase();
  const vsL = getPitcherBAASeasonVsLHB(row);
  const vsR = getPitcherBAASeasonVsRHB(row);

  if (batHand === "L") return vsL;
  if (batHand === "R") return vsR;

  const l = toNum(vsL);
  const r = toNum(vsR);
  if (l !== null && r !== null) return Math.max(l, r);
  return vsL ?? vsR ?? null;
};


const getRowKey = (row, index = 0) =>
  row?.row_key ||
  row?.player_id ||
  row?.id ||
  `${row?.player || "player"}-${row?.team || "team"}-${row?.opp || "opp"}-${row?.game_time_et || "time"}-${index}`;

const getConfidenceLetter = (v) => {
  const n = toNum(v);
  if (n === null) return "—";
  if (n >= 80) return "A";
  if (n >= 70) return "B";
  if (n >= 60) return "C";
  if (n >= 45) return "D";
  return "F";
};

const confidenceKey = [
  ["A", "80+", "Highest", "#34d399"],
  ["B", "70–79", "Strong", "#60a5fa"],
  ["C", "60–69", "Playable", "#fbbf24"],
  ["D", "45–59", "Lower", "#fb7185"],
  ["F", "<45", "Avoid", "#f87171"],
];

const tone = {
  green: "#34d399",
  blue: "#60a5fa",
  yellow: "#fbbf24",
  red: "#fb7185",
  muted: "#94a3b8",
  white: "#ffffff",
};

const getProbTone = (v) => {
  const n = toNum(v);
  if (n === null) return tone.muted;
  if (n >= 0.65) return tone.green;
  if (n >= 0.58) return tone.blue;
  if (n >= 0.5) return tone.yellow;
  return tone.red;
};

const getScoreTone = (v) => {
  const n = toNum(v);
  if (n === null) return tone.muted;
  if (n >= 80) return tone.green;
  if (n >= 70) return tone.blue;
  if (n >= 60) return tone.yellow;
  return tone.red;
};

const getConfTone = (v) => {
  const n = toNum(v);
  if (n === null) return tone.muted;
  if (n >= 75) return tone.green;
  if (n >= 60) return tone.blue;
  if (n >= 45) return tone.yellow;
  return tone.red;
};

const getOrderTone = (v) => {
  const n = toNum(v);
  if (n === null) return tone.muted;
  if (n <= 2) return tone.green;
  if (n <= 5) return tone.blue;
  if (n <= 7) return tone.yellow;
  return tone.red;
};

const getABTone = (v) => {
  const n = toNum(v);
  if (n === null) return tone.muted;
  if (n >= 4.0) return tone.green;
  if (n >= 3.6) return tone.blue;
  if (n >= 3.2) return tone.yellow;
  return tone.red;
};

const getAvgTone = (v) => {
  const n = toNum(v);
  if (n === null) return tone.muted;
  if (n >= 0.285) return tone.green;
  if (n >= 0.26) return tone.blue;
  if (n >= 0.235) return tone.yellow;
  return tone.red;
};

const getDeltaTone = (v) => {
  const n = toNum(v);
  if (n === null) return tone.muted;
  if (n >= 0.035) return tone.green;
  if (n >= 0.015) return tone.blue;
  if (n >= 0) return tone.yellow;
  return tone.red;
};

const getTierTone = (tier) => {
  if (tier === "A" || tier === "High") return tone.green;
  if (tier === "B" || tier === "Medium") return tone.blue;
  if (tier === "C") return tone.yellow;
  return tone.red;
};

const styles = {
  app: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top left, rgba(14,165,233,.18), transparent 35%), linear-gradient(180deg, #020617 0%, #071326 48%, #020617 100%)",
    color: "white",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  page: {
    maxWidth: 2100,
    margin: "0 auto",
    padding: 20,
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 20,
    flexWrap: "wrap",
  },
  brandBlock: {
    display: "flex",
    alignItems: "center",
    gap: 18,
    flexWrap: "wrap",
  },
  logoMark: {
    width: 96,
    height: 96,
    borderRadius: 24,
    border: "1px solid rgba(56,189,248,.30)",
    background: "linear-gradient(145deg, rgba(8,47,73,.92), rgba(2,6,23,.92))",
    boxShadow: "0 22px 60px rgba(14,165,233,.16)",
    display: "grid",
    placeItems: "center",
    position: "relative",
    overflow: "hidden",
    flex: "0 0 auto",
  },
  baseballIcon: {
    width: 58,
    height: 58,
    borderRadius: "50%",
    background: "#f8fafc",
    position: "relative",
    boxShadow: "inset 0 0 0 1px rgba(15,23,42,.18)",
  },
  logoSeamLeft: {
    position: "absolute",
    left: 14,
    top: 6,
    width: 18,
    height: 46,
    borderRight: "2px dashed #ef4444",
    borderRadius: "50%",
    transform: "rotate(-16deg)",
    opacity: .85,
  },
  logoSeamRight: {
    position: "absolute",
    right: 14,
    top: 6,
    width: 18,
    height: 46,
    borderLeft: "2px dashed #ef4444",
    borderRadius: "50%",
    transform: "rotate(16deg)",
    opacity: .85,
  },
  logoText: {
    marginTop: 7,
    fontSize: 14,
    fontWeight: 1000,
    letterSpacing: ".12em",
    color: "#ffffff",
    textTransform: "uppercase",
  },
  logoStack: {
    display: "grid",
    placeItems: "center",
  },
  modelStatement: {
    maxWidth: 760,
    color: "#bae6fd",
    fontSize: 15,
    lineHeight: 1.45,
    marginTop: 8,
  },
  modelRunNotice: {
    maxWidth: 960,
    margin: "14px auto 0",
    border: "1px solid rgba(56,189,248,.25)",
    background: "rgba(14,165,233,.10)",
    color: "#e0f2fe",
    borderRadius: 16,
    padding: "10px 14px",
    fontSize: 13,
    lineHeight: 1.45,
    textAlign: "center",
    fontWeight: 900,
    letterSpacing: ".02em",
  },
  slateStatusBar: {
    marginTop: 16,
    border: "1px solid rgba(56,189,248,.18)",
    background: "linear-gradient(90deg, rgba(8,47,73,.64), rgba(15,23,42,.72))",
    borderRadius: 20,
    padding: 14,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 10,
    alignItems: "center",
  },
  slateStatusItem: {
    border: "1px solid rgba(56,189,248,.12)",
    background: "rgba(2,6,23,.34)",
    borderRadius: 14,
    padding: "10px 12px",
    minWidth: 0,
  },
  slateStatusLabel: {
    display: "block",
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: 1000,
    letterSpacing: ".16em",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  slateStatusValue: {
    display: "block",
    color: "#ffffff",
    fontSize: 15,
    fontWeight: 1000,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  slateEmptyCard: {
    marginTop: 16,
    border: "1px solid rgba(251,191,36,.24)",
    background: "rgba(120,53,15,.18)",
    color: "#fde68a",
    borderRadius: 20,
    padding: 18,
    fontSize: 14,
    lineHeight: 1.55,
    fontWeight: 800,
  },
  title: {
    fontSize: 50,
    lineHeight: 1,
    fontWeight: 900,
    letterSpacing: "-0.04em",
    margin: "10px 0 6px",
  },
  wordLogo: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    fontSize: 58,
    lineHeight: 1,
    fontWeight: 1000,
    letterSpacing: "-0.045em",
    margin: "10px 0 6px",
    color: "#ffffff",
  },
  wordLogoBall: {
    width: 48,
    height: 48,
    borderRadius: "50%",
    background: "#f8fafc",
    display: "inline-block",
    position: "relative",
    margin: "0 1px",
    boxShadow: "inset 0 0 0 2px rgba(15,23,42,.16), 0 0 24px rgba(56,189,248,.18)",
    transform: "translateY(5px)",
    flex: "0 0 auto",
  },
  wordLogoSeamLeft: {
    position: "absolute",
    left: 11,
    top: 5,
    width: 14,
    height: 38,
    borderRight: "2px dashed #ef4444",
    borderRadius: "50%",
    transform: "rotate(-16deg)",
  },
  wordLogoSeamRight: {
    position: "absolute",
    right: 11,
    top: 5,
    width: 14,
    height: 38,
    borderLeft: "2px dashed #ef4444",
    borderRadius: "50%",
    transform: "rotate(16deg)",
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: 18,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid rgba(56,189,248,.25)",
    background: "rgba(14,165,233,.12)",
    color: "#bae6fd",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: ".18em",
    textTransform: "uppercase",
  },
  button: {
    border: "1px solid rgba(56,189,248,.30)",
    background: "rgba(14,165,233,.16)",
    color: "#ffffff",
    borderRadius: 14,
    padding: "10px 14px",
    fontWeight: 800,
    cursor: "pointer",
  },
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
    marginTop: 24,
  },
  card: {
    border: "1px solid rgba(56,189,248,.16)",
    background: "rgba(15,23,42,.62)",
    borderRadius: 24,
    padding: 18,
    boxShadow: "0 20px 50px rgba(0,0,0,.22)",
  },
  cardLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: ".16em",
    color: "#94a3b8",
    fontWeight: 900,
  },
  cardValue: {
    marginTop: 8,
    fontSize: 30,
    fontWeight: 900,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  topLeanName: {
    marginTop: 8,
    fontSize: 26,
    lineHeight: 1.05,
    fontWeight: 900,
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    wordBreak: "normal",
  },
  cardSub: {
    marginTop: 4,
    color: "#94a3b8",
    fontSize: 13,
  },
  panelGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, .6fr)",
    gap: 14,
    marginTop: 16,
  },
  panel: {
    border: "1px solid rgba(56,189,248,.16)",
    background: "rgba(15,23,42,.62)",
    borderRadius: 24,
    padding: 24,
    boxShadow: "0 20px 50px rgba(0,0,0,.18)",
  },
  panelTitle: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: ".18em",
    color: "#bae6fd",
    fontWeight: 900,
    marginBottom: 14,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid rgba(56,189,248,.20)",
    background: "rgba(2,6,23,.7)",
    color: "white",
    borderRadius: 14,
    padding: "11px 12px",
    outline: "none",
  },
  inputLabel: {
    display: "block",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: ".15em",
    color: "#94a3b8",
    fontWeight: 900,
    marginBottom: 6,
  },

  filterDescription: {
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 1.55,
    marginBottom: 24,
    textAlign: "center",
  },
  filterDescriptionStrong: {
    color: "#e0f2fe",
    fontWeight: 1000,
  },
  filtersAligned: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(220px, 1fr))",
    gap: "28px 32px",
    alignItems: "end",
  },
  filterLabel: {
    display: "grid",
    gap: 9,
    minWidth: 0,
  },
  filterInputLabel: {
    display: "block",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: ".20em",
    color: "#94a3b8",
    fontWeight: 1000,
    textAlign: "center",
    minHeight: 32,
    lineHeight: 1.45,
  },
  filterInputWide: {
    width: "100%",
    height: 46,
    boxSizing: "border-box",
    border: "1px solid rgba(56,189,248,.24)",
    background: "rgba(2,6,23,.72)",
    color: "white",
    borderRadius: 16,
    padding: "0 14px",
    outline: "none",
    fontSize: 14,
  },
  filterButtonsCentered: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 30,
  },

  filters: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  },
  chipRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 14,
  },
  chip: {
    border: "1px solid rgba(56,189,248,.20)",
    background: "rgba(15,23,42,.7)",
    color: "#cbd5e1",
    borderRadius: 999,
    padding: "9px 12px",
    cursor: "pointer",
    fontWeight: 800,
  },
  chipActive: {
    background: "#38bdf8",
    color: "#020617",
  },
  tableWrap: {
    marginTop: 16,
    border: "1px solid rgba(56,189,248,.16)",
    borderRadius: 24,
    overflow: "hidden",
    background: "rgba(15,23,42,.55)",
    boxShadow: "0 20px 50px rgba(0,0,0,.18)",
  },
  boardPopoutBackdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 999999,
    background: "rgba(0,0,0,.84)",
    backdropFilter: "blur(6px)",
    padding: 10,
    boxSizing: "border-box",
  },
  boardPopoutShell: {
    height: "100%",
    width: "100%",
    border: "1px solid rgba(56,189,248,.25)",
    background: "#020617",
    borderRadius: 22,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 30px 90px rgba(0,0,0,.65)",
  },
  boardPopoutHeader: {
    flex: "0 0 auto",
    minHeight: 72,
    padding: "10px 18px",
    borderBottom: "1px solid rgba(56,189,248,.16)",
    background: "linear-gradient(90deg, rgba(8,47,73,.95), rgba(2,6,23,.98))",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  boardPopoutTitle: {
    color: "#bae6fd",
    fontWeight: 1000,
    fontSize: 22,
  },
  boardPopoutClose: {
    border: "1px solid rgba(56,189,248,.30)",
    background: "rgba(14,165,233,.16)",
    color: "#ffffff",
    borderRadius: 12,
    padding: "9px 13px",
    fontWeight: 900,
    cursor: "pointer",
  },
  boardPopoutScroll: {
    flex: "1 1 auto",
    overflow: "auto",
  },
  boardPopoutFilterInput: {
    width: "100%",
    boxSizing: "border-box",
    marginTop: 5,
    border: "1px solid rgba(56,189,248,.18)",
    background: "rgba(2,6,23,.76)",
    color: "#e0f2fe",
    borderRadius: 7,
    padding: "4px 4px",
    fontSize: 9,
    outline: "none",
  },
  topScroll: {
    overflowX: "auto",
    overflowY: "hidden",
    borderBottom: "1px solid rgba(56,189,248,.12)",
    background: "rgba(2,6,23,.40)",
  },
  topScrollInner: {
    width: "100%",
    height: 1,
  },
  tableScroll: {
    overflowX: "auto",
    overflowY: "auto",
    maxHeight: "72vh",
    position: "relative",
  },
  table: {
    width: "100%",
    minWidth: 3050,
    tableLayout: "fixed",
    borderCollapse: "collapse",
  },
  th: {
    position: "sticky",
    top: 0,
    zIndex: 20,
    background: "#0b2047",
    color: "#dbeafe",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: ".14em",
    fontWeight: 900,
    padding: "14px 10px",
    borderBottom: "1px solid rgba(56,189,248,.16)",
    textAlign: "left",
    whiteSpace: "nowrap",
    boxShadow: "0 2px 0 rgba(56,189,248,.18)",
  },
  td: {
    padding: "13px 10px",
    borderBottom: "1px solid rgba(56,189,248,.10)",
    color: "#cbd5e1",
    fontSize: 14,
  },
  stickyViewHeader: {
    position: "sticky",
    top: 0,
    left: 0,
    zIndex: 70,
    minWidth: 86,
    width: 86,
    background: "#0b2047",
    boxShadow: "8px 0 18px rgba(0,0,0,.25)",
  },
  stickyViewCell: {
    position: "sticky",
    left: 0,
    zIndex: 45,
    minWidth: 86,
    width: 86,
    background: "rgba(2,6,23,.96)",
    boxShadow: "8px 0 18px rgba(0,0,0,.22)",
  },
  stickyPlayerHeader: {
    position: "sticky",
    top: 0,
    left: 86,
    zIndex: 36,
    minWidth: 250,
    width: 250,
    background: "#0b2047",
    boxShadow: "10px 0 20px rgba(0,0,0,.32)",
  },
  stickyPlayerCell: {
    position: "sticky",
    left: 86,
    zIndex: 13,
    minWidth: 250,
    width: 250,
    background: "rgba(2,6,23,.98)",
    boxShadow: "10px 0 20px rgba(0,0,0,.30)",
  },
  row: {
    background: "rgba(2,6,23,.25)",
  },
  openBtn: {
    border: "1px solid rgba(56,189,248,.30)",
    background: "rgba(14,165,233,.16)",
    color: "#ffffff",
    borderRadius: 10,
    padding: "8px 10px",
    cursor: "pointer",
    fontWeight: 800,
  },
  lockBtn: {
    width: 62,
    height: 34,
    border: "1px solid rgba(56,189,248,.28)",
    background: "linear-gradient(180deg, rgba(15,23,42,.96), rgba(2,6,23,.96))",
    color: "#bae6fd",
    borderRadius: 999,
    padding: "0 10px",
    cursor: "pointer",
    fontWeight: 1000,
    fontSize: 11,
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    letterSpacing: ".08em",
    textTransform: "uppercase",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.06), 0 8px 18px rgba(0,0,0,.22)",
  },
  lockDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    border: "1px solid rgba(186,230,253,.55)",
    background: "transparent",
    display: "inline-block",
  },
  lockDotActive: {
    borderColor: "#34d399",
    background: "#34d399",
    boxShadow: "0 0 14px rgba(52,211,153,.65)",
  },
  lockBtnActive: {
    borderColor: "rgba(52,211,153,.85)",
    background: "linear-gradient(180deg, rgba(20,83,45,.82), rgba(6,78,59,.72))",
    color: "#dcfce7",
    boxShadow: "0 0 0 1px rgba(52,211,153,.12), 0 0 20px rgba(52,211,153,.24)",
  },
  lockedRow: {
    background: "rgba(52,211,153,.075)",
    boxShadow: "inset 3px 0 0 rgba(52,211,153,.70)",
  },
  confidenceKeyWrap: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  confidenceKeyItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: "1px solid rgba(56,189,248,.16)",
    background: "rgba(15,23,42,.62)",
    borderRadius: 999,
    padding: "7px 10px",
    fontSize: 12,
    color: "#cbd5e1",
    fontWeight: 800,
  },
  confidenceLetter: {
    width: 22,
    height: 22,
    borderRadius: 999,
    display: "inline-grid",
    placeItems: "center",
    color: "#020617",
    fontWeight: 1000,
    fontSize: 12,
  },
  boardConfidenceKey: {
    gridColumn: "1 / -1",
    border: "1px solid rgba(56,189,248,.14)",
    background: "rgba(15,23,42,.72)",
    borderRadius: 18,
    padding: 14,
  },
  boardConfidenceKeyGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(42px, 1fr))",
    gap: 6,
    marginTop: 10,
  },
  boardConfidenceKeyItem: {
    border: "1px solid rgba(56,189,248,.14)",
    background: "rgba(2,6,23,.38)",
    borderRadius: 14,
    padding: "8px 4px",
    textAlign: "center",
    minWidth: 0,
    overflow: "hidden",
  },
  playerBtn: {
    background: "transparent",
    border: 0,
    color: "#7dd3fc",
    fontWeight: 900,
    cursor: "pointer",
    textAlign: "left",
    fontSize: 14,
  },
  playerNameWrap: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    gap: 10,
    minWidth: 0,
  },
  playerLinks: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    height: "100%",
    flexShrink: 0,
    minWidth: 60,
  },
  playerLinkBtn: {
    width: 26,
    height: 26,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#ffffff",
    fontSize: 11,
    fontWeight: 1000,
    lineHeight: "1",
    padding: 0,
    textDecoration: "none",
    border: "1px solid rgba(255,255,255,.18)",
    boxShadow: "0 5px 16px rgba(0,0,0,.25)",
    transition: "transform .15s ease, box-shadow .15s ease, filter .15s ease",
    position: "relative",
  },
  playerLinkMLB: {
    background: "linear-gradient(135deg, #2563eb, #0ea5e9)",
  },
  playerLinkBR: {
    background: "linear-gradient(135deg, #16a34a, #22c55e)",
  },
  playerLinkBtnHover: {
    transform: "translateY(-1px) scale(1.08)",
    filter: "brightness(1.12)",
    boxShadow: "0 0 0 2px rgba(255,255,255,.14), 0 0 18px rgba(56,189,248,.45)",
  },
  playerLinkTooltip: {
    position: "absolute",
    bottom: "calc(100% + 8px)",
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(2,6,23,.96)",
    color: "#e0f2fe",
    border: "1px solid rgba(56,189,248,.28)",
    borderRadius: 10,
    padding: "6px 8px",
    fontSize: 11,
    fontWeight: 900,
    whiteSpace: "nowrap",
    pointerEvents: "none",
    boxShadow: "0 10px 28px rgba(0,0,0,.36)",
    zIndex: 50,
  },
  tagRow: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
  },
  tag: {
    borderRadius: 999,
    padding: "4px 8px",
    fontSize: 11,
    fontWeight: 900,
    border: "1px solid rgba(148,163,184,.25)",
    color: "#cbd5e1",
    whiteSpace: "nowrap",
  },
  drawerBackdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 999999,
    background: "rgba(0,0,0,.72)",
    backdropFilter: "blur(5px)",
    display: "flex",
    justifyContent: "flex-end",
  },
  drawer: {
    width: "min(980px, 94vw)",
    height: "100vh",
    background: "#061326",
    borderLeft: "1px solid rgba(56,189,248,.25)",
    boxShadow: "-30px 0 80px rgba(0,0,0,.50)",
    overflowY: "auto",
    padding: 22,
    boxSizing: "border-box",
  },
  drawerHeader: {
    position: "sticky",
    top: 0,
    zIndex: 2,
    background: "rgba(6,19,38,.96)",
    borderBottom: "1px solid rgba(56,189,248,.16)",
    paddingBottom: 16,
    marginBottom: 18,
  },
  drawerTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
  },
  drawerTitle: {
    fontSize: 32,
    lineHeight: 1.05,
    fontWeight: 900,
    margin: 0,
  },
  closeBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    border: "1px solid rgba(56,189,248,.22)",
    background: "rgba(15,23,42,.8)",
    color: "white",
    fontSize: 24,
    cursor: "pointer",
  },
  metricGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  },
  metric: {
    border: "1px solid rgba(56,189,248,.14)",
    background: "rgba(15,23,42,.72)",
    borderRadius: 18,
    padding: 14,
  },
  metricLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: ".14em",
    color: "#94a3b8",
    fontWeight: 900,
  },
  metricValue: {
    marginTop: 5,
    fontSize: 22,
    fontWeight: 900,
  },
  drawerGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
    gap: 14,
    marginTop: 16,
  },
  section: {
    border: "1px solid rgba(56,189,248,.14)",
    background: "rgba(15,23,42,.55)",
    borderRadius: 22,
    padding: 16,
  },
  launchGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.35fr) minmax(280px, .65fr)",
    gap: 14,
    marginTop: 16,
  },
  topPlaysList: {
    display: "grid",
    gap: 10,
  },
  topPlayItem: {
    border: "1px solid rgba(56,189,248,.14)",
    background: "rgba(2,6,23,.42)",
    borderRadius: 16,
    padding: 12,
    display: "grid",
    gridTemplateColumns: "32px minmax(0, 1fr) auto",
    gap: 10,
    alignItems: "center",
  },
  rankBadge: {
    width: 30,
    height: 30,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    background: "rgba(56,189,248,.16)",
    border: "1px solid rgba(56,189,248,.25)",
    color: "#e0f2fe",
    fontWeight: 1000,
    fontSize: 12,
  },
  tinyText: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 3,
  },

  whyPlayList: {
    display: "grid",
    gap: 10,
  },
  whyPlayCard: {
    border: "1px solid rgba(56,189,248,.16)",
    background: "rgba(2,6,23,.42)",
    borderRadius: 16,
    padding: 12,
  },
  whyPlayHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  whyPlayName: {
    color: "#e0f2fe",
    fontWeight: 1000,
    fontSize: 14,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  whyPlayProb: {
    color: "#34d399",
    fontWeight: 1000,
    fontSize: 14,
    whiteSpace: "nowrap",
  },
  whyReasonList: {
    display: "grid",
    gap: 5,
    color: "#cbd5e1",
    fontSize: 12,
    lineHeight: 1.35,
  },
  whyReasonItem: {
    display: "grid",
    gridTemplateColumns: "14px minmax(0, 1fr)",
    gap: 6,
    alignItems: "start",
  },
  whyBullet: {
    color: "#38bdf8",
    fontWeight: 1000,
  },

  legalFooter: {
    marginTop: 40,
    paddingTop: 20,
    paddingBottom: 24,
    borderTop: "1px solid rgba(56,189,248,.15)",
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 1.55,
    textAlign: "center",
    maxWidth: 1050,
    marginLeft: "auto",
    marginRight: "auto",
  },
  legalStrong: {
    color: "#e0f2fe",
    fontWeight: 900,
  },
  sectionTitle: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: ".18em",
    color: "#bae6fd",
    fontWeight: 900,
    marginBottom: 12,
  },
};

function SortButton({ label, colKey, sortKey, sortDir, onSort, tooltip }) {
  const active = sortKey === colKey;
  return (
    <button
      onClick={() => onSort(colKey)}
      title={tooltip || label}
      style={{
        background: "transparent",
        border: 0,
        color: active ? "#fff" : "#dbeafe",
        fontWeight: 900,
        cursor: "pointer",
        textTransform: "uppercase",
        letterSpacing: ".14em",
        fontSize: 11,
        padding: 0,
      }}
    >
      {label} {active ? (sortDir === "desc" ? "▼" : "▲") : "⌄"}
    </button>
  );
}



function PropHitWordLogo() {
  return (
    <div style={styles.wordLogo} aria-label="PropHit">
      <span>Pr</span>
      <span style={styles.wordLogoBall}>
        <span style={styles.wordLogoSeamLeft} />
        <span style={styles.wordLogoSeamRight} />
      </span>
      <span>pHit</span>
    </div>
  );
}


function Card({ title, value, sub }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardLabel}>{title}</div>
      <div style={styles.cardValue}>{value}</div>
      {sub ? <div style={styles.cardSub}>{sub}</div> : null}
    </div>
  );
}

function Tag({ children, color = "#cbd5e1" }) {
  return (
    <span style={{ ...styles.tag, color, borderColor: `${color}55`, background: `${color}18` }}>
      {children}
    </span>
  );
}


const getMetricTooltip = (label = "") => {
  const l = String(label).toLowerCase();

  if (l.includes("lineup order")) return "Projected or confirmed batting order spot. Lower lineup spots usually create more plate appearances and at-bats.";
  if (l.includes("projected ab")) return "Projected at-bats for this game based on confirmed lineup spot when available, fallback order, and expected opportunity.";
  if (l.includes("projected hits")) return "Projected hits for this game from projected AB multiplied by the model's adjusted hit rate.";
  if (l === "season avg" || l.includes("season avg")) return "Official/raw season batting average: season hits divided by season at-bats. When used inside LHP/RHP sections, it is season AVG against that pitcher hand.";
  if (l.includes("model avg")) return "Predictive batting average used by PropHit after blending season skill, recent AB form, handedness splits, and matchup context.";
  if (l.includes("model - market")) return "Model AVG minus Season AVG. Positive means the model sees the player above his raw season baseline; negative means below baseline.";
  if (l.includes("1+ hit")) return "Projected probability that the player records at least one hit in today's game.";
  if (l.includes("confidence")) return "Model confidence score based on lineup certainty, sample size, split reliability, volatility, and projection stability.";
  if (l.includes("last 7 games")) return "Batting average over the player's last 7 games: hits divided by at-bats in that game window.";
  if (l.includes("last 15 ab")) return "Batting average over the player's most recent 15 at-bats, not games.";
  if (l.includes("last 30 ab")) return "Batting average over the player's most recent 30 at-bats, not games.";
  if (l.includes("last 50 ab")) return "Batting average over the player's most recent 50 at-bats. In handedness sections, this is the AB-based split/blend for that pitcher hand.";
  if (l.includes("last 100 ab")) return "Batting average over the player's most recent 100 at-bats. In handedness sections, this is the AB-based split/blend for that pitcher hand.";
  if (l.includes("last 200 ab")) return "Batting average over the player's most recent 200 at-bats. In handedness sections, this is the AB-based split/blend for that pitcher hand.";
  if (l.includes("last 15") && l.includes("avg")) return "Recent batting average window: hits divided by at-bats for this recent sample.";
  if (l.includes("last 30") && l.includes("avg")) return "Recent batting average window: hits divided by at-bats for this recent sample.";
  if (l.includes("last 50") && l.includes("avg")) return "Recent batting average window: hits divided by at-bats for this recent sample.";
  if (l.includes("last 100") && l.includes("avg")) return "Recent batting average window: hits divided by at-bats for this recent sample.";
  if (l.includes("3-year")) return "Three-year batting average sample: hits divided by at-bats across the current season plus prior seasons included in the model.";
  if (l.includes("all-time") || l.includes("career")) return "Career batting average split: career hits divided by career at-bats for this category.";
  if (l.includes("pitcher k rate")) return "Opposing pitcher's strikeout rate. Higher K rate can reduce hit probability.";
  if (l === "pitcher" || l.includes("pitcher")) return "Today's opposing probable or confirmed starting pitcher.";
  if (l.includes("pinch risk")) return "Estimated risk that the player loses plate appearances due to pinch hitting, platoon risk, bench status, or lineup uncertainty.";
  if (l.includes("matchup score")) return "Model score for today's matchup using pitcher profile, pitcher hand, hit allowance, strikeout pressure, and hitter fit.";
  if (l.includes("split reliability")) return "How trustworthy the handedness split is based mostly on sample size and data availability.";
  if (l.includes("fair odds")) return "Model-implied fair American odds derived from the 1+ hit probability.";
  if (l.includes("vs lhp")) return "Batting average split against left-handed pitchers: hits divided by at-bats against LHP for the specified window.";
  if (l.includes("vs rhp")) return "Batting average split against right-handed pitchers: hits divided by at-bats against RHP for the specified window.";
  if (l.includes("avg")) return "Batting average: hits divided by at-bats for the displayed sample or split.";

  return `${label}: hover explanation for this PropHit drawer metric.`;
};

function Metric({ label, value, color = tone.white, sub, tooltip }) {
  const tip = tooltip || getMetricTooltip(label);
  return (
    <div style={{ ...styles.metric, cursor: "help" }} title={tip} aria-label={tip}>
      <div style={styles.metricLabel}>{label} <span style={{ color: "#38bdf8" }}>ⓘ</span></div>
      <div style={{ ...styles.metricValue, color }}>{value}</div>
      {sub ? <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>{sub}</div> : null}
    </div>
  );
}

function SplitMetric({ label, avg, ab, hits, note, tooltip }) {
  return (
    <Metric
      label={label}
      value={fmtNum(avg, 3)}
      color={getAvgTone(avg)}
      sub={
        ab !== undefined || hits !== undefined
          ? `${hits ?? "—"} H / ${ab ?? "—"} AB${note ? ` • ${note}` : ""}`
          : note
      }
      tooltip={tooltip || `${getMetricTooltip(label)} Sample shown as hits divided by at-bats when H/AB is available.`}
    />
  );
}

function BattingAverageSplitLab({ player }) {
  const oppHand = player.opp_pitcher_hand === "L" ? "LHP" : "RHP";
  const oppAvg =
    player.opp_pitcher_hand === "L"
      ? player.last100ab_avg_vs_lhp ?? player.last100_avg_vs_lhp
      : player.last100ab_avg_vs_rhp ?? player.last100_avg_vs_rhp;

  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>Batting Average Split Drilldown</div>
      <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 12 }}>
        AVG = hits divided by at-bats. Recent windows are AB-based where labeled. Opponent-hand cards use the
        real MLB handedness split anchor plus recent AB form to avoid mirrored fake split values.
      </div>

      <div style={{ ...styles.sectionTitle, marginTop: 8 }}>Overall AVG Windows</div>
      <div style={styles.metricGrid}>
        <SplitMetric label="Last 7 Games AVG" avg={player.last7_hits_per_ab} ab={player.last7_ab} hits={player.last7_hits} />
        <SplitMetric label="Last 15 AB AVG" avg={player.last15_hits_per_ab} ab={player.last15_ab} hits={player.last15_hits} />
        <SplitMetric label="Last 30 AB AVG" avg={player.last30_hits_per_ab} ab={player.last30_ab} hits={player.last30_hits} />
        <SplitMetric label="Last 50 AB AVG" avg={player.last50_hits_per_ab} ab={player.last50_ab} hits={player.last50_hits} />
        <SplitMetric label="Last 100 AB AVG" avg={player.last100_hits_per_ab} ab={player.last100_ab} hits={player.last100_hits} />
        <SplitMetric label="Last 200 AB AVG" avg={player.last200_hits_per_ab} ab={player.last200_ab} hits={player.last200_hits} />
        <SplitMetric label="Season AVG" avg={getSeasonAvg(player)} ab={player.season_ab} hits={player.season_hits} />
        <SplitMetric label="Model AVG" avg={player.model_avg ?? player.final_hit_rate} note="predictive" />
        <SplitMetric label="Model - Market" avg={player.model_vs_market_avg_delta} note="delta" />
        <SplitMetric label="3-Year AVG" avg={player.hits_per_ab_3yr} ab={player.ab_3yr} hits={player.hits_3yr} />
      </div>

      <div style={{ ...styles.sectionTitle, marginTop: 18 }}>Today&apos;s Pitcher-Hand Matchup</div>
      <div style={styles.metricGrid}>
        <SplitMetric label={`Vs ${oppHand} Model AVG`} avg={oppAvg} note="current matchup hand" />
        <SplitMetric label={`Vs ${oppHand} Season AVG`} avg={player.split_hits_per_ab_season_vs_opp_hand} ab={player.split_ab_season_vs_opp_hand} hits={player.split_hits_season_vs_opp_hand} />
        <SplitMetric label={`Vs ${oppHand} 3-Year AVG`} avg={player.split_hits_per_ab_3yr_vs_opp_hand} ab={player.split_ab_3yr_vs_opp_hand} hits={player.split_hits_3yr_vs_opp_hand} />
        <SplitMetric label={`Vs ${oppHand} Last 100 AB Proxy`} avg={player.split_hits_per_ab_last100_vs_opp_hand} ab={player.split_ab_last100_vs_opp_hand} hits={player.split_hits_last100_vs_opp_hand} />
      </div>

      <div style={{ ...styles.sectionTitle, marginTop: 18 }}>Vs LHP AVG</div>
      <div style={styles.metricGrid}>
        <SplitMetric label="Last 50 AB AVG" avg={player.last50ab_avg_vs_lhp ?? player.last50_avg_vs_lhp} note="AB blend" />
        <SplitMetric label="Last 100 AB AVG" avg={player.last100ab_avg_vs_lhp ?? player.last100_avg_vs_lhp} note="AB blend" />
        <SplitMetric label="Last 200 AB AVG" avg={player.last200ab_avg_vs_lhp} note="AB blend" />
        <SplitMetric label="Season AVG" avg={player.season_avg_vs_lhp} ab={player.real_ab_vs_lhp_season} hits={player.real_hits_vs_lhp_season} />
        <SplitMetric label="3-Year AVG" avg={player.three_year_avg_vs_lhp} ab={player.real_ab_vs_lhp_3yr} hits={player.real_hits_vs_lhp_3yr} />
        <SplitMetric label="Career AVG" avg={player.alltime_avg_vs_lhp} ab={player.real_ab_vs_lhp_career} hits={player.real_hits_vs_lhp_career} />
      </div>

      <div style={{ ...styles.sectionTitle, marginTop: 18 }}>Vs RHP AVG</div>
      <div style={styles.metricGrid}>
        <SplitMetric label="Last 50 AB AVG" avg={player.last50ab_avg_vs_rhp ?? player.last50_avg_vs_rhp} note="AB blend" />
        <SplitMetric label="Last 100 AB AVG" avg={player.last100ab_avg_vs_rhp ?? player.last100_avg_vs_rhp} note="AB blend" />
        <SplitMetric label="Last 200 AB AVG" avg={player.last200ab_avg_vs_rhp} note="AB blend" />
        <SplitMetric label="Season AVG" avg={player.season_avg_vs_rhp} ab={player.real_ab_vs_rhp_season} hits={player.real_hits_vs_rhp_season} />
        <SplitMetric label="3-Year AVG" avg={player.three_year_avg_vs_rhp} ab={player.real_ab_vs_rhp_3yr} hits={player.real_hits_vs_rhp_3yr} />
        <SplitMetric label="Career AVG" avg={player.alltime_avg_vs_rhp} ab={player.real_ab_vs_rhp_career} hits={player.real_hits_vs_rhp_career} />
      </div>
    </div>
  );
}



function playerNameSlug(name) {
  return encodeURIComponent(String(name || "").trim().replace(/\s+/g, " "));
}

function mlbPlayerUrl(player) {
  return player?.player_id ? `https://www.mlb.com/player/${player.player_id}` : null;
}


function baseballRefSearchUrl(player) {
  return `https://www.baseball-reference.com/search/search.fcgi?search=${playerNameSlug(player?.player || "")}`;
}


function PlayerLinkButton({ label, tooltip, href, style }) {
  const [hovered, setHovered] = useState(false);
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={tooltip}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{
        ...styles.playerLinkBtn,
        ...style,
        ...(hovered ? styles.playerLinkBtnHover : {}),
      }}
    >
      {label}
      {hovered ? <span style={styles.playerLinkTooltip}>{tooltip}</span> : null}
    </a>
  );
}

function PlayerLinks({ player }) {
  const links = [
    {
      label: "M",
      tooltip: "Open MLB profile",
      href: mlbPlayerUrl(player),
      style: styles.playerLinkMLB,
    },
    {
      label: "B",
      tooltip: "Open Baseball Reference search",
      href: baseballRefSearchUrl(player),
      style: styles.playerLinkBR,
    },
  ].filter((x) => x.href);

  return (
    <span style={styles.playerLinks} onClick={(e) => e.stopPropagation()}>
      {links.map((x) => (
        <PlayerLinkButton
          key={x.label}
          label={x.label}
          tooltip={x.tooltip}
          href={x.href}
          style={x.style}
        />
      ))}
    </span>
  );
}



function TopPlayCard({ row, index, onOpen }) {
  return (
    <div style={styles.topPlayItem}>
      <div style={styles.rankBadge}>#{index + 1}</div>
      <div style={{ minWidth: 0 }}>
        <button style={{ ...styles.playerBtn, fontSize: 15 }} onClick={() => onOpen(row)}>
          {row.player}
        </button>
        <div style={styles.tinyText}>
          {row.team} vs {formatOpponent(row)} • {row.game_time_et} • Order {getOrder(row) ?? "—"}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ color: getTierTone(row.best_bet_tier), fontWeight: 1000 }}>
          {row.best_bet_tier || (row.elite_play_tag ? "A" : row.strong_play_tag ? "B" : "—")}
        </div>
        <div style={styles.tinyText}>{fmtPct(row.one_plus_hit_probability)}</div>
      </div>
    </div>
  );
}

function Drawer({ player, onClose }) {
  const [showAvgSplitLab, setShowAvgSplitLab] = useState(false);

  if (!player) return null;

  const order = getOrder(player);
  const source = player.lineup_spot_num
    ? "Confirmed MLB lineup"
    : player.fallback_batting_order
      ? "Fallback recent order"
      : "No lineup order";

  return (
    <div style={styles.drawerBackdrop} onClick={onClose}>
      <aside style={styles.drawer} onClick={(e) => e.stopPropagation()}>
        <div style={styles.drawerHeader}>
          <div style={styles.drawerTop}>
            <div>
              <h2 style={styles.drawerTitle}>{player.player}</h2>
              <div style={{ color: "#94a3b8", marginTop: 8 }}>
                {player.team} vs {formatOpponent(player)} • {player.game_time_et} • {player.bats || "—"} vs{" "}
                {player.opp_pitcher_hand || "—"}HP • {source}
              </div>
              <div style={{ ...styles.tagRow, marginTop: 10 }}>
                {player.elite_play_tag ? <Tag color={tone.yellow}>Elite</Tag> : null}
                {player.strong_play_tag ? <Tag color={tone.green}>Strong</Tag> : null}
                {player.fade_risk_tag ? <Tag color={tone.red}>Risk</Tag> : null}
                {player.projection_locked ? <Tag color={tone.blue}>Locked</Tag> : null}
                {player.game_started ? <Tag color={tone.yellow}>Started</Tag> : null}
                <button
                  style={{ ...styles.openBtn, padding: "6px 10px" }}
                  onClick={() => setShowAvgSplitLab((p) => !p)}
                >
                  {showAvgSplitLab ? "Hide AVG Drilldown" : "AVG Split Drilldown"}
                </button>
              </div>
            </div>
            <button style={styles.closeBtn} onClick={onClose}>
              ×
            </button>
          </div>
        </div>

        <div style={styles.metricGrid}>
          <Metric label="Lineup Order" value={order ?? "—"} color={getOrderTone(order)} sub={source} />
          <Metric label="Projected AB" value={fmtNum(player.projected_ab, 2)} color={getABTone(player.projected_ab)} />
          <Metric label="Projected Hits" value={fmtNum(player.projected_hits, 2)} color={getScoreTone(player.hit_score)} />
          <Metric label="Season AVG" value={fmtNum(getSeasonAvg(player), 3)} color={getAvgTone(getSeasonAvg(player))} />
          <Metric label="Model AVG" value={fmtNum(player.model_avg ?? player.final_hit_rate, 3)} color={getAvgTone(player.model_avg ?? player.final_hit_rate)} />
          <Metric label="Model - Market" value={fmtAvgDelta(player.model_vs_market_avg_delta)} color={(toNum(player.model_vs_market_avg_delta) ?? 0) >= 0 ? tone.green : tone.red} />
          <Metric label="1+ Hit %" value={fmtPct(player.one_plus_hit_probability)} color={getProbTone(player.one_plus_hit_probability)} />
          <Metric label="Confidence" value={fmtNum(player.confidence_score, 0)} color={getConfTone(player.confidence_score)} />
          <Metric label="Best Bet Tier" value={player.best_bet_tier || "—"} color={getTierTone(player.best_bet_tier)} />
          <Metric label="Status" value={player.status_label || (player.projection_locked ? "Locked" : player.is_confirmed_starter ? "Confirmed" : "Projected")} color={player.projection_locked ? tone.yellow : tone.green} sub={player.freeze_status} />
        </div>

        <div style={styles.drawerGrid}>
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Why It Grades Well</div>
            <ul style={{ margin: 0, paddingLeft: 20, color: "#cbd5e1" }}>
              {Array.isArray(player.why_it_grades_well) && player.why_it_grades_well.length ? (
                player.why_it_grades_well.map((x, i) => <li key={i}>{x}</li>)
              ) : (
                <li style={{ color: "#64748b" }}>No positive notes available.</li>
              )}
            </ul>
          </div>

          <div style={styles.section}>
            <div style={styles.sectionTitle}>Risk Factors</div>
            <ul style={{ margin: 0, paddingLeft: 20, color: "#cbd5e1" }}>
              {Array.isArray(player.risk_factors) && player.risk_factors.length ? (
                player.risk_factors.map((x, i) => <li key={i}>{x}</li>)
              ) : (
                <li style={{ color: "#64748b" }}>No major risk notes.</li>
              )}
            </ul>
          </div>

          <div style={styles.section}>
            <div style={styles.sectionTitle}>Recent Form</div>
            <div style={styles.metricGrid}>
              <Metric label="Last 7 AVG" value={fmtNum(player.last7_hits_per_ab, 3)} color={getAvgTone(player.last7_hits_per_ab)} />
              <Metric label="Last 15 AB AVG" value={fmtNum(player.last15_hits_per_ab, 3)} color={getAvgTone(player.last15_hits_per_ab)} />
              <Metric label="Last 30 AB AVG" value={fmtNum(player.last30_hits_per_ab, 3)} color={getAvgTone(player.last30_hits_per_ab)} />
              <Metric label="Last 50 AB AVG" value={fmtNum(player.last50_hits_per_ab, 3)} color={getAvgTone(player.last50_hits_per_ab)} />
              <Metric label="Last 100 AB AVG" value={fmtNum(player.last100_hits_per_ab, 3)} color={getAvgTone(player.last100_hits_per_ab)} />
              <Metric label="Last 200 AB AVG" value={fmtNum(player.last200_hits_per_ab, 3)} color={getAvgTone(player.last200_hits_per_ab)} />
              <Metric label="Season AVG" value={fmtNum(getSeasonAvg(player), 3)} color={getAvgTone(getSeasonAvg(player))} />
              <Metric label="Model AVG" value={fmtNum(player.model_avg ?? player.final_hit_rate, 3)} color={getAvgTone(player.model_avg ?? player.final_hit_rate)} />
              <Metric label="Model - Market" value={fmtAvgDelta(player.model_vs_market_avg_delta)} color={(toNum(player.model_vs_market_avg_delta) ?? 0) >= 0 ? tone.green : tone.red} sub="positive = model above season avg" />
            </div>
          </div>

          <div style={styles.section}>
            <div style={styles.sectionTitle}>Matchup</div>
            <div style={styles.metricGrid}>
              <Metric
                label="Pitcher"
                value={player.opp_pitcher || "—"}
                color={tone.white}
                sub={player.opp_pitcher_hand ? `${player.opp_pitcher_hand}HP` : "Hand unknown"}
                tooltip="Today’s opposing starting pitcher and throwing hand. RHP = right-handed pitcher, LHP = left-handed pitcher."
              />
              <Metric label="Pitcher K Rate" value={fmtPct(player.opp_pitcher_k_rate)} color={tone.blue} />
              <Metric label="P Season BAA vs LHB" value={fmtNum(getPitcherBAASeasonVsLHB(player), 3)} color={getAvgTone(getPitcherBAASeasonVsLHB(player))} tooltip="Opposing pitcher season batting average allowed against left-handed batters." />
              <Metric label="P Season BAA vs RHB" value={fmtNum(getPitcherBAASeasonVsRHB(player), 3)} color={getAvgTone(getPitcherBAASeasonVsRHB(player))} tooltip="Opposing pitcher season batting average allowed against right-handed batters." />
              <Metric label="P Career BAA vs LHB" value={fmtNum(getPitcherBAACareerVsLHB(player), 3)} color={getAvgTone(getPitcherBAACareerVsLHB(player))} tooltip="Opposing pitcher career batting average allowed against left-handed batters." />
              <Metric label="P Career BAA vs RHB" value={fmtNum(getPitcherBAACareerVsRHB(player), 3)} color={getAvgTone(getPitcherBAACareerVsRHB(player))} tooltip="Opposing pitcher career batting average allowed against right-handed batters." />
              <Metric label="Pinch Risk" value={fmtNum(player.pinch_hit_risk, 2)} color={tone.yellow} />
              <Metric label="Matchup Score" value={fmtNum(player.matchup_score, 0)} color={getScoreTone(player.matchup_score)} />
              <Metric label="Split Reliability" value={fmtNum(player.split_reliability_score, 0)} color={getConfTone(player.split_reliability_score)} />
              <Metric label="Fair Odds" value={fmtOdds(player.fair_odds_american)} color={getProbTone(player.one_plus_hit_probability)} />
            </div>
          </div>

          <div style={styles.section}>
            <div style={styles.sectionTitle}>Splits vs LHP</div>
            <div style={styles.metricGrid}>
              <Metric label="Last 50 AB" value={fmtNum(player.last50ab_avg_vs_lhp ?? player.last50_avg_vs_lhp, 3)} color={getAvgTone(player.last50ab_avg_vs_lhp ?? player.last50_avg_vs_lhp)} />
              <Metric label="Last 100 AB" value={fmtNum(player.last100ab_avg_vs_lhp ?? player.last100_avg_vs_lhp, 3)} color={getAvgTone(player.last100ab_avg_vs_lhp ?? player.last100_avg_vs_lhp)} />
              <Metric label="Last 200 AB" value={fmtNum(player.last200ab_avg_vs_lhp, 3)} color={getAvgTone(player.last200ab_avg_vs_lhp)} />
              <Metric label="Season" value={fmtNum(player.season_avg_vs_lhp, 3)} color={getAvgTone(player.season_avg_vs_lhp)} />
              <Metric label="3-Year" value={fmtNum(player.three_year_avg_vs_lhp, 3)} color={getAvgTone(player.three_year_avg_vs_lhp)} />
              <Metric label="All-Time" value={fmtNum(player.alltime_avg_vs_lhp, 3)} color={getAvgTone(player.alltime_avg_vs_lhp)} />
            </div>
          </div>

          <div style={styles.section}>
            <div style={styles.sectionTitle}>Splits vs RHP</div>
            <div style={styles.metricGrid}>
              <Metric label="Last 50 AB" value={fmtNum(player.last50ab_avg_vs_rhp ?? player.last50_avg_vs_rhp, 3)} color={getAvgTone(player.last50ab_avg_vs_rhp ?? player.last50_avg_vs_rhp)} />
              <Metric label="Last 100 AB" value={fmtNum(player.last100ab_avg_vs_rhp ?? player.last100_avg_vs_rhp, 3)} color={getAvgTone(player.last100ab_avg_vs_rhp ?? player.last100_avg_vs_rhp)} />
              <Metric label="Last 200 AB" value={fmtNum(player.last200ab_avg_vs_rhp, 3)} color={getAvgTone(player.last200ab_avg_vs_rhp)} />
              <Metric label="Season" value={fmtNum(player.season_avg_vs_rhp, 3)} color={getAvgTone(player.season_avg_vs_rhp)} />
              <Metric label="3-Year" value={fmtNum(player.three_year_avg_vs_rhp, 3)} color={getAvgTone(player.three_year_avg_vs_rhp)} />
              <Metric label="All-Time" value={fmtNum(player.alltime_avg_vs_rhp, 3)} color={getAvgTone(player.alltime_avg_vs_rhp)} />
            </div>
          </div>

          {showAvgSplitLab ? <BattingAverageSplitLab player={player} /> : null}
        </div>
      </aside>
    </div>
  );
}

const columns = [
  ["player", "Player", "Player name. Click to open the right-side drilldown drawer."],
  ["team", "Team", "Player team for today's matchup."],
  ["opp", "Opp", "Opponent team for today's matchup."],
  ["game_time_et", "Time", "Scheduled first pitch time in Eastern Time."],
  ["order_display", "Order", "Confirmed batting order when available, otherwise fallback recent lineup estimate."],
  ["bats", "Batter Hand", "Batter handedness: L = left, R = right, S = switch hitter."],
  ["opp_pitcher", "Pitcher", "Expected opposing starting pitcher."],
  ["opp_pitcher_hand", "Pitcher Hand", "Opposing pitcher throwing hand."],
  ["pitcher_baa_vs_lhb_season", "P Season vs LHB", "Opposing pitcher season batting average allowed against left-handed batters."],
  ["pitcher_baa_vs_rhb_season", "P Season vs RHB", "Opposing pitcher season batting average allowed against right-handed batters."],
  ["pitcher_baa_vs_lhb_career", "P Career vs LHB", "Opposing pitcher career batting average allowed against left-handed batters."],
  ["pitcher_baa_vs_rhb_career", "P Career vs RHB", "Opposing pitcher career batting average allowed against right-handed batters."],
  ["pitcher_season_baa_allowed_vs_batter_hand", "P Season BAA vs Bat Hand", "Opposing pitcher season batting average allowed against this batter's handedness."],
  ["season_avg_vs_lhp", "Season vs LHP", "Season batting average against left-handed pitching."],
  ["season_avg_vs_rhp", "Season vs RHP", "Season batting average against right-handed pitching."],
  ["alltime_avg_vs_lhp", "Career vs LHP", "Career batting average against left-handed pitching."],
  ["alltime_avg_vs_rhp", "Career vs RHP", "Career batting average against right-handed pitching."],
  ["projected_ab", "AB", "Projected at-bats for this game based on lineup spot and opportunity."],
  ["projected_hits", "Hits", "Projected hits for this game."],
  ["season_market_avg", "Season AVG", "Official/raw season batting average: season hits divided by season at-bats."],
  ["season_avg_vs_pitcher_hand", "Season vs Hand", "Season batting average against the handedness of today's opposing pitcher."],
  ["model_avg", "Model AVG", "Predictive model batting average after blending skill, recent form, matchup, and split context."],
  ["model_vs_market_avg_delta", "Δ AVG", "Model AVG minus Season AVG. Positive means the model is above the season baseline."],
  ["one_plus_hit_probability", "1+ Hit", "Projected probability the player records at least one hit today."],
  ["fair_odds_american", "Fair Odds", "Fair American odds based on the model's 1+ hit probability."],
  ["hit_score", "Hit Score", "Overall PropHit score for today's 1+ hit profile."],
  ["confidence_letter", "Conf", "Confidence letter grade. Key: A 80+, B 70-79, C 60-69, D 45-59, F below 45."],
  ["confidence_score", "Conf Score", "Confidence score based on lineup, sample size, split reliability, and model stability."],
];

const initialFilters = {
  search: "",
  minProb: "",
  minScore: "",
  minConfidence: "",
  minSeasonAvgVsHand: "",
  minPitcherSeasonBAAAllowedVsBatterHand: "",
  maxOrder: "",
  confirmedOnly: false,
  strongOnly: false,
  eliteOnly: false,
};

const exportColumns = [
  ["player", "Player"],
  ["team", "Team"],
  ["opp", "Opponent"],
  ["game_time_et", "Game Time ET"],
  ["order_display", "Batting Order"],
  ["bats", "Batter Hand"],
  ["opp_pitcher", "Opp Pitcher"],
  ["opp_pitcher_hand", "Pitcher Hand"],
  ["pitcher_baa_vs_lhb_season", "Pitcher Season BAA vs LHB"],
  ["pitcher_baa_vs_rhb_season", "Pitcher Season BAA vs RHB"],
  ["pitcher_baa_vs_lhb_career", "Pitcher Career BAA vs LHB"],
  ["pitcher_baa_vs_rhb_career", "Pitcher Career BAA vs RHB"],
  ["season_avg_vs_lhp", "Season AVG vs LHP"],
  ["season_avg_vs_rhp", "Season AVG vs RHP"],
  ["alltime_avg_vs_lhp", "Career AVG vs LHP"],
  ["alltime_avg_vs_rhp", "Career AVG vs RHP"],
  ["projected_ab", "Projected AB"],
  ["projected_hits", "Projected Hits"],
  ["season_market_avg", "Season AVG"],
  ["season_avg_vs_pitcher_hand", "Season AVG vs Pitcher Hand"],
  ["model_avg", "Model AVG"],
  ["model_vs_market_avg_delta", "Model - Season AVG"],
  ["one_plus_hit_probability", "1+ Hit Probability"],
  ["fair_odds_american", "Fair Odds"],
  ["hit_score", "Hit Score"],
  ["confidence_score", "Confidence"],
  ["tags_export", "Tags"],
];

const excelEscape = (value) => {
  const raw = value === null || value === undefined ? "" : String(value);
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

const getTags = (row) =>
  [
    row.elite_play_tag ? "Elite" : null,
    row.strong_play_tag ? "Strong" : null,
    row.fade_risk_tag ? "Risk" : null,
    row.projection_locked ? "Locked" : null,
    row.game_started ? "Started" : null,
  ]
    .filter(Boolean)
    .join(", ");

const formatExportValue = (row, key) => {
  if (key === "tags_export") return getTags(row);
  if (["projected_ab", "projected_hits"].includes(key)) return fmtNum(row[key], 2);
  if (["season_market_avg", "season_avg_vs_lhp", "season_avg_vs_rhp", "season_avg_vs_pitcher_hand", "alltime_avg_vs_lhp", "alltime_avg_vs_rhp", "pitcher_baa_vs_lhb_season", "pitcher_baa_vs_rhb_season", "pitcher_baa_vs_lhb_career", "pitcher_baa_vs_rhb_career", "pitcher_season_baa_allowed_vs_batter_hand", "model_avg"].includes(key)) return fmtNum(key === "season_avg_vs_pitcher_hand" ? (row[key] ?? getSeasonAvgVsPitcherHand(row)) : key === "season_market_avg" ? getSeasonAvg(row) : key === "alltime_avg_vs_lhp" ? getCareerAvgVsLHP(row) : key === "alltime_avg_vs_rhp" ? getCareerAvgVsRHP(row) :
    key === "pitcher_baa_vs_lhb_season" ? getPitcherBAASeasonVsLHB(row) :
    key === "pitcher_baa_vs_rhb_season" ? getPitcherBAASeasonVsRHB(row) :
    key === "pitcher_baa_vs_lhb_career" ? getPitcherBAACareerVsLHB(row) :
    key === "pitcher_baa_vs_rhb_career" ? getPitcherBAACareerVsRHB(row) :
    row[key], 3);
  if (key === "model_vs_market_avg_delta") return fmtAvgDelta(row[key]);
  if (key === "one_plus_hit_probability") return fmtPct(row[key]);
  if (key === "fair_odds_american") return fmtOdds(row[key]);
  if (key === "hit_score") return fmtNum(row[key], 1);
  if (key === "confidence_score") return fmtNum(row[key], 0);
  if (key === "opp") return formatOpponent(row);
  if (key === "confidence_letter") return getConfidenceLetter(row.confidence_score);
  return row[key] ?? "";
};

const getDisplayValue = (row, key) => {
  if (key === "opp") return formatOpponent(row);
  if (key === "confidence_letter") return getConfidenceLetter(row.confidence_score);
  if (key === "season_market_avg") return getSeasonAvg(row);
  if (key === "season_avg_vs_pitcher_hand") return row?.season_avg_vs_pitcher_hand ?? getSeasonAvgVsPitcherHand(row);
  if (key === "alltime_avg_vs_lhp") return getCareerAvgVsLHP(row);
  if (key === "alltime_avg_vs_rhp") return getCareerAvgVsRHP(row);
  if (key === "pitcher_baa_vs_lhb_season") return getPitcherBAASeasonVsLHB(row);
  if (key === "pitcher_baa_vs_rhb_season") return getPitcherBAASeasonVsRHB(row);
  if (key === "pitcher_baa_vs_lhb_career") return getPitcherBAACareerVsLHB(row);
  if (key === "pitcher_baa_vs_rhb_career") return getPitcherBAACareerVsRHB(row);
  if (key === "pitcher_season_baa_allowed_vs_batter_hand") return getPitcherSeasonBAAAllowedVsBatterHand(row);
  return row?.[key];
};


const columnWidths = {
  player: 250,
  team: 80,
  opp: 80,
  game_time_et: 100,
  order_display: 90,
  bats: 110,
  opp_pitcher: 235,
  opp_pitcher_hand: 105,
  pitcher_baa_vs_lhb_season: 135,
  pitcher_baa_vs_rhb_season: 135,
  pitcher_baa_vs_lhb_career: 135,
  pitcher_baa_vs_rhb_career: 135,
  season_avg_vs_lhp: 125,
  season_avg_vs_rhp: 125,
  alltime_avg_vs_lhp: 125,
  alltime_avg_vs_rhp: 125,
  projected_ab: 85,
  projected_hits: 95,
  season_market_avg: 120,
  season_avg_vs_pitcher_hand: 135,
  model_avg: 115,
  model_vs_market_avg_delta: 100,
  one_plus_hit_probability: 105,
  fair_odds_american: 120,
  hit_score: 110,
  confidence_letter: 85,
  confidence_score: 115,
};

const LOCK_COL_WIDTH = 86;
const TAG_COL_WIDTH = 155;
const BOARD_TABLE_WIDTH =
  LOCK_COL_WIDTH +
  TAG_COL_WIDTH +
  columns.reduce((sum, [key]) => sum + (columnWidths[key] || 110), 0);

const stickyColumnKeys = ["player", "team", "opp", "game_time_et"];

const stickyLeftByKey = {
  player: LOCK_COL_WIDTH,
  team: LOCK_COL_WIDTH + columnWidths.player,
  opp: LOCK_COL_WIDTH + columnWidths.player + columnWidths.team,
  game_time_et: LOCK_COL_WIDTH + columnWidths.player + columnWidths.team + columnWidths.opp,
};

const stickyZByKey = {
  player: 58,
  team: 57,
  opp: 56,
  game_time_et: 55,
};

function stickyHeaderStyleForKey(key) {
  if (!stickyColumnKeys.includes(key)) return {};
  return {
    position: "sticky",
    left: stickyLeftByKey[key],
    zIndex: stickyZByKey[key],
    background: "#0b2047",
    boxShadow: "8px 0 18px rgba(0,0,0,.24)",
  };
}

function stickyCellStyleForKey(key) {
  if (!stickyColumnKeys.includes(key)) return {};
  return {
    position: "sticky",
    left: stickyLeftByKey[key],
    zIndex: stickyZByKey[key] - 20,
    background: "rgba(2,6,23,.98)",
    boxShadow: "8px 0 18px rgba(0,0,0,.20)",
  };
}

const formatTableValue = (row, key) => {
  const v = getDisplayValue(row, key);
  if (key === "one_plus_hit_probability") return fmtPct(v);
  if (key === "fair_odds_american") return fmtOdds(v);
  if (["projected_ab", "projected_hits"].includes(key)) return fmtNum(v, 2);
  if (["season_market_avg", "season_avg_vs_lhp", "season_avg_vs_rhp", "season_avg_vs_pitcher_hand", "alltime_avg_vs_lhp", "alltime_avg_vs_rhp", "pitcher_baa_vs_lhb_season", "pitcher_baa_vs_rhb_season", "pitcher_baa_vs_lhb_career", "pitcher_baa_vs_rhb_career", "pitcher_season_baa_allowed_vs_batter_hand", "model_avg"].includes(key)) return fmtNum(v, 3);
  if (key === "model_vs_market_avg_delta") return fmtAvgDelta(v);
  if (key === "hit_score") return fmtNum(v, 1);
  if (key === "confidence_score") return fmtNum(v, 0);
  return v ?? "—";
};

const tableValueColor = (row, key) => {
  const v = getDisplayValue(row, key);
  if (key === "one_plus_hit_probability") return getProbTone(v);
  if (key === "hit_score") return getScoreTone(v);
  if (key === "confidence_score") return getConfTone(v);
  if (key === "projected_ab") return getABTone(v);
  if (["season_market_avg", "season_avg_vs_lhp", "season_avg_vs_rhp", "season_avg_vs_pitcher_hand", "alltime_avg_vs_lhp", "alltime_avg_vs_rhp", "pitcher_baa_vs_lhb_season", "pitcher_baa_vs_rhb_season", "pitcher_baa_vs_lhb_career", "pitcher_baa_vs_rhb_career", "pitcher_season_baa_allowed_vs_batter_hand", "model_avg"].includes(key)) return getAvgTone(v);
  if (key === "model_vs_market_avg_delta") return getDeltaTone(v);
  if (key === "order_display") return getOrderTone(v);
  return undefined;
};

function BoardTable({
  rows,
  sortKey,
  sortDir,
  handleSort,
  lockedRows,
  toggleRowLock,
  setSelected,
}) {
  return (
    <table style={{ ...styles.table, minWidth: BOARD_TABLE_WIDTH, tableLayout: "fixed" }}>
      <colgroup>
        <col style={{ width: LOCK_COL_WIDTH }} />
        {columns.map(([key]) => (
          <col key={key} style={{ width: columnWidths[key] || 110 }} />
        ))}
        <col style={{ width: TAG_COL_WIDTH }} />
      </colgroup>
      <thead>
        <tr>
          <th style={{ ...styles.th, ...styles.stickyViewHeader, width: LOCK_COL_WIDTH, maxWidth: LOCK_COL_WIDTH }}>
            LOCK
          </th>
          {columns.map(([key, label, tooltip]) => (
            <th
              key={key}
              style={{
                ...styles.th,
                ...stickyHeaderStyleForKey(key),
                width: columnWidths[key] || 110,
                maxWidth: columnWidths[key] || 110,
              }}
            >
              <SortButton
                label={label}
                colKey={key}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                tooltip={tooltip}
              />
            </th>
          ))}
          <th style={{ ...styles.th, width: TAG_COL_WIDTH, maxWidth: TAG_COL_WIDTH }}>Tags</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const rowKey = getRowKey(row, i);
          const locked = !!lockedRows[rowKey];

          return (
            <tr key={rowKey} style={{ ...styles.row, ...(locked ? styles.lockedRow : {}) }}>
              <td
                style={{
                  ...styles.td,
                  ...styles.stickyViewCell,
                  width: LOCK_COL_WIDTH,
                  maxWidth: LOCK_COL_WIDTH,
                }}
              >
                <button
                  style={{ ...styles.lockBtn, ...(locked ? styles.lockBtnActive : {}) }}
                  onClick={() => toggleRowLock(row, i)}
                  title={locked ? "Unlock row" : "Lock row to top"}
                >
                  <span style={{ ...styles.lockDot, ...(locked ? styles.lockDotActive : {}) }} />
                  {locked ? "ON" : "LOCK"}
                </button>
              </td>

              {columns.map(([key]) => {
                const isPlayer = key === "player";
                const color = tableValueColor(row, key);

                return (
                  <td
                    key={key}
                    style={{
                      ...styles.td,
                      ...stickyCellStyleForKey(key),
                      width: columnWidths[key] || 110,
                      maxWidth: columnWidths[key] || 110,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: color || styles.td.color,
                      fontWeight: color ? 900 : 500,
                    }}
                    title={String(formatTableValue(row, key))}
                  >
                    {isPlayer ? (
                      <div style={styles.playerNameWrap}>
                        <button style={styles.playerBtn} onClick={() => setSelected(row)}>
                          {row.player || "—"}
                        </button>
                        <PlayerLinks player={row} />
                      </div>
                    ) : (
                      formatTableValue(row, key)
                    )}
                  </td>
                );
              })}

              <td style={{ ...styles.td, width: TAG_COL_WIDTH, maxWidth: TAG_COL_WIDTH }}>
                <div style={styles.tagRow}>
                  {row.fade_risk_tag ? <Tag color={tone.red}>Risk</Tag> : null}
                  {row.elite_play_tag ? <Tag color={tone.yellow}>Elite</Tag> : null}
                  {row.strong_play_tag ? <Tag color={tone.green}>Strong</Tag> : null}
                  {row.projection_locked ? <Tag color={tone.blue}>Locked</Tag> : null}
                  {!row.fade_risk_tag && !row.elite_play_tag && !row.strong_play_tag && !row.projection_locked ? "—" : null}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}



function BoardPopout({ rows, onClose, lockedRows, toggleRowLock }) {
  const [columnFilters, setColumnFilters] = useState({});
  const [popSortKey, setPopSortKey] = useState("one_plus_hit_probability");
  const [popSortDir, setPopSortDir] = useState("desc");

  const popoutColumns = [
    ["team", "Tm", 42, "Player's team abbreviation."],
    ["opp", "Opp", 48, "Opponent team. @ means the opponent is home."],
    ["game_time_et", "Time", 60, "Scheduled first pitch time in Eastern Time."],
    ["order_display", "Ord", 40, "Batting order spot. Lower is usually better for plate appearances."],
    ["bats", "Bat", 40, "Batter handedness: L, R, or S."],
    ["opp_pitcher", "Pitcher", 105, "Today's opposing probable or confirmed starting pitcher."],
    ["opp_pitcher_hand", "PH", 36, "Opposing pitcher throwing hand."],
    ["pitcher_baa_vs_lhb_season", "P/Ls", 50, "Pitcher season batting average allowed against left-handed batters."],
    ["pitcher_baa_vs_rhb_season", "P/Rs", 50, "Pitcher season batting average allowed against right-handed batters."],
    ["pitcher_baa_vs_lhb_career", "P/Lc", 50, "Pitcher career batting average allowed against left-handed batters."],
    ["pitcher_baa_vs_rhb_career", "P/Rc", 50, "Pitcher career batting average allowed against right-handed batters."],
    ["season_avg_vs_lhp", "S/L", 50, "Season batting average against left-handed pitchers."],
    ["season_avg_vs_rhp", "S/R", 50, "Season batting average against right-handed pitchers."],
    ["alltime_avg_vs_lhp", "C/L", 50, "Career batting average against left-handed pitchers."],
    ["alltime_avg_vs_rhp", "C/R", 50, "Career batting average against right-handed pitchers."],
    ["projected_ab", "AB", 48, "Projected at-bats based on lineup spot and opportunity."],
    ["projected_hits", "Hits", 54, "Projected hits = projected AB multiplied by model hit rate."],
    ["season_market_avg", "S AVG", 58, "Raw season batting average baseline."],
    ["season_avg_vs_pitcher_hand", "VsH", 54, "Season AVG versus today's pitcher handedness."],
    ["model_avg", "M AVG", 58, "PropHit predictive AVG after form, splits, and matchup context."],
    ["model_vs_market_avg_delta", "Δ", 50, "Model AVG minus season AVG."],
    ["one_plus_hit_probability", "1+%", 58, "Probability player records at least one hit."],
    ["fair_odds_american", "Odds", 62, "Model-implied fair American odds."],
    ["hit_score", "Hit", 48, "Overall PropHit score."],
    ["confidence_score", "Conf", 54, "Confidence score based on lineup, sample, split reliability, and stability."],
  ];

  const cellValue = (row, key) => {
    if (key === "player") return row.player || "—";
    if (key === "opp") return formatOpponent(row);
    if (key === "one_plus_hit_probability") return fmtPct(getDisplayValue(row, key), 0);
    if (key === "fair_odds_american") return fmtOdds(getDisplayValue(row, key));
    if (key === "projected_ab") return fmtNum(getDisplayValue(row, key), 1);
    if (key === "projected_hits") return fmtNum(getDisplayValue(row, key), 2);
    if (["season_market_avg", "season_avg_vs_lhp", "season_avg_vs_rhp", "season_avg_vs_pitcher_hand", "alltime_avg_vs_lhp", "alltime_avg_vs_rhp", "pitcher_baa_vs_lhb_season", "pitcher_baa_vs_rhb_season", "pitcher_baa_vs_lhb_career", "pitcher_baa_vs_rhb_career", "pitcher_season_baa_allowed_vs_batter_hand", "model_avg"].includes(key)) {
      return fmtNum(getDisplayValue(row, key), 3);
    }
    if (key === "model_vs_market_avg_delta") return fmtAvgDelta(getDisplayValue(row, key));
    if (key === "hit_score") return fmtNum(getDisplayValue(row, key), 0);
    if (key === "confidence_score") return fmtNum(getDisplayValue(row, key), 0);
    return getDisplayValue(row, key) ?? "—";
  };

  const rawValue = (row, key) => key === "player" ? row.player || "" : getDisplayValue(row, key);

  const colorFor = (row, key) => {
    const value = rawValue(row, key);
    if (key === "one_plus_hit_probability") return getProbTone(value);
    if (key === "hit_score") return getScoreTone(value);
    if (key === "confidence_score") return getConfTone(value);
    if (["season_market_avg", "season_avg_vs_lhp", "season_avg_vs_rhp", "season_avg_vs_pitcher_hand", "alltime_avg_vs_lhp", "alltime_avg_vs_rhp", "pitcher_baa_vs_lhb_season", "pitcher_baa_vs_rhb_season", "pitcher_baa_vs_lhb_career", "pitcher_baa_vs_rhb_career", "pitcher_season_baa_allowed_vs_batter_hand", "model_avg"].includes(key)) return getAvgTone(value);
    if (key === "model_vs_market_avg_delta") return getDeltaTone(value);
    if (key === "projected_ab") return getABTone(value);
    return styles.td.color;
  };

  const setColumnFilter = (key, value) => {
    setColumnFilters((prev) => ({ ...prev, [key]: value }));
  };

  const passesFilter = (row, key, filterValue) => {
    const f = String(filterValue || "").trim().toLowerCase();
    if (!f) return true;

    const raw = rawValue(row, key);
    const display = String(cellValue(row, key) ?? "").toLowerCase();
    const numericRaw = toNum(raw);
    const numericFilter = toNum(f);

    const numericKeys = new Set([
      "order_display",
      "projected_ab",
      "projected_hits",
      "season_market_avg",
      "season_avg_vs_lhp",
      "season_avg_vs_rhp",
      "season_avg_vs_pitcher_hand",
      "alltime_avg_vs_lhp",
      "alltime_avg_vs_rhp",
      "pitcher_baa_vs_lhb_season",
      "pitcher_baa_vs_rhb_season",
      "pitcher_baa_vs_lhb_career",
      "pitcher_baa_vs_rhb_career",
      "model_avg",
      "model_vs_market_avg_delta",
      "one_plus_hit_probability",
      "fair_odds_american",
      "hit_score",
      "confidence_score",
    ]);

    if (numericKeys.has(key) && numericFilter !== null && numericRaw !== null) {
      return numericRaw >= numericFilter;
    }

    return display.includes(f) || String(raw ?? "").toLowerCase().includes(f);
  };

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (!passesFilter(row, "player", columnFilters.player)) return false;
      return popoutColumns.every(([key]) => passesFilter(row, key, columnFilters[key]));
    });
  }, [rows, columnFilters]);

  const sortedRows = useMemo(() => {
    const arr = [...filteredRows];
    arr.sort((a, b) => {
      const aLocked = lockedRows[getRowKey(a, 0)] ? 1 : 0;
      const bLocked = lockedRows[getRowKey(b, 0)] ? 1 : 0;
      if (aLocked !== bLocked) return bLocked - aLocked;

      const av = rawValue(a, popSortKey);
      const bv = rawValue(b, popSortKey);
      const an = toNum(av);
      const bn = toNum(bv);
      const result = an !== null && bn !== null ? an - bn : String(av ?? "").localeCompare(String(bv ?? ""));
      return popSortDir === "asc" ? result : -result;
    });
    return arr;
  }, [filteredRows, popSortKey, popSortDir, lockedRows]);

  const handleSort = (key) => {
    if (popSortKey === key) {
      setPopSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setPopSortKey(key);
      setPopSortDir("desc");
    }
  };

  const headerButton = (key, label, tooltip) => (
    <button
      onClick={() => handleSort(key)}
      title={`${tooltip} Click to sort.`}
      style={{
        background: "transparent",
        border: 0,
        color: popSortKey === key ? "#ffffff" : "#dbeafe",
        fontWeight: 1000,
        cursor: "pointer",
        fontSize: 9,
        padding: 0,
        textTransform: "uppercase",
        letterSpacing: ".08em",
      }}
    >
      {label}{popSortKey === key ? (popSortDir === "desc" ? " ▼" : " ▲") : ""}
    </button>
  );

  const filterInput = (key, tooltip) => (
    <input
      value={columnFilters[key] || ""}
      onChange={(e) => setColumnFilter(key, e.target.value)}
      placeholder="Filter"
      title={tooltip}
      style={styles.boardPopoutFilterInput}
    />
  );

  return (
    <div style={styles.boardPopoutBackdrop}>
      <div style={styles.boardPopoutShell}>
        <div style={styles.boardPopoutHeader}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={styles.boardPopoutTitle}>PropHit Board — Landscape View</div>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>
              Column filters • sortable headers • locked players pin to top • {sortedRows.length} visible rows
            </div>
          </div>
          <button style={styles.boardPopoutClose} onClick={() => setColumnFilters({})}>Clear Filters</button>
          <button style={styles.boardPopoutClose} onClick={onClose}>Close</button>
        </div>

        <div style={{ ...styles.boardPopoutScroll, overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              minWidth: 1750,
              tableLayout: "fixed",
              borderCollapse: "collapse",
              fontSize: 12,
            }}
          >
            <colgroup>
              <col style={{ width: 54 }} />
              <col style={{ width: 170 }} />
              {popoutColumns.map(([key, , width]) => (
                <col key={key} style={{ width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th style={{ ...styles.th, position: "sticky", left: 0, top: 0, zIndex: 80, width: 54, padding: "8px 4px", fontSize: 9 }}>
                  <span title="Lock a row to pin it to the top.">Lock</span>
                </th>
                <th style={{ ...styles.th, position: "sticky", left: 54, top: 0, zIndex: 79, width: 170, padding: "8px 5px", fontSize: 9 }}>
                  {headerButton("player", "Player", "Player name.")}
                  {filterInput("player", "Filter by player name.")}
                </th>
                {popoutColumns.map(([key, label, width, tooltip]) => (
                  <th key={key} style={{ ...styles.th, width, padding: "8px 3px", fontSize: 9, textAlign: "center", verticalAlign: "top" }}>
                    {headerButton(key, label, tooltip)}
                    {filterInput(key, tooltip)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, i) => {
                const key = getRowKey(row, i);
                const locked = !!lockedRows[key];

                return (
                  <tr key={key} style={{ ...styles.row, ...(locked ? styles.lockedRow : {}) }}>
                    <td style={{ ...styles.td, position: "sticky", left: 0, zIndex: 45, background: "rgba(2,6,23,.98)", padding: "7px 4px", width: 54 }}>
                      <button
                        style={{
                          ...styles.lockBtn,
                          ...(locked ? styles.lockBtnActive : {}),
                          width: 44,
                          height: 28,
                          fontSize: 9,
                          padding: 0,
                        }}
                        onClick={() => toggleRowLock(row, i)}
                        title={locked ? "Unlock row" : "Lock player"}
                      >
                        <span style={{ ...styles.lockDot, ...(locked ? styles.lockDotActive : {}) }} />
                      </button>
                    </td>

                    <td
                      style={{
                        ...styles.td,
                        position: "sticky",
                        left: 54,
                        zIndex: 44,
                        background: "rgba(2,6,23,.98)",
                        padding: "7px 6px",
                        width: 170,
                        maxWidth: 170,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: "#7dd3fc",
                        fontWeight: 1000,
                      }}
                      title={row.player || "—"}
                    >
                      {row.player || "—"}
                    </td>

                    {popoutColumns.map(([colKey, , width]) => (
                      <td
                        key={colKey}
                        style={{
                          ...styles.td,
                          width,
                          maxWidth: width,
                          padding: "7px 4px",
                          textAlign: "center",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          color: colorFor(row, colKey),
                          fontWeight: ["one_plus_hit_probability", "hit_score", "confidence_score", "model_avg", "model_vs_market_avg_delta", "projected_ab"].includes(colKey) ? 900 : 500,
                          fontSize: 12,
                        }}
                        title={String(cellValue(row, colKey))}
                      >
                        {cellValue(row, colKey)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}



function SlateStatusItem({ label, value }) {
  return (
    <div style={styles.slateStatusItem}>
      <span style={styles.slateStatusLabel}>{label}</span>
      <span style={styles.slateStatusValue}>{value}</span>
    </div>
  );
}

function SlateStatusBar({ rows, filteredRows, lastUpdated }) {
  const visibleRows = filteredRows || [];
  const gameCount = new Set(
    visibleRows.map((r) => r.game_pk || `${r.team}-${r.opp}-${r.game_time_et}`)
  ).size;
  const confirmedCount = visibleRows.filter((r) => r.lineup_spot_num || r.is_confirmed_starter).length;
  const topPlayCount = visibleRows.filter((r) => r.top_play_candidate || r.strong_play_tag || r.elite_play_tag).length;

  return (
    <div style={styles.slateStatusBar}>
      <SlateStatusItem label="Run Rule" value="Only games not started" />
      <SlateStatusItem label="Refresh Window" value="Hourly, 11 AM–10 PM ET" />
      <SlateStatusItem label="Last UI Refresh" value={lastUpdated || "—"} />
      <SlateStatusItem label="Visible Slate" value={`${visibleRows.length} players • ${gameCount} games`} />
      <SlateStatusItem label="Confirmed Lineups" value={`${confirmedCount} players`} />
      <SlateStatusItem label="Top/Strong Plays" value={`${topPlayCount} flagged`} />
    </div>
  );
}

function EmptySlateNotice() {
  return (
    <div style={styles.slateEmptyCard}>
      No active projections are currently showing. PropHit only displays games that have not started yet.
      If all games have started, the board will remain empty until the next eligible slate window.
      Scheduled model refreshes run hourly from 11:00 AM through 10:00 PM Eastern Time.
    </div>
  );
}

function buildWhyReasons(row) {
  const reasons = [];
  const order = toNum(getOrder(row));
  if (order !== null && order <= 2) reasons.push(`Premium lineup spot: batting ${order}`);
  else if (order !== null && order <= 5) reasons.push(`Playable lineup spot: batting ${order}`);

  const prob = toNum(row.one_plus_hit_probability);
  if (prob !== null && prob >= 0.68) reasons.push(`Strong 1+ hit probability: ${fmtPct(prob)}`);
  else if (prob !== null && prob >= 0.60) reasons.push(`Solid 1+ hit probability: ${fmtPct(prob)}`);

  const hitterVsHand = getSeasonAvgVsPitcherHand(row);
  if (toNum(hitterVsHand) !== null) reasons.push(`Hitter season AVG vs today's pitcher hand: ${fmtNum(hitterVsHand, 3)}`);

  const pitcherVsBatHand = getPitcherSeasonBAAAllowedVsBatterHand(row);
  if (toNum(pitcherVsBatHand) !== null) reasons.push(`Pitcher season BAA allowed vs batter side: ${fmtNum(pitcherVsBatHand, 3)}`);

  const modelDelta = toNum(row.model_vs_market_avg_delta);
  if (modelDelta !== null && modelDelta > 0) reasons.push(`Model AVG is ${fmtAvgDelta(modelDelta)} above season baseline`);

  const conf = toNum(row.confidence_score);
  if (conf !== null && conf >= 70) reasons.push(`Strong confidence profile: ${fmtNum(conf, 0)} (${getConfidenceLetter(conf)})`);

  if (!reasons.length) reasons.push("Ranks highly on the current PropHit blend of probability, matchup, and confidence.");
  return reasons.slice(0, 3);
}

function WhyThesePlaysPanel({ rows, onOpen }) {
  const plays = (rows || [])
    .filter((row) => row.top_play_candidate || row.strong_play_tag || row.elite_play_tag || toNum(row.one_plus_hit_probability) !== null)
    .slice(0, 5);

  return (
    <div style={styles.panel}>
      <div style={styles.panelTitle}>Why These Plays</div>
      {plays.length ? (
        <div style={styles.whyPlayList}>
          {plays.map((row, i) => (
            <div key={getRowKey(row, i)} style={styles.whyPlayCard}>
              <div style={styles.whyPlayHeader}>
                <button
                  style={{ ...styles.playerBtn, ...styles.whyPlayName, padding: 0 }}
                  onClick={() => onOpen(row)}
                  title="Open player drawer"
                >
                  {row.player || "—"}
                </button>
                <div style={styles.whyPlayProb}>{fmtPct(row.one_plus_hit_probability)}</div>
              </div>
              <div style={styles.whyReasonList}>
                {buildWhyReasons(row).map((reason, idx) => (
                  <div key={idx} style={styles.whyReasonItem}>
                    <span style={styles.whyBullet}>+</span>
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.45 }}>
          No visible plays meet the current filters. Clear filters or wait for the next eligible slate refresh.
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState(initialFilters);
  const [sortKey, setSortKey] = useState("one_plus_hit_probability");
  const [sortDir, setSortDir] = useState("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [performance, setPerformance] = useState(null);
  const [showTopOnly, setShowTopOnly] = useState(false);
  const [lockedRows, setLockedRows] = useState({});
  const [showBoardPopout, setShowBoardPopout] = useState(false);
  const topScrollRef = useRef(null);
  const tableScrollRef = useRef(null);

  const syncHorizontalScroll = (source) => {
    const topEl = topScrollRef.current;
    const tableEl = tableScrollRef.current;
    if (!topEl || !tableEl) return;
    if (source === "top") {
      tableEl.scrollLeft = topEl.scrollLeft;
    } else {
      topEl.scrollLeft = tableEl.scrollLeft;
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`${DATA_URL}?t=${Date.now()}`);
      if (!res.ok) throw new Error(`Unable to load ${DATA_URL}`);
      const payload = await res.json();
      const normalized = Array.isArray(payload)
        ? payload.map((r) => ({
            ...r,
            order_display: getOrder(r),
            espn_season_avg: r.espn_season_avg ?? r.season_hits_per_ab,
            season_market_avg: getSeasonAvg(r),
            market_avg: r.market_avg ?? getSeasonAvg(r),
            model_avg: r.model_avg ?? r.final_hit_rate,
            model_vs_market_avg_delta:
              r.model_vs_market_avg_delta ??
              ((toNum(r.model_avg ?? r.final_hit_rate) !== null && toNum(r.market_avg ?? getSeasonAvg(r)) !== null)
                ? toNum(r.model_avg ?? r.final_hit_rate) - toNum(r.market_avg ?? getSeasonAvg(r))
                : null),
            opp_display: formatOpponent(r),
            season_avg_vs_pitcher_hand: getSeasonAvgVsPitcherHand(r),
            confidence_letter: getConfidenceLetter(r.confidence_score),
          }))
        : [];
      setRows(normalized);
      setLastUpdated(new Date().toLocaleTimeString());

      try {
        const perfRes = await fetch(`${PERF_URL}?t=${Date.now()}`);
        if (perfRes.ok) {
          setPerformance(await perfRes.json());
        }
      } catch {
        setPerformance(null);
      }
    } catch (e) {
      setError(e?.message || "Failed to load PropHit data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const setFilter = (key, value) => {
    setFilters((p) => ({ ...p, [key]: value }));
  };

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((p) => (p === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const toggleRowLock = (row, index = 0) => {
    const key = getRowKey(row, index);
    setLockedRows((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const filtered = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    const minProb = toNum(filters.minProb);
    const minScore = toNum(filters.minScore);
    const minConf = toNum(filters.minConfidence);
    const minSeasonAvgVsHand = toNum(filters.minSeasonAvgVsHand);
    const maxOrder = toNum(filters.maxOrder);

    return rows.filter((r) => {
      const text = [r.player, r.team, r.opp, r.opp_pitcher].filter(Boolean).join(" ").toLowerCase();
      const order = toNum(r.order_display);
      if (search && !text.includes(search)) return false;
      if (minProb !== null && toNum(r.one_plus_hit_probability) !== null && r.one_plus_hit_probability < minProb) return false;
      if (minScore !== null && toNum(r.hit_score) !== null && r.hit_score < minScore) return false;
      if (minConf !== null && toNum(r.confidence_score) !== null && r.confidence_score < minConf) return false;
      if (minSeasonAvgVsHand !== null && toNum(r.season_avg_vs_pitcher_hand ?? getSeasonAvgVsPitcherHand(r)) !== null && toNum(r.season_avg_vs_pitcher_hand ?? getSeasonAvgVsPitcherHand(r)) < minSeasonAvgVsHand) return false;
      if (maxOrder !== null && order !== null && order > maxOrder) return false;
      if (filters.confirmedOnly && !r.lineup_spot_num) return false;
      if (filters.strongOnly && !r.strong_play_tag) return false;
      if (filters.eliteOnly && !r.elite_play_tag) return false;
      if (showTopOnly && !r.top_play_candidate && !r.strong_play_tag && !r.elite_play_tag) return false;
      return true;
    });
  }, [rows, filters, showTopOnly]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const aLocked = lockedRows[getRowKey(a, 0)] ? 1 : 0;
      const bLocked = lockedRows[getRowKey(b, 0)] ? 1 : 0;
      if (aLocked !== bLocked) return bLocked - aLocked;

      const av = a?.[sortKey];
      const bv = b?.[sortKey];
      const an = toNum(av);
      const bn = toNum(bv);
      const result = an !== null && bn !== null ? an - bn : String(av ?? "").localeCompare(String(bv ?? ""));
      return sortDir === "asc" ? result : -result;
    });
    return arr;
  }, [filtered, sortKey, sortDir, lockedRows]);

  const top = sorted[0];
  const confirmed = rows.filter((r) => r.lineup_spot_num).length;
  const strong = rows.filter((r) => r.strong_play_tag).length;
  const elite = rows.filter((r) => r.elite_play_tag).length;
  const topPlays = sorted
    .filter((r) => r.top_play_candidate || r.elite_play_tag || r.strong_play_tag)
    .slice(0, 5);

  const exportToExcel = () => {
    const headerHtml = exportColumns.map(([, label]) => `<th>${excelEscape(label)}</th>`).join("");
    const bodyHtml = sorted
      .map((row) => {
        const cells = exportColumns
          .map(([key]) => `<td>${excelEscape(formatExportValue(row, key))}</td>`)
          .join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");

    const html = `
      <html>
        <head>
          <meta charset="UTF-8" />
          <style>
            table { border-collapse: collapse; font-family: Arial, sans-serif; }
            th { background: #0b2047; color: white; font-weight: bold; }
            th, td { border: 1px solid #d9e2ef; padding: 6px 8px; white-space: nowrap; }
          </style>
        </head>
        <body>
          <table>
            <thead><tr>${headerHtml}</tr></thead>
            <tbody>${bodyHtml}</tbody>
          </table>
        </body>
      </html>`;

    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `prophit_board_${stamp}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={styles.app}>
      <div style={styles.page}>
                <header style={styles.header}>
          <div style={{ textAlign: "center", maxWidth: 920, margin: "0 auto" }}>
              <div style={styles.badge}>PropHit</div>
              <PropHitWordLogo />
              <div style={styles.subtitle}>MLB 1+ hit model dashboard</div>
              <div style={styles.modelStatement}>
                Daily MLB hitter model built to identify the strongest 1+ hit leans using projected at-bats,
                confirmed lineup position, recent form, pitcher handedness, season splits, and model-vs-market edge.
              </div>
          <div style={styles.modelRunNotice}>
            Only shows projections for games that have not started • Updates hourly from 11 AM – 10 PM ET
          </div>
            </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Tag color={tone.blue}>Updated {lastUpdated || "—"}</Tag>
            <button style={styles.button} onClick={loadData}>
              Refresh Data
            </button>
            <button
              style={{ ...styles.button, background: showTopOnly ? "#38bdf8" : "rgba(14,165,233,.16)", color: showTopOnly ? "#020617" : "#e0f2fe" }}
              onClick={() => setShowTopOnly((p) => !p)}
            >
              {showTopOnly ? "Showing Top Plays" : "Top Plays Only"}
            </button>
          </div>
        </header>

        <section style={styles.cardGrid}>
          <Card title="Visible Rows" value={sorted.length} sub={`${rows.length} total players`} />
          <Card title="Confirmed Lineups" value={confirmed} sub="Players with real order" />
          <Card title="Strong Plays" value={strong} sub={`${elite} elite tags`} />
        </section>

        <section style={styles.launchGrid}>
          <div style={styles.panel}>
            <div style={styles.panelTitle}>Top Plays</div>
            <div style={styles.topPlaysList}>
              {topPlays.length ? (
                topPlays.map((r, i) => (
                  <TopPlayCard key={getRowKey(r, i)} row={r} index={i} onOpen={setSelected} />
                ))
              ) : (
                <div style={{ color: "#94a3b8" }}>No top plays currently meet the launch thresholds.</div>
              )}
            </div>
          </div>

          <div style={styles.panel}>
            <div style={styles.panelTitle}>Board Health</div>
            <div style={styles.metricGrid}>
              <Metric label="Confirmed %" value={fmtPct(performance?.confirmed_lineup_pct)} color={tone.blue} />
              <Metric label="Top Plays" value={performance?.top_play_count ?? topPlays.length} color={tone.green} />
              <div style={styles.boardConfidenceKey}>
                <div style={styles.metricLabel}>Confidence Key</div>
                <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>
                  Grade from confidence score.
                </div>
                <div style={styles.boardConfidenceKeyGrid}>
                  {confidenceKey.map(([letter, range, label, color]) => (
                    <div key={letter} style={styles.boardConfidenceKeyItem} title={`${letter}: ${label} (${range})`}>
                      <span style={{ ...styles.confidenceLetter, background: color }}>{letter}</span>
                      <div style={{ color: "#e0f2fe", fontWeight: 900, fontSize: 11, marginTop: 6, lineHeight: 1 }}>{range}</div>
                      <div style={{ color: "#94a3b8", fontWeight: 900, fontSize: 9, marginTop: 5, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
              <Metric label="Avg Top Prob" value={fmtPct(performance?.avg_top_play_probability)} color={tone.green} />
            </div>
            <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 10 }}>
              {performance?.updated_et ? `Board updated ${performance.updated_et}.` : "Board summary updates after the launch model writes performance JSON."}
            </div>
          </div>
        </section>

        <section style={styles.panelGrid}>
          <div style={styles.panel}>
            <div style={styles.panelTitle}>Filters</div>
            <div style={styles.filterDescription}>
              <span style={styles.filterDescriptionStrong}>Min AVG vs Hand</span> = hitter season AVG against today's pitcher hand.
              <br />
              <span style={styles.filterDescriptionStrong}>Min Pitcher Season BAA Allowed vs Batter Hand</span> = opposing pitcher season batting average allowed against this batter's side.
              <br />
              L batter uses pitcher season BAA vs LHB; R batter uses pitcher season BAA vs RHB; switch uses the higher available season side.
            </div>

            <div style={styles.filtersAligned}>
              <label style={styles.filterLabel}>
                <span style={styles.filterInputLabel}>Search</span>
                <input
                  style={styles.filterInputWide}
                  value={filters.search || ""}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                  placeholder="Player, team, pitcher..."
                />
              </label>

              <label style={styles.filterLabel}>
                <span style={styles.filterInputLabel}>Min Prob</span>
                <input
                  style={styles.filterInputWide}
                  value={filters.minProb || ""}
                  onChange={(e) => setFilters((f) => ({ ...f, minProb: e.target.value }))}
                  placeholder="0.58"
                />
              </label>

              <label style={styles.filterLabel}>
                <span style={styles.filterInputLabel}>Min Score</span>
                <input
                  style={styles.filterInputWide}
                  value={filters.minScore || ""}
                  onChange={(e) => setFilters((f) => ({ ...f, minScore: e.target.value }))}
                  placeholder="70"
                />
              </label>

              <label style={styles.filterLabel}>
                <span style={styles.filterInputLabel}>Min Conf</span>
                <input
                  style={styles.filterInputWide}
                  value={filters.minConfidence || ""}
                  onChange={(e) => setFilters((f) => ({ ...f, minConfidence: e.target.value }))}
                  placeholder="60"
                />
              </label>

              <label style={styles.filterLabel}>
                <span
                  style={styles.filterInputLabel}
                  title="Hitter season batting average against today's opposing pitcher hand."
                >
                  Min AVG vs Hand
                </span>
                <input
                  style={styles.filterInputWide}
                  value={filters.minSeasonAvgVsHand || ""}
                  onChange={(e) => setFilters((f) => ({ ...f, minSeasonAvgVsHand: e.target.value }))}
                  placeholder=".260"
                  title="Hitter season AVG against today's pitcher hand."
                />
              </label>

              <label style={styles.filterLabel}>
                <span
                  style={styles.filterInputLabel}
                  title="Opposing pitcher season batting average allowed against this batter's handedness."
                >
                  Min Pitcher Season BAA Allowed vs Batter Hand
                </span>
                <input
                  style={styles.filterInputWide}
                  value={filters.minPitcherSeasonBAAAllowedVsBatterHand || ""}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      minPitcherSeasonBAAAllowedVsBatterHand: e.target.value,
                    }))
                  }
                  placeholder=".260"
                  title="L batter = pitcher season BAA allowed vs LHB. R batter = pitcher season BAA allowed vs RHB. Switch hitter = higher available side."
                />
              </label>
            </div>

            <div style={styles.filterButtonsCentered}>
              <button style={{ ...styles.chip, ...(filters.confirmedOnly ? styles.chipActive : {}) }} onClick={() => setFilter("confirmedOnly", !filters.confirmedOnly)}>Confirmed Only</button>
              <button style={{ ...styles.chip, ...(filters.strongOnly ? styles.chipActive : {}) }} onClick={() => setFilter("strongOnly", !filters.strongOnly)}>Strong Only</button>
              <button style={{ ...styles.chip, ...(filters.eliteOnly ? styles.chipActive : {}) }} onClick={() => setFilter("eliteOnly", !filters.eliteOnly)}>Elite Only</button>
              <button style={styles.chip} onClick={() => setFilters(initialFilters)}>Clear</button>
            </div>
          </div>

          <WhyThesePlaysPanel rows={sorted} onOpen={setSelected} />
        </section>

        <main style={styles.tableWrap}>
          <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(56,189,248,.12)" }}>
            <div style={{ color: "#bae6fd", fontWeight: 900 }}>PropHit Board</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <div style={{ color: "#94a3b8", fontSize: 13 }}>Click player name for drawer • left button locks row • header row stays frozen</div>
              <button style={styles.button} onClick={() => setShowBoardPopout(true)}>Landscape Board</button>
              <button style={{ ...styles.button, padding: "8px 12px" }} onClick={exportToExcel} disabled={!sorted.length} title="Export current visible/sorted rows to Excel">
                Export Excel
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Loading PropHit data...</div>
          ) : error ? (
            <div style={{ padding: 40, textAlign: "center", color: tone.red }}>{error}</div>
          ) : (
            <>
              <div
                ref={topScrollRef}
                style={styles.topScroll}
                onScroll={() => syncHorizontalScroll("top")}
                aria-label="Horizontal table scrollbar"
              >
                <div style={{ ...styles.topScrollInner, width: BOARD_TABLE_WIDTH }} />
              </div>
              <div
                ref={tableScrollRef}
                style={styles.tableScroll}
                onScroll={() => syncHorizontalScroll("table")}
              >
              <BoardTable
              rows={sorted}
              sortKey={sortKey}
              sortDir={sortDir}
              handleSort={handleSort}
              lockedRows={lockedRows}
              toggleRowLock={toggleRowLock}
              setSelected={setSelected}
            />
            </div>
            </>
          )}
        </main>
      </div>

        <footer style={styles.legalFooter}>
          <span style={styles.legalStrong}>Disclaimer:</span> PropHit is a data-driven analytical tool designed for informational
          and entertainment purposes only. All projections, probabilities, rankings, scores, and model outputs are estimates based
          on available historical and current data and do not guarantee future results. PropHit does not provide financial,
          investment, legal, or gambling advice. Users are solely responsible for their own decisions and any outcomes resulting
          from the use of this information.
          <br /><br />
          PropHit is not affiliated with, endorsed by, sponsored by, or connected to Major League Baseball, MLB Advanced Media,
          Baseball Reference, ESPN, FanGraphs, or any sportsbook, betting operator, league, team, or player. All trademarks,
          logos, names, statistics, and data sources belong to their respective owners.
          <br /><br />
          Sports betting involves risk and may result in financial loss. If you choose to engage in sports betting where legal,
          you must be of legal age and located in a jurisdiction where sports betting is permitted. Please gamble responsibly.
        </footer>

      <Drawer player={selected} onClose={() => setSelected(null)} />
    
      {showBoardPopout ? (
        <BoardPopout
          rows={sorted}
          onClose={() => setShowBoardPopout(false)}
          lockedRows={lockedRows}
          toggleRowLock={toggleRowLock}
        />
      ) : null}
</div>
  );
}
