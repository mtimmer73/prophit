import React, { useEffect, useMemo, useState } from "react";

/**
 * PropHit UI - Full Download Version
 * Updates included:
 * 1) Correlation Board shows only the top 3 correlations by default
 * 2) Pull-down expands the board to show up to 12 correlations
 * 3) Dedicated Grade A Players box
 * 4) Safer flexible data parsing for multiple JSON shapes
 *
 * Expected JSON:
 * public/data/prophit_latest.json
 *
 * Supported shapes:
 * - Array of player rows
 * - { players: [...] }
 * - { rows: [...] }
 * - { data: [...] }
 * - { correlations: [...], players: [...] }
 */

const DATA_URL = `${import.meta.env.BASE_URL || "/"}data/prophit_latest.json`;

const numberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const pct = (value, decimals = 1) => {
  const n = numberOrNull(value);
  if (n === null) return "—";
  const normalized = n <= 1 ? n * 100 : n;
  return `${normalized.toFixed(decimals)}%`;
};

const fmt = (value, decimals = 2) => {
  const n = numberOrNull(value);
  if (n === null) return "—";
  return n.toFixed(decimals);
};

const text = (value, fallback = "—") => {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
};

const lower = (value) => text(value, "").toLowerCase();

const getFirst = (row, keys, fallback = null) => {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }
  return fallback;
};

const getPlayerName = (row) =>
  text(
    getFirst(row, [
      "player",
      "player_name",
      "name",
      "batter",
      "hitter",
      "Player",
      "PLAYER",
    ]),
    "Unknown Player"
  );

const getTeam = (row) =>
  text(getFirst(row, ["team", "Team", "TEAM", "batter_team", "player_team"]), "");

const getOpponent = (row) =>
  text(getFirst(row, ["opponent", "opp", "Opponent", "OPP", "vs", "matchup"]), "");

const getGameTime = (row) =>
  text(
    getFirst(row, [
      "game_time_et",
      "game_time",
      "start_time_et",
      "start_time",
      "time",
      "Game Time",
    ]),
    ""
  );

const getHitScore = (row) =>
  numberOrNull(
    getFirst(row, [
      "hit_score",
      "Hit Score",
      "hits_score",
      "model_score",
      "overall_score",
      "score",
    ])
  );

const getProjectedHits = (row) =>
  numberOrNull(
    getFirst(row, [
      "proj_hits",
      "projected_hits",
      "Projected Hits",
      "x_hits",
      "hits_projection",
    ])
  );

const getConfidence = (row) =>
  text(
    getFirst(row, [
      "confidence",
      "Confidence",
      "confidence_grade",
      "grade",
      "Grade",
      "model_confidence",
    ]),
    ""
  ).toUpperCase();

const getBattingOrder = (row) =>
  text(
    getFirst(row, [
      "batting_order",
      "lineup_spot",
      "lineup",
      "battingOrder",
      "order",
      "Batting Order",
    ]),
    ""
  );

const getPitcher = (row) =>
  text(
    getFirst(row, [
      "pitcher",
      "probable_pitcher",
      "opposing_pitcher",
      "Opposing Pitcher",
      "starter",
    ]),
    ""
  );

const getOnePlusRate = (row) =>
  numberOrNull(
    getFirst(row, [
      "last30_one_plus_hit_rate",
      "one_plus_hit_rate",
      "hit_rate",
      "last_30_hit_rate",
      "one_plus_rate",
    ])
  );

const isGameStarted = (row) => {
  const flags = [
    getFirst(row, ["game_started", "started", "is_started", "in_progress"], null),
    getFirst(row, ["status", "game_status", "status_detail"], null),
  ];

  return flags.some((flag) => {
    if (typeof flag === "boolean") return flag;
    const value = lower(flag);
    return (
      value.includes("started") ||
      value.includes("in progress") ||
      value.includes("final") ||
      value.includes("live")
    );
  });
};

const getGradeRank = (grade) => {
  const g = text(grade, "").toUpperCase().replace("+", "");
  if (g === "A") return 5;
  if (g === "B") return 4;
  if (g === "C") return 3;
  if (g === "D") return 2;
  return 1;
};

const deriveGrade = (row) => {
  const existing = getConfidence(row);
  if (existing.startsWith("A")) return "A";
  if (existing.startsWith("B")) return "B";
  if (existing.startsWith("C")) return "C";

  const score = getHitScore(row);
  const proj = getProjectedHits(row);
  const rate = getOnePlusRate(row);

  if ((score ?? 0) >= 78 && (proj ?? 0) >= 1.1) return "A";
  if ((score ?? 0) >= 70 && (proj ?? 0) >= 1.0) return "B";
  if ((score ?? 0) >= 62) return "C";
  if ((rate ?? 0) >= 0.72 && (proj ?? 0) >= 1.0) return "B";

  return existing || "—";
};

const normalizeRows = (payload) => {
  if (Array.isArray(payload)) return payload;

  if (payload && Array.isArray(payload.players)) return payload.players;
  if (payload && Array.isArray(payload.rows)) return payload.rows;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && Array.isArray(payload.projections)) return payload.projections;
  if (payload && Array.isArray(payload.board)) return payload.board;

  return [];
};

const normalizeCorrelations = (payload) => {
  if (payload && Array.isArray(payload.correlations)) return payload.correlations;
  if (payload && Array.isArray(payload.correlation_board)) return payload.correlation_board;
  if (payload && Array.isArray(payload.validation_correlations)) return payload.validation_correlations;
  return [];
};

const buildFallbackCorrelations = (rows) => {
  const rules = [
    {
      id: "hit70-proj110",
      label: "Hit Score ≥ 70 + Projected Hits ≥ 1.10",
      test: (r) => (getHitScore(r) ?? 0) >= 70 && (getProjectedHits(r) ?? 0) >= 1.1,
    },
    {
      id: "hit75-proj100",
      label: "Hit Score ≥ 75 + Projected Hits ≥ 1.00",
      test: (r) => (getHitScore(r) ?? 0) >= 75 && (getProjectedHits(r) ?? 0) >= 1.0,
    },
    {
      id: "gradeA",
      label: "Grade A Players",
      test: (r) => deriveGrade(r) === "A",
    },
    {
      id: "gradeA-proj100",
      label: "Grade A + Projected Hits ≥ 1.00",
      test: (r) => deriveGrade(r) === "A" && (getProjectedHits(r) ?? 0) >= 1.0,
    },
    {
      id: "topOrder-score70",
      label: "Batting Order 1–4 + Hit Score ≥ 70",
      test: (r) => {
        const order = numberOrNull(getBattingOrder(r));
        return order !== null && order >= 1 && order <= 4 && (getHitScore(r) ?? 0) >= 70;
      },
    },
    {
      id: "rate70-proj100",
      label: "Last 30 1+ Hit Rate ≥ 70% + Projected Hits ≥ 1.00",
      test: (r) => {
        const rate = getOnePlusRate(r);
        const normalized = rate === null ? 0 : rate <= 1 ? rate * 100 : rate;
        return normalized >= 70 && (getProjectedHits(r) ?? 0) >= 1.0;
      },
    },
    {
      id: "score80",
      label: "Hit Score ≥ 80",
      test: (r) => (getHitScore(r) ?? 0) >= 80,
    },
    {
      id: "proj120",
      label: "Projected Hits ≥ 1.20",
      test: (r) => (getProjectedHits(r) ?? 0) >= 1.2,
    },
    {
      id: "proj115-score68",
      label: "Projected Hits ≥ 1.15 + Hit Score ≥ 68",
      test: (r) => (getProjectedHits(r) ?? 0) >= 1.15 && (getHitScore(r) ?? 0) >= 68,
    },
    {
      id: "topOrder-gradeA",
      label: "Batting Order 1–4 + Grade A",
      test: (r) => {
        const order = numberOrNull(getBattingOrder(r));
        return order !== null && order >= 1 && order <= 4 && deriveGrade(r) === "A";
      },
    },
    {
      id: "score72-rate65",
      label: "Hit Score ≥ 72 + Last 30 1+ Hit Rate ≥ 65%",
      test: (r) => {
        const rate = getOnePlusRate(r);
        const normalized = rate === null ? 0 : rate <= 1 ? rate * 100 : rate;
        return (getHitScore(r) ?? 0) >= 72 && normalized >= 65;
      },
    },
    {
      id: "score65-proj100",
      label: "Hit Score ≥ 65 + Projected Hits ≥ 1.00",
      test: (r) => (getHitScore(r) ?? 0) >= 65 && (getProjectedHits(r) ?? 0) >= 1.0,
    },
  ];

  return rules
    .map((rule) => {
      const matches = rows.filter(rule.test);
      const avgScore =
        matches.length > 0
          ? matches.reduce((sum, row) => sum + (getHitScore(row) ?? 0), 0) / matches.length
          : 0;
      const avgProj =
        matches.length > 0
          ? matches.reduce((sum, row) => sum + (getProjectedHits(row) ?? 0), 0) / matches.length
          : 0;

      return {
        id: rule.id,
        label: rule.label,
        description: "Current-board signal generated from available projection fields.",
        sample_size: matches.length,
        hit_rate: null,
        confidence: matches.length >= 5 ? "Medium" : matches.length >= 2 ? "Emerging" : "Low",
        signal_score: avgScore + avgProj * 10 + Math.min(matches.length, 10),
        players: matches.slice(0, 8).map(getPlayerName),
      };
    })
    .filter((c) => c.sample_size > 0)
    .sort((a, b) => (b.signal_score ?? 0) - (a.signal_score ?? 0));
};

const normalizeCorrelationItem = (item, index) => ({
  id: item.id || item.rule_id || item.name || `correlation-${index}`,
  label:
    item.label ||
    item.rule ||
    item.name ||
    item.title ||
    item.correlation ||
    `Correlation ${index + 1}`,
  description:
    item.description ||
    item.summary ||
    item.notes ||
    item.reason ||
    "Model-generated correlation signal.",
  sample_size:
    numberOrNull(
      getFirst(item, ["sample_size", "sample", "opportunities", "n", "count", "matches"])
    ) ?? 0,
  hit_rate: numberOrNull(getFirst(item, ["hit_rate", "success_rate", "rate", "win_rate"])),
  trend:
    item.trend ||
    item.direction ||
    item.reliability ||
    item.confidence ||
    item.strength ||
    "Review",
  signal_score:
    numberOrNull(getFirst(item, ["signal_score", "score", "strength_score", "rank_score"])) ??
    0,
  players: Array.isArray(item.players)
    ? item.players
    : Array.isArray(item.matches)
      ? item.matches.map((p) => (typeof p === "string" ? p : getPlayerName(p)))
      : [],
});

const classNames = (...items) => items.filter(Boolean).join(" ");

function StatPill({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

function CorrelationCard({ item, rank }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-indigo-600">
            Signal #{rank}
          </div>
          <h3 className="mt-1 text-base font-bold text-slate-900">{item.label}</h3>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          {item.trend}
        </div>
      </div>

      <p className="mt-2 text-sm text-slate-600">{item.description}</p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-[11px] font-semibold uppercase text-slate-500">Hit Rate</div>
          <div className="text-lg font-bold text-slate-900">
            {item.hit_rate === null ? "—" : pct(item.hit_rate)}
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-[11px] font-semibold uppercase text-slate-500">Sample</div>
          <div className="text-lg font-bold text-slate-900">{item.sample_size || "—"}</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-[11px] font-semibold uppercase text-slate-500">Score</div>
          <div className="text-lg font-bold text-slate-900">{fmt(item.signal_score, 1)}</div>
        </div>
      </div>

      {item.players?.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Matching Players
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {item.players.slice(0, 8).map((player) => (
              <span
                key={`${item.id}-${player}`}
                className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700"
              >
                {player}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GradeABox({ players }) {
  return (
    <section className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-emerald-700">
            Grade A Watch Box
          </div>
          <h2 className="text-2xl font-black text-slate-950">All Grade A Players</h2>
          <p className="text-sm text-slate-600">
            Highest-confidence players based on the confidence grade or derived model thresholds.
          </p>
        </div>
        <div className="rounded-2xl bg-white px-4 py-2 text-center shadow-sm">
          <div className="text-xs font-semibold uppercase text-slate-500">Total</div>
          <div className="text-2xl font-black text-emerald-700">{players.length}</div>
        </div>
      </div>

      {players.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-emerald-300 bg-white/70 p-4 text-sm text-slate-600">
          No Grade A players found in the current data file.
        </div>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {players.map((row) => (
            <div
              key={`${getPlayerName(row)}-${getTeam(row)}-${getOpponent(row)}`}
              className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-black text-slate-950">{getPlayerName(row)}</div>
                  <div className="text-sm font-medium text-slate-500">
                    {getTeam(row)} {getOpponent(row) ? `vs ${getOpponent(row)}` : ""}
                  </div>
                </div>
                <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
                  A
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-xl bg-slate-50 p-2">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Score</div>
                  <div className="font-black text-slate-900">{fmt(getHitScore(row), 1)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-2">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Proj H</div>
                  <div className="font-black text-slate-900">{fmt(getProjectedHits(row), 2)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-2">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Order</div>
                  <div className="font-black text-slate-900">{getBattingOrder(row) || "—"}</div>
                </div>
              </div>

              <div className="mt-3 text-xs text-slate-500">
                {getPitcher(row) ? `Pitcher: ${getPitcher(row)}` : "Pitcher: —"}
                {getGameTime(row) ? ` • ${getGameTime(row)}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PlayerTable({ rows }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 p-4">
        <div>
          <h2 className="text-xl font-black text-slate-950">Today’s Board</h2>
          <p className="text-sm text-slate-500">Sorted by grade, hit score, and projected hits.</p>
        </div>
      </div>

      <div className="max-h-[680px] overflow-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Player</th>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3">Opp</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Pitcher</th>
              <th className="px-4 py-3">Grade</th>
              <th className="px-4 py-3">Hit Score</th>
              <th className="px-4 py-3">Proj Hits</th>
              <th className="px-4 py-3">Last 30 1+ Rate</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => {
              const grade = deriveGrade(row);
              const started = isGameStarted(row);

              return (
                <tr
                  key={`${getPlayerName(row)}-${index}`}
                  className={classNames(
                    "hover:bg-slate-50",
                    grade === "A" && "bg-emerald-50/40"
                  )}
                >
                  <td className="px-4 py-3 font-bold text-slate-950">{getPlayerName(row)}</td>
                  <td className="px-4 py-3 text-slate-700">{getTeam(row) || "—"}</td>
                  <td className="px-4 py-3 text-slate-700">{getOpponent(row) || "—"}</td>
                  <td className="px-4 py-3 text-slate-700">{getGameTime(row) || "—"}</td>
                  <td className="px-4 py-3 text-slate-700">{getBattingOrder(row) || "—"}</td>
                  <td className="px-4 py-3 text-slate-700">{getPitcher(row) || "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={classNames(
                        "rounded-full px-3 py-1 text-xs font-black",
                        grade === "A"
                          ? "bg-emerald-100 text-emerald-700"
                          : grade === "B"
                            ? "bg-blue-100 text-blue-700"
                            : grade === "C"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-100 text-slate-600"
                      )}
                    >
                      {grade}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-900">{fmt(getHitScore(row), 1)}</td>
                  <td className="px-4 py-3 font-bold text-slate-900">
                    {fmt(getProjectedHits(row), 2)}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{pct(getOnePlusRate(row))}</td>
                  <td className="px-4 py-3">
                    <span
                      className={classNames(
                        "rounded-full px-3 py-1 text-xs font-bold",
                        started ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"
                      )}
                    >
                      {started ? "Frozen/Started" : "Pre-game"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div className="p-8 text-center text-sm text-slate-500">
            No player rows were found in the current JSON file.
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [payload, setPayload] = useState(null);
  const [rows, setRows] = useState([]);
  const [rawCorrelations, setRawCorrelations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState("ALL");
  const [showTop12, setShowTop12] = useState(false);
  const [hideStarted, setHideStarted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        setLoading(true);
        setLoadError("");

        const response = await fetch(DATA_URL, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Could not load ${DATA_URL}. Status ${response.status}`);
        }

        const json = await response.json();
        if (cancelled) return;

        const normalizedRows = normalizeRows(json);
        const normalizedCorrelations = normalizeCorrelations(json);

        setPayload(json);
        setRows(normalizedRows);
        setRawCorrelations(normalizedCorrelations);
      } catch (error) {
        if (cancelled) return;
        setLoadError(error?.message || "Could not load model data.");
        setRows([]);
        setRawCorrelations([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  const teams = useMemo(() => {
    const unique = new Set(rows.map(getTeam).filter(Boolean));
    return ["ALL", ...Array.from(unique).sort()];
  }, [rows]);

  const gradeAPlayers = useMemo(() => {
    return rows
      .filter((row) => deriveGrade(row) === "A")
      .sort((a, b) => {
        const scoreDiff = (getHitScore(b) ?? 0) - (getHitScore(a) ?? 0);
        if (scoreDiff !== 0) return scoreDiff;
        return (getProjectedHits(b) ?? 0) - (getProjectedHits(a) ?? 0);
      });
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows
      .filter((row) => {
        if (hideStarted && isGameStarted(row)) return false;
        if (teamFilter !== "ALL" && getTeam(row) !== teamFilter) return false;

        if (!q) return true;

        return [
          getPlayerName(row),
          getTeam(row),
          getOpponent(row),
          getPitcher(row),
          getConfidence(row),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        const gradeDiff = getGradeRank(deriveGrade(b)) - getGradeRank(deriveGrade(a));
        if (gradeDiff !== 0) return gradeDiff;

        const scoreDiff = (getHitScore(b) ?? 0) - (getHitScore(a) ?? 0);
        if (scoreDiff !== 0) return scoreDiff;

        return (getProjectedHits(b) ?? 0) - (getProjectedHits(a) ?? 0);
      });
  }, [rows, query, teamFilter, hideStarted]);

  const correlations = useMemo(() => {
    const source =
      rawCorrelations.length > 0
        ? rawCorrelations.map(normalizeCorrelationItem)
        : buildFallbackCorrelations(rows);

    return source
      .map((item, index) => normalizeCorrelationItem(item, index))
      .sort((a, b) => {
        const scoreDiff = (b.signal_score ?? 0) - (a.signal_score ?? 0);
        if (scoreDiff !== 0) return scoreDiff;
        return (b.sample_size ?? 0) - (a.sample_size ?? 0);
      })
      .slice(0, 12);
  }, [rawCorrelations, rows]);

  const displayedCorrelations = showTop12 ? correlations.slice(0, 12) : correlations.slice(0, 3);

  const lastRun =
    payload?.last_run_et ||
    payload?.last_model_run_et ||
    payload?.generated_at_et ||
    payload?.generated_at ||
    payload?.timestamp ||
    "—";

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.25em] text-indigo-600">
                PropHit Lab
              </div>
              <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950">
                MLB Hits Model Board
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Top correlations, Grade A player watch box, and today’s model projections. Games
                that have already started can be hidden while frozen rows remain available.
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
              <div className="font-bold text-slate-500">Last Model Run</div>
              <div className="font-black text-slate-950">{lastRun}</div>
            </div>
          </div>

          {loadError && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
              {loadError}
            </div>
          )}
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatPill label="Rows Loaded" value={loading ? "Loading..." : rows.length} />
          <StatPill label="Visible Rows" value={filteredRows.length} />
          <StatPill label="Grade A Players" value={gradeAPlayers.length} />
          <StatPill label="Correlations" value={correlations.length} />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-wide text-indigo-600">
                Dynamic Correlation Board
              </div>
              <h2 className="text-2xl font-black text-slate-950">
                Showing {showTop12 ? "Top 12" : "Top 3"} Correlations
              </h2>
              <p className="text-sm text-slate-600">
                Default view keeps the board clean. Use the pull-down to expand up to 12 signals.
              </p>
            </div>

            <label className="flex flex-col text-sm font-bold text-slate-700">
              Correlation View
              <select
                value={showTop12 ? "12" : "3"}
                onChange={(event) => setShowTop12(event.target.value === "12")}
                className="mt-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold shadow-sm outline-none focus:border-indigo-500"
              >
                <option value="3">Top 3 correlations</option>
                <option value="12">Expand to top 12 correlations</option>
              </select>
            </label>
          </div>

          {displayedCorrelations.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
              No correlations were found. Add a correlations array to the model output, or the UI
              will build fallback current-board signals when projection fields are available.
            </div>
          ) : (
            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              {displayedCorrelations.map((item, index) => (
                <CorrelationCard key={item.id} item={item} rank={index + 1} />
              ))}
            </div>
          )}
        </section>

        <GradeABox players={gradeAPlayers} />

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1fr_220px_220px]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search player, team, opponent, pitcher, grade..."
              className="rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-500"
            />

            <select
              value={teamFilter}
              onChange={(event) => setTeamFilter(event.target.value)}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-500"
            >
              {teams.map((team) => (
                <option key={team} value={team}>
                  {team === "ALL" ? "All Teams" : team}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setHideStarted((value) => !value)}
              className={classNames(
                "rounded-2xl px-4 py-3 text-sm font-black shadow-sm",
                hideStarted
                  ? "bg-rose-600 text-white"
                  : "border border-slate-300 bg-white text-slate-700"
              )}
            >
              {hideStarted ? "Started Games Hidden" : "Hide Started Games"}
            </button>
          </div>
        </section>

        <PlayerTable rows={filteredRows} />
      </div>
    </main>
  );
}
