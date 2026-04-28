import React, { useEffect, useMemo, useState } from "react";
import "./App.css";

const DATA_URL = `${import.meta.env.BASE_URL || "/"}data/prophit_latest.json`;

function safeNumber(value, decimals = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return num.toFixed(decimals);
}

function safeText(value, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function getPlayerName(player) {
  return (
    player.player_name ||
    player.name ||
    player.batter_name ||
    player.hitter_name ||
    "-"
  );
}

function getTeam(player) {
  return player.team || player.player_team || player.batting_team || "-";
}

function getOpponent(player) {
  const rawOpponent =
    player.opponent ||
    player.opp ||
    player.opposing_team ||
    player.pitching_team ||
    "-";

  const isAway =
    player.is_away === true ||
    String(player.home_away || "").toLowerCase() === "away" ||
    String(player.game_location || "").toLowerCase() === "away";

  if (rawOpponent === "-") return "-";
  return isAway && !String(rawOpponent).startsWith("@")
    ? `@${rawOpponent}`
    : rawOpponent;
}

function getGameTime(player) {
  return (
    player.game_time_et ||
    player.game_time ||
    player.start_time_et ||
    player.start_time ||
    "-"
  );
}

function getPitcher(player) {
  return (
    player.opposing_pitcher ||
    player.pitcher ||
    player.probable_pitcher ||
    player.opp_pitcher ||
    "-"
  );
}

function getPitcherHand(player) {
  return (
    player.pitcher_hand ||
    player.opp_pitcher_hand ||
    player.opposing_pitcher_hand ||
    player.p_hand ||
    "-"
  );
}

function getProjectedHits(player) {
  return (
    player.projected_hits ??
    player.proj_hits ??
    player.consensus_projected_hits ??
    player.prophit_projected_hits ??
    player.hits_projection ??
    null
  );
}

function getHitScore(player) {
  return (
    player.hit_score ??
    player.prophit_score ??
    player.consensus_hit_score ??
    player.score ??
    null
  );
}

function getConfidence(player) {
  return (
    player.confidence_score ??
    player.projection_confidence ??
    player.consensus_confidence ??
    player.confidence ??
    null
  );
}

function getFairOdds(player) {
  return (
    player.fair_odds ??
    player.hit_fair_odds ??
    player.fair_odds_1_hit ??
    player.fair_odds_one_hit ??
    "-"
  );
}

function getBattingOrder(player) {
  return (
    player.batting_order ??
    player.lineup_spot ??
    player.batting_slot ??
    player.order ??
    "-"
  );
}

function getSplitSeason(player) {
  return (
    player.season_ba_vs_hand ??
    player.ba_vs_pitcher_hand_season ??
    player.season_avg_vs_hand ??
    player.avg_vs_hand ??
    "-"
  );
}

function getSplitCareer(player) {
  return (
    player.career_ba_vs_hand ??
    player.ba_vs_pitcher_hand_career ??
    player.career_avg_vs_hand ??
    player.avg_vs_hand_career ??
    "-"
  );
}

function getLast15(player) {
  return (
    player.last_15_ba ??
    player.ba_last_15 ??
    player.avg_last_15 ??
    player.last15_avg ??
    "-"
  );
}

function getLast50(player) {
  return (
    player.last_50_ba ??
    player.ba_last_50 ??
    player.avg_last_50 ??
    player.last50_avg ??
    "-"
  );
}

function getStatus(player) {
  return (
    player.game_status ||
    player.status ||
    player.model_status ||
    player.freeze_status ||
    "Upcoming / Active"
  );
}

export default function App() {
  const [rawData, setRawData] = useState(null);
  const [players, setPlayers] = useState([]);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [lockedRows, setLockedRows] = useState({});
  const [search, setSearch] = useState("");
  const [minHitScore, setMinHitScore] = useState("");
  const [minProjectedHits, setMinProjectedHits] = useState("");
  const [sortKey, setSortKey] = useState("hit_score");
  const [sortDirection, setSortDirection] = useState("desc");

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setLoadError("");

        const response = await fetch(DATA_URL, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Could not load JSON. Status ${response.status}`);
        }

        const json = await response.json();
        setRawData(json);

        if (Array.isArray(json)) {
          setPlayers(json);
          setMeta({
            last_model_run_et: "Not available in JSON",
            freeze_rule:
              "Started games remain frozen at their pregame projection.",
          });
        } else {
          setPlayers(json.players || json.data || []);
          setMeta(json.meta || {});
        }
      } catch (error) {
        console.error(error);
        setLoadError(error.message || "Unable to load PropHit data.");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const filteredPlayers = useMemo(() => {
    const searchLower = search.trim().toLowerCase();

    let rows = [...players];

    if (searchLower) {
      rows = rows.filter((player) => {
        const combined = [
          getPlayerName(player),
          getTeam(player),
          getOpponent(player),
          getPitcher(player),
          getPitcherHand(player),
        ]
          .join(" ")
          .toLowerCase();

        return combined.includes(searchLower);
      });
    }

    if (minHitScore !== "") {
      rows = rows.filter((player) => {
        const value = Number(getHitScore(player));
        return Number.isFinite(value) && value >= Number(minHitScore);
      });
    }

    if (minProjectedHits !== "") {
      rows = rows.filter((player) => {
        const value = Number(getProjectedHits(player));
        return Number.isFinite(value) && value >= Number(minProjectedHits);
      });
    }

    rows.sort((a, b) => {
      let aValue;
      let bValue;

      if (sortKey === "player") {
        aValue = getPlayerName(a);
        bValue = getPlayerName(b);
      } else if (sortKey === "team") {
        aValue = getTeam(a);
        bValue = getTeam(b);
      } else if (sortKey === "time") {
        aValue = getGameTime(a);
        bValue = getGameTime(b);
      } else if (sortKey === "projected_hits") {
        aValue = Number(getProjectedHits(a));
        bValue = Number(getProjectedHits(b));
      } else if (sortKey === "confidence") {
        aValue = Number(getConfidence(a));
        bValue = Number(getConfidence(b));
      } else {
        aValue = Number(getHitScore(a));
        bValue = Number(getHitScore(b));
      }

      if (typeof aValue === "string" || typeof bValue === "string") {
        const result = String(aValue).localeCompare(String(bValue));
        return sortDirection === "asc" ? result : -result;
      }

      if (!Number.isFinite(aValue)) aValue = -999999;
      if (!Number.isFinite(bValue)) bValue = -999999;

      return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
    });

    const locked = rows.filter((player) => lockedRows[getPlayerName(player)]);
    const unlocked = rows.filter((player) => !lockedRows[getPlayerName(player)]);

    return [...locked, ...unlocked];
  }, [
    players,
    search,
    minHitScore,
    minProjectedHits,
    sortKey,
    sortDirection,
    lockedRows,
  ]);

  function toggleLock(player) {
    const name = getPlayerName(player);

    setLockedRows((previous) => ({
      ...previous,
      [name]: !previous[name],
    }));
  }

  function handleSort(nextKey) {
    if (sortKey === nextKey) {
      setSortDirection((previous) => (previous === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(nextKey);
      setSortDirection("desc");
    }
  }

  const lastRun =
    meta.last_model_run_et ||
    meta.last_run_et ||
    meta.generated_at_et ||
    meta.updated_at_et ||
    "Not available";

  const modelName = meta.model_name || "PropHit";
  const freezeRule =
    meta.freeze_rule ||
    "Started games remain frozen at their pregame projection.";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-[1600px] px-4 py-5">
        <header className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-xl">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.35em] text-emerald-300">
                {modelName}
              </div>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">
                PropHit Board
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Hit projections, fair odds, confidence, splits, and frozen
                pregame projections.
              </p>
            </div>

            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-right">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                AI Model Status
              </div>
              <div className="mt-1 text-sm text-slate-200">
                Last Model Run:{" "}
                <span className="font-semibold text-emerald-300">
                  {lastRun}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-500">{freezeRule}</div>
            </div>
          </div>
        </header>

        <section className="mb-4 grid grid-cols-1 gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 md:grid-cols-2 xl:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Search</label>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Player, team, pitcher..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Min Hit Score
            </label>
            <input
              value={minHitScore}
              onChange={(event) => setMinHitScore(event.target.value)}
              placeholder="Example: 80"
              type="number"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Min Projected Hits
            </label>
            <input
              value={minProjectedHits}
              onChange={(event) => setMinProjectedHits(event.target.value)}
              placeholder="Example: 1.10"
              type="number"
              step="0.01"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Sort By
            </label>
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
            >
              <option value="hit_score">Hit Score</option>
              <option value="projected_hits">Projected Hits</option>
              <option value="confidence">Confidence</option>
              <option value="player">Player</option>
              <option value="team">Team</option>
              <option value="time">Game Time</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Direction
            </label>
            <select
              value={sortDirection}
              onChange={(event) => setSortDirection(event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
            >
              <option value="desc">High to Low</option>
              <option value="asc">Low to High</option>
            </select>
          </div>
        </section>

        {loading && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-300">
            Loading PropHit data...
          </div>
        )}

        {loadError && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-red-200">
            {loadError}
          </div>
        )}

        {!loading && !loadError && (
          <>
            <div className="mb-3 text-sm text-slate-400">
              Showing{" "}
              <span className="font-semibold text-slate-200">
                {filteredPlayers.length}
              </span>{" "}
              players
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-2xl">
              <div className="overflow-x-auto">
                <table className="min-w-[1450px] w-full border-collapse text-sm">
                  <thead className="sticky top-0 z-20 bg-slate-900">
                    <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
                      <th className="sticky left-0 z-30 bg-slate-900 px-3 py-3 text-left">
                        Lock
                      </th>
                      <th
                        onClick={() => handleSort("player")}
                        className="sticky left-[64px] z-30 cursor-pointer bg-slate-900 px-3 py-3 text-left"
                      >
                        Player
                      </th>
                      <th
                        onClick={() => handleSort("team")}
                        className="px-3 py-3 text-left cursor-pointer"
                      >
                        Team
                      </th>
                      <th className="px-3 py-3 text-left">Opponent</th>
                      <th
                        onClick={() => handleSort("time")}
                        className="px-3 py-3 text-left cursor-pointer"
                      >
                        Time
                      </th>
                      <th className="px-3 py-3 text-left">Pitcher</th>
                      <th className="px-3 py-3 text-left">Hand</th>
                      <th className="px-3 py-3 text-right">Order</th>
                      <th
                        onClick={() => handleSort("projected_hits")}
                        className="px-3 py-3 text-right cursor-pointer"
                      >
                        Proj Hits
                      </th>
                      <th
                        onClick={() => handleSort("hit_score")}
                        className="px-3 py-3 text-right cursor-pointer"
                      >
                        Hit Score
                      </th>
                      <th
                        onClick={() => handleSort("confidence")}
                        className="px-3 py-3 text-right cursor-pointer"
                      >
                        Confidence
                      </th>
                      <th className="px-3 py-3 text-right">Fair Odds</th>
                      <th className="px-3 py-3 text-right">Season Split</th>
                      <th className="px-3 py-3 text-right">Career Split</th>
                      <th className="px-3 py-3 text-right">Last 15</th>
                      <th className="px-3 py-3 text-right">Last 50</th>
                      <th className="px-3 py-3 text-left">Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredPlayers.map((player, index) => {
                      const name = getPlayerName(player);
                      const locked = !!lockedRows[name];

                      return (
                        <tr
                          key={`${name}-${index}`}
                          className={`border-b border-slate-800/70 hover:bg-slate-800/60 ${
                            locked ? "bg-emerald-500/10" : ""
                          }`}
                        >
                          <td className="sticky left-0 z-10 bg-slate-950 px-3 py-3">
                            <button
                              onClick={() => toggleLock(player)}
                              className={`rounded-lg border px-2 py-1 text-xs ${
                                locked
                                  ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                                  : "border-slate-700 bg-slate-900 text-slate-400"
                              }`}
                              title="Lock row to top"
                            >
                              {locked ? "🔒" : "□"}
                            </button>
                          </td>

                          <td className="sticky left-[64px] z-10 bg-slate-950 px-3 py-3">
                            <button
                              onClick={() => setSelectedPlayer(player)}
                              className="font-semibold text-emerald-300 hover:text-emerald-200 hover:underline"
                            >
                              {name}
                            </button>
                          </td>

                          <td className="px-3 py-3 text-slate-200">
                            {getTeam(player)}
                          </td>
                          <td className="px-3 py-3 text-slate-200">
                            {getOpponent(player)}
                          </td>
                          <td className="px-3 py-3 text-slate-300">
                            {getGameTime(player)}
                          </td>
                          <td className="px-3 py-3 text-slate-300">
                            {getPitcher(player)}
                          </td>
                          <td className="px-3 py-3 text-slate-300">
                            {getPitcherHand(player)}
                          </td>
                          <td className="px-3 py-3 text-right text-slate-300">
                            {getBattingOrder(player)}
                          </td>
                          <td className="px-3 py-3 text-right font-semibold text-slate-100">
                            {safeNumber(getProjectedHits(player), 2)}
                          </td>
                          <td className="px-3 py-3 text-right font-semibold text-emerald-300">
                            {safeNumber(getHitScore(player), 1)}
                          </td>
                          <td className="px-3 py-3 text-right text-slate-100">
                            {safeNumber(getConfidence(player), 1)}
                          </td>
                          <td className="px-3 py-3 text-right text-slate-100">
                            {getFairOdds(player)}
                          </td>
                          <td className="px-3 py-3 text-right text-slate-300">
                            {safeText(getSplitSeason(player))}
                          </td>
                          <td className="px-3 py-3 text-right text-slate-300">
                            {safeText(getSplitCareer(player))}
                          </td>
                          <td className="px-3 py-3 text-right text-slate-300">
                            {safeText(getLast15(player))}
                          </td>
                          <td className="px-3 py-3 text-right text-slate-300">
                            {safeText(getLast50(player))}
                          </td>
                          <td className="px-3 py-3 text-slate-400">
                            {getStatus(player)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {selectedPlayer && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
            <div className="h-full w-full max-w-xl overflow-y-auto border-l border-slate-700 bg-slate-950 p-5 shadow-2xl">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.3em] text-emerald-300">
                    Player Drilldown
                  </div>
                  <h2 className="mt-1 text-2xl font-bold">
                    {getPlayerName(selectedPlayer)}
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    {getTeam(selectedPlayer)} vs {getOpponent(selectedPlayer)}
                  </p>
                </div>

                <button
                  onClick={() => setSelectedPlayer(null)}
                  className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
                >
                  Close
                </button>
              </div>

              <div className="mb-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-400">
                  AI Model Status
                </div>
                <div className="mt-1 text-sm">
                  Last Model Run:{" "}
                  <span className="font-semibold text-emerald-300">
                    {lastRun}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <MetricCard
                  label="Projected Hits"
                  value={safeNumber(getProjectedHits(selectedPlayer), 2)}
                />
                <MetricCard
                  label="Hit Score"
                  value={safeNumber(getHitScore(selectedPlayer), 1)}
                />
                <MetricCard
                  label="Confidence"
                  value={safeNumber(getConfidence(selectedPlayer), 1)}
                />
                <MetricCard label="Fair Odds" value={getFairOdds(selectedPlayer)} />
                <MetricCard
                  label="Batting Order"
                  value={getBattingOrder(selectedPlayer)}
                />
                <MetricCard label="Pitcher" value={getPitcher(selectedPlayer)} />
                <MetricCard
                  label="Pitcher Hand"
                  value={getPitcherHand(selectedPlayer)}
                />
                <MetricCard label="Game Time" value={getGameTime(selectedPlayer)} />
              </div>

              <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-200">
                  Splits
                </h3>

                <div className="space-y-2 text-sm">
                  <DetailRow
                    label="Season BA vs Hand"
                    value={safeText(getSplitSeason(selectedPlayer))}
                  />
                  <DetailRow
                    label="Career BA vs Hand"
                    value={safeText(getSplitCareer(selectedPlayer))}
                  />
                  <DetailRow
                    label="Last 15 BA"
                    value={safeText(getLast15(selectedPlayer))}
                  />
                  <DetailRow
                    label="Last 50 BA"
                    value={safeText(getLast50(selectedPlayer))}
                  />
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-200">
                  Raw Player Data
                </h3>

                <pre className="max-h-[360px] overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-300">
                  {JSON.stringify(selectedPlayer, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-xl font-bold text-slate-100">{value}</div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-2">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold text-slate-100">{value}</span>
    </div>
  );
}
