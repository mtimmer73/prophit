import React, { useEffect, useMemo, useState } from "react";

const TAB_KEYS = ["home", "top5", "v7", "justin", "consensus", "matchupLab"];

const TAB_LABELS = {
  home: "Home",
  top5: "Top 5 Board",
  v7: "V7",
  justin: "Justin",
  consensus: "Consensus",
  matchupLab: "Matchup Lab",
};

const DATA_SOURCES = {
  v7: "/proppulse_v7_all_players.json",
  justin: "/justin_model_all_players.json",
  matchupLab: "/matchup_lab.json",
};

const COLUMN_PRIORITY = [
  "date",
  "game_date",
  "game_time_et",
  "time_et",
  "player",
  "team",
  "opp",
  "opponent",
  "pitcher",
  "proj_hits",
  "projected_hits",
  "hit_score",
  "proj_tb",
  "projected_tb",
  "tb_score",
  "proj_hr",
  "projected_hr",
  "hr_score",
  "proj_rbi",
  "projected_rbi",
  "rbi_score",
  "proj_runs",
  "projected_runs",
  "run_score",
  "proj_sb",
  "projected_sb",
  "sb_score",
  "avg",
  "obp",
  "slg",
  "ops",
  "xba",
];

const SCORE_CANDIDATES = [
  "hit_score",
  "tb_score",
  "hr_score",
  "rbi_score",
  "run_score",
  "sb_score",
];

function safeValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && !Number.isFinite(value)) return "";
  return value;
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row, index) => {
    const cleaned = {};
    Object.entries(row || {}).forEach(([key, value]) => {
      cleaned[key] = safeValue(value);
    });
    cleaned.__rowId = `${cleaned.player || "row"}-${cleaned.team || ""}-${cleaned.date || cleaned.game_date || ""}-${index}`;
    return cleaned;
  });
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCell(value) {
  if (value === null || value === undefined || value === "") return "—";
  const num = toNumber(value);
  if (num !== null) {
    if (Math.abs(num) >= 1000) return num.toLocaleString();
    if (Number.isInteger(num)) return String(num);
    return num.toFixed(2);
  }
  return String(value);
}

function prettifyHeader(key) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace("Xba", "xBA")
    .replace("Obp", "OBP")
    .replace("Slg", "SLG")
    .replace("Ops", "OPS")
    .replace("Hr", "HR")
    .replace("Rbi", "RBI")
    .replace("Sb", "SB")
    .replace("Tb", "TB")
    .replace("Et", "ET");
}

function getColumns(rows) {
  const found = new Set();
  rows.forEach((row) => Object.keys(row || {}).forEach((key) => key !== "__rowId" && found.add(key)));
  const remaining = [...found].filter((key) => !COLUMN_PRIORITY.includes(key)).sort();
  const ordered = COLUMN_PRIORITY.filter((key) => found.has(key));
  return [...ordered, ...remaining];
}

function compareValues(a, b) {
  const aNum = toNumber(a);
  const bNum = toNumber(b);

  if (aNum !== null && bNum !== null) return aNum - bNum;
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });
}

function sortRows(rows, sortConfig) {
  if (!sortConfig?.key) return rows;
  const sorted = [...rows].sort((a, b) => compareValues(a[sortConfig.key], b[sortConfig.key]));
  return sortConfig.direction === "desc" ? sorted.reverse() : sorted;
}

function detectPrimaryScore(rows) {
  const columns = getColumns(rows);
  return SCORE_CANDIDATES.find((col) => columns.includes(col)) || null;
}

function buildTopPlays(rows, modelLabel) {
  const columns = getColumns(rows);
  const scoreCols = SCORE_CANDIDATES.filter((col) => columns.includes(col));

  const plays = [];
  for (const scoreCol of scoreCols) {
    const label = prettifyHeader(scoreCol);
    const topFive = [...rows]
      .filter((row) => toNumber(row[scoreCol]) !== null)
      .sort((a, b) => (toNumber(b[scoreCol]) ?? -Infinity) - (toNumber(a[scoreCol]) ?? -Infinity))
      .slice(0, 5)
      .map((row) => ({
        model: modelLabel,
        board: label,
        player: row.player || "—",
        team: row.team || "—",
        opponent: row.opp || row.opponent || "—",
        score: row[scoreCol],
        projectedHits: row.proj_hits ?? row.projected_hits ?? "",
        projectedTB: row.proj_tb ?? row.projected_tb ?? "",
        date: row.date || row.game_date || "",
        time: row.game_time_et || row.time_et || "",
      }));

    plays.push(...topFive);
  }

  return plays;
}

function buildConsensus(v7Rows, justinRows) {
  const justinMap = new Map(
    justinRows.map((row) => [
      `${row.player || ""}|${row.team || ""}|${row.date || row.game_date || ""}`,
      row,
    ])
  );

  const results = [];

  for (const v7 of v7Rows) {
    const key = `${v7.player || ""}|${v7.team || ""}|${v7.date || v7.game_date || ""}`;
    const justin = justinMap.get(key);
    if (!justin) continue;

    const v7Hit = toNumber(v7.hit_score);
    const justinHit = toNumber(justin.hit_score);
    const v7TB = toNumber(v7.tb_score);
    const justinTB = toNumber(justin.tb_score);

    results.push({
      __rowId: `consensus-${key}`,
      date: v7.date || v7.game_date || justin.date || justin.game_date || "",
      game_time_et: v7.game_time_et || justin.game_time_et || v7.time_et || justin.time_et || "",
      player: v7.player || justin.player || "",
      team: v7.team || justin.team || "",
      opp: v7.opp || justin.opp || justin.opponent || v7.opponent || "",
      v7_hit_score: v7.hit_score ?? "",
      justin_hit_score: justin.hit_score ?? "",
      avg_hit_score:
        v7Hit !== null && justinHit !== null ? ((v7Hit + justinHit) / 2).toFixed(2) : "",
      v7_tb_score: v7.tb_score ?? "",
      justin_tb_score: justin.tb_score ?? "",
      avg_tb_score:
        v7TB !== null && justinTB !== null ? ((v7TB + justinTB) / 2).toFixed(2) : "",
      v7_proj_hits: v7.proj_hits ?? v7.projected_hits ?? "",
      justin_proj_hits: justin.proj_hits ?? justin.projected_hits ?? "",
      v7_proj_tb: v7.proj_tb ?? v7.projected_tb ?? "",
      justin_proj_tb: justin.proj_tb ?? justin.projected_tb ?? "",
    });
  }

  return results.sort((a, b) => (toNumber(b.avg_hit_score) ?? -Infinity) - (toNumber(a.avg_hit_score) ?? -Infinity));
}

function StatCard({ label, value, subtext }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/20">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
      {subtext ? <div className="mt-1 text-sm text-slate-400">{subtext}</div> : null}
    </div>
  );
}

function SectionTitle({ title, subtitle }) {
  return (
    <div className="mb-4 flex flex-col gap-1">
      <h2 className="text-2xl font-semibold text-white">{title}</h2>
      {subtitle ? <p className="text-sm text-slate-400">{subtitle}</p> : null}
    </div>
  );
}

function DataTable({ rows, title, primaryScoreColumn }) {
  const [search, setSearch] = useState("");
  const [minProjHitsOnly, setMinProjHitsOnly] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: primaryScoreColumn || "player", direction: primaryScoreColumn ? "desc" : "asc" });

  useEffect(() => {
    if (primaryScoreColumn) {
      setSortConfig({ key: primaryScoreColumn, direction: "desc" });
    }
  }, [primaryScoreColumn, title]);

  const columns = useMemo(() => getColumns(rows), [rows]);

  const filteredRows = useMemo(() => {
    const lower = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesSearch = !lower || [row.player, row.team, row.opp, row.opponent]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(lower));

      const hitsValue = toNumber(row.proj_hits ?? row.projected_hits);
      const matchesHits = !minProjHitsOnly || (hitsValue !== null && hitsValue >= 1);

      return matchesSearch && matchesHits;
    });
  }, [rows, search, minProjHitsOnly]);

  const sortedRows = useMemo(() => sortRows(filteredRows, sortConfig), [filteredRows, sortConfig]);

  const onHeaderClick = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      const numeric = sortedRows.some((row) => toNumber(row[key]) !== null);
      return { key, direction: numeric ? "desc" : "asc" };
    });
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-4 shadow-2xl shadow-black/30">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SectionTitle title={title} subtitle={`${sortedRows.length} players`} />
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white outline-none placeholder:text-slate-500"
            placeholder="Search player or team"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className={`rounded-xl border px-4 py-2 text-sm transition ${minProjHitsOnly ? "border-blue-400 bg-blue-500/20 text-blue-200" : "border-white/10 bg-white/5 text-slate-300"}`}
            onClick={() => setMinProjHitsOnly((prev) => !prev)}
          >
            {minProjHitsOnly ? "Showing Proj Hits ≥ 1" : "Filter Proj Hits ≥ 1"}
          </button>
        </div>
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-2xl border border-white/10">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur">
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  className="cursor-pointer border-b border-white/10 px-3 py-3 text-left font-semibold text-slate-200"
                  onClick={() => onHeaderClick(column)}
                >
                  <div className="flex items-center gap-2">
                    <span>{prettifyHeader(column)}</span>
                    {sortConfig.key === column ? (
                      <span className="text-xs text-blue-300">{sortConfig.direction === "asc" ? "▲" : "▼"}</span>
                    ) : null}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.__rowId} className="border-b border-white/5 transition hover:bg-white/[0.03]">
                {columns.map((column) => {
                  const isPrimary = column === primaryScoreColumn;
                  return (
                    <td
                      key={`${row.__rowId}-${column}`}
                      className={`px-3 py-2 text-slate-300 ${isPrimary ? "font-semibold text-blue-200" : ""}`}
                    >
                      {formatCell(row[column])}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TopBoard({ topPlays }) {
  return (
    <div className="space-y-6">
      <SectionTitle title="Top 5 Board" subtitle="Best score-based plays from both models" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {topPlays.map((play, index) => (
          <div key={`${play.model}-${play.board}-${play.player}-${index}`} className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/20">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{play.model}</div>
                <div className="mt-1 text-lg font-semibold text-white">{play.player}</div>
                <div className="text-sm text-slate-400">{play.team} vs {play.opponent}</div>
              </div>
              <div className="rounded-xl bg-blue-500/15 px-3 py-1 text-sm font-semibold text-blue-200">{play.board}</div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-slate-500">Score</div>
                <div className="font-semibold text-white">{formatCell(play.score)}</div>
              </div>
              <div>
                <div className="text-slate-500">Time</div>
                <div className="font-semibold text-white">{play.time || "—"}</div>
              </div>
              <div>
                <div className="text-slate-500">Proj Hits</div>
                <div className="font-semibold text-white">{formatCell(play.projectedHits)}</div>
              </div>
              <div>
                <div className="text-slate-500">Proj TB</div>
                <div className="font-semibold text-white">{formatCell(play.projectedTB)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HomeView({ v7Rows, justinRows, consensusRows, matchupRows }) {
  const v7Score = detectPrimaryScore(v7Rows);
  const justinScore = detectPrimaryScore(justinRows);

  const bestV7 = v7Score
    ? [...v7Rows].sort((a, b) => (toNumber(b[v7Score]) ?? -Infinity) - (toNumber(a[v7Score]) ?? -Infinity))[0]
    : null;

  const bestJustin = justinScore
    ? [...justinRows].sort((a, b) => (toNumber(b[justinScore]) ?? -Infinity) - (toNumber(a[justinScore]) ?? -Infinity))[0]
    : null;

  return (
    <div className="space-y-6">
      <SectionTitle title="Dashboard" subtitle="Baseball prediction and prop dashboard" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="V7 Players" value={v7Rows.length} subtext={v7Score ? `Primary score: ${prettifyHeader(v7Score)}` : "No score found"} />
        <StatCard label="Justin Players" value={justinRows.length} subtext={justinScore ? `Primary score: ${prettifyHeader(justinScore)}` : "No score found"} />
        <StatCard label="Consensus Matches" value={consensusRows.length} subtext="Players found in both models" />
        <StatCard label="Matchup Lab Rows" value={matchupRows.length} subtext="Standalone raw split research" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm uppercase tracking-[0.2em] text-slate-400">Best V7 Play</div>
          <div className="mt-3 text-2xl font-bold text-white">{bestV7?.player || "—"}</div>
          <div className="mt-1 text-slate-400">{bestV7?.team || "—"} vs {bestV7?.opp || bestV7?.opponent || "—"}</div>
          <div className="mt-4 text-sm text-slate-300">{v7Score ? `${prettifyHeader(v7Score)}: ${formatCell(bestV7?.[v7Score])}` : "No score column detected"}</div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm uppercase tracking-[0.2em] text-slate-400">Best Justin Play</div>
          <div className="mt-3 text-2xl font-bold text-white">{bestJustin?.player || "—"}</div>
          <div className="mt-1 text-slate-400">{bestJustin?.team || "—"} vs {bestJustin?.opp || bestJustin?.opponent || "—"}</div>
          <div className="mt-4 text-sm text-slate-300">{justinScore ? `${prettifyHeader(justinScore)}: ${formatCell(bestJustin?.[justinScore])}` : "No score column detected"}</div>
        </div>
      </div>
    </div>
  );
}

function MatchupLabView({ rows }) {
  const [search, setSearch] = useState("");
  const [selectedRowId, setSelectedRowId] = useState("");

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.player, row.team, row.opp, row.pitcher, row.matchup]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [rows, search]);

  useEffect(() => {
    if (!filteredRows.length) {
      setSelectedRowId("");
      return;
    }
    if (!selectedRowId || !filteredRows.some((row) => row.__rowId === selectedRowId)) {
      setSelectedRowId(filteredRows[0].__rowId);
    }
  }, [filteredRows, selectedRowId]);

  const selected = filteredRows.find((row) => row.__rowId === selectedRowId) || null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <SectionTitle
          title="Matchup Lab"
          subtitle="Standalone research tab with real hitter and pitcher split data outside the models"
        />
        <input
          className="w-full max-w-md rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white outline-none placeholder:text-slate-500"
          placeholder="Search player, team, pitcher, or matchup"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px,1fr]">
        <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-300">{filteredRows.length} matchups</div>
          <div className="max-h-[70vh] space-y-2 overflow-auto pr-1">
            {filteredRows.map((row) => {
              const active = row.__rowId === selectedRowId;
              return (
                <button
                  key={row.__rowId}
                  onClick={() => setSelectedRowId(row.__rowId)}
                  className={`w-full rounded-2xl border p-3 text-left transition ${
                    active
                      ? "border-blue-500 bg-blue-600/10"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="text-sm font-semibold text-white">{row.player || "—"}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    {row.team || "—"} vs {row.opp || "—"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {row.pitcher || "—"} • {row.matchup || "—"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          {!selected ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-slate-300">No matchup selected.</div>
          ) : (
            <>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-2xl font-bold text-white">{selected.player || "—"}</div>
                    <div className="mt-1 text-slate-400">
                      {selected.team || "—"} vs {selected.opp || "—"} • {selected.game_time_et || "—"}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      Pitcher: {selected.pitcher || "—"} • Matchup: {selected.matchup || "—"}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label="Split AVG" value={formatCell(selected.hitter_split_avg)} />
                    <StatCard label="Pitcher AVG Allowed" value={formatCell(selected.pitcher_split_avg_allowed)} />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
                  <div className="mb-4 text-lg font-semibold text-white">Hitter Split Profile</div>
                  <div className="grid grid-cols-2 gap-4">
                    <StatCard label="AVG" value={formatCell(selected.hitter_split_avg)} />
                    <StatCard label="OBP" value={formatCell(selected.hitter_split_obp)} />
                    <StatCard label="SLG" value={formatCell(selected.hitter_split_slg)} />
                    <StatCard label="OPS" value={formatCell(selected.hitter_split_ops)} />
                    <StatCard label="Hit Rate" value={formatCell(selected.hitter_hit_rate)} />
                    <StatCard label="TB Rate" value={formatCell(selected.hitter_tb_rate)} />
                    <StatCard label="HR Rate" value={formatCell(selected.hitter_hr_rate)} />
                    <StatCard label="Sample" value={formatCell(selected.hitter_split_sample)} />
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
                  <div className="mb-4 text-lg font-semibold text-white">Pitcher Allowed Split</div>
                  <div className="grid grid-cols-2 gap-4">
                    <StatCard label="AVG Allowed" value={formatCell(selected.pitcher_split_avg_allowed)} />
                    <StatCard label="OBP Allowed" value={formatCell(selected.pitcher_split_obp_allowed)} />
                    <StatCard label="SLG Allowed" value={formatCell(selected.pitcher_split_slg_allowed)} />
                    <StatCard label="OPS Allowed" value={formatCell(selected.pitcher_split_ops_allowed)} />
                    <StatCard label="Hit Rate Allowed" value={formatCell(selected.pitcher_hit_rate_allowed)} />
                    <StatCard label="TB Rate Allowed" value={formatCell(selected.pitcher_tb_rate_allowed)} />
                    <StatCard label="HR Rate Allowed" value={formatCell(selected.pitcher_hr_rate_allowed)} />
                    <StatCard label="Sample" value={formatCell(selected.pitcher_split_sample)} />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <StatCard label="Park Factor" value={formatCell(selected.park_factor)} subtext={selected.venue || "Venue"} />
                <StatCard label="Split Edge" value={formatCell(selected.split_edge_score)} subtext="Simple hitter/pitcher blend score" />
                <StatCard label="Research Flag" value={selected.research_flag || "—"} subtext="Quick takeaway" />
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
                <div className="mb-4 text-lg font-semibold text-white">Raw Research Table</div>
                <div className="overflow-auto rounded-2xl border border-white/10">
                  <table className="min-w-full text-sm">
                    <tbody>
                      {Object.entries(selected)
                        .filter(([key]) => key !== "__rowId")
                        .map(([key, value]) => (
                          <tr key={key} className="border-b border-white/5">
                            <td className="w-1/3 px-3 py-2 font-medium text-slate-300">{prettifyHeader(key)}</td>
                            <td className="px-3 py-2 text-slate-400">{formatCell(value)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [v7Rows, setV7Rows] = useState([]);
  const [justinRows, setJustinRows] = useState([]);
  const [matchupRows, setMatchupRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError("");

      try {
        const [v7Res, justinRes, matchupRes] = await Promise.all([
          fetch(`${DATA_SOURCES.v7}?t=${Date.now()}`),
          fetch(`${DATA_SOURCES.justin}?t=${Date.now()}`),
          fetch(`${DATA_SOURCES.matchupLab}?t=${Date.now()}`),
        ]);

        if (!v7Res.ok) throw new Error(`Could not load V7 data (${v7Res.status})`);
        if (!justinRes.ok) throw new Error(`Could not load Justin data (${justinRes.status})`);
        if (!matchupRes.ok) throw new Error(`Could not load Matchup Lab data (${matchupRes.status})`);

        const [v7Json, justinJson, matchupJson] = await Promise.all([
          v7Res.json(),
          justinRes.json(),
          matchupRes.json(),
        ]);

        setV7Rows(normalizeRows(v7Json));
        setJustinRows(normalizeRows(justinJson));
        setMatchupRows(normalizeRows(matchupJson));
      } catch (err) {
        setError(err?.message || "Failed to load model data.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const topPlays = useMemo(() => {
    return [
      ...buildTopPlays(v7Rows, "V7"),
      ...buildTopPlays(justinRows, "Justin"),
    ].sort((a, b) => (toNumber(b.score) ?? -Infinity) - (toNumber(a.score) ?? -Infinity));
  }, [v7Rows, justinRows]);

  const consensusRows = useMemo(() => buildConsensus(v7Rows, justinRows), [v7Rows, justinRows]);
  const v7PrimaryScore = useMemo(() => detectPrimaryScore(v7Rows), [v7Rows]);
  const justinPrimaryScore = useMemo(() => detectPrimaryScore(justinRows), [justinRows]);

  return (
    <div className="min-h-screen bg-[#020b22] text-white">
      <div className="border-b border-white/10 bg-[#020b22]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-white">PropPulse</h1>
            <p className="mt-1 text-slate-400">Baseball prediction and prop dashboard</p>
          </div>

          <div className="flex flex-wrap gap-3">
            {TAB_KEYS.map((tab) => {
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-2xl border px-5 py-2 text-sm font-semibold transition ${active ? "border-blue-500 bg-blue-600 text-white shadow-lg shadow-blue-900/40" : "border-white/10 bg-transparent text-slate-200 hover:bg-white/5"}`}
                >
                  {TAB_LABELS[tab]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {loading ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-slate-300">Loading data…</div>
        ) : error ? (
          <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-8 text-center text-red-200">Error: {error}</div>
        ) : (
          <>
            {activeTab === "home" && <HomeView v7Rows={v7Rows} justinRows={justinRows} consensusRows={consensusRows} matchupRows={matchupRows} />}
            {activeTab === "top5" && <TopBoard topPlays={topPlays.slice(0, 20)} />}
            {activeTab === "v7" && <DataTable rows={v7Rows} title="V7 Model" primaryScoreColumn={v7PrimaryScore} />}
            {activeTab === "justin" && <DataTable rows={justinRows} title="Justin Model" primaryScoreColumn={justinPrimaryScore} />}
            {activeTab === "consensus" && <DataTable rows={consensusRows} title="Consensus Board" primaryScoreColumn="avg_hit_score" />}
            {activeTab === "matchupLab" && <MatchupLabView rows={matchupRows} />}
          </>
        )}
      </main>
    </div>
  );
}
