// force rebuild

import React, { useEffect, useMemo, useState } from "react";
import "./App.css";

const DATA_URL = `${import.meta.env.BASE_URL}data/prophit_latest.json`;
const PERF_URL = `${import.meta.env.BASE_URL}data/prophit_performance_summary.json`;

function gradeFromConfidence(score) {
  const n = Number(score || 0);
  if (n >= 80) return "A";
  if (n >= 70) return "B";
  if (n >= 60) return "C";
  if (n >= 45) return "D";
  return "F";
}

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pct(value) {
  const n = safeNum(value);
  if (n <= 1) return `${(n * 100).toFixed(1)}%`;
  return `${n.toFixed(1)}%`;
}

function App() {
  const [rows, setRows] = useState([]);
  const [performance, setPerformance] = useState(null);
  const [error, setError] = useState("");
  const [locked, setLocked] = useState({});
  const [selected, setSelected] = useState(null);

  const [filters, setFilters] = useState({
    search: "",
    minProb: 0.58,
    minScore: 70,
    minConf: 60,
    minAvgVsHand: 0.260,
    minPitcherBaa: 0.260,
    confirmedOnly: false,
    strongOnly: false,
    eliteOnly: false,
  });

  useEffect(() => {
    async function loadData() {
      try {
        setError("");

        const res = await fetch(DATA_URL, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Unable to load ${DATA_URL}`);
        }

        const json = await res.json();

        const dataRows = Array.isArray(json)
          ? json
          : Array.isArray(json.players)
          ? json.players
          : Array.isArray(json.rows)
          ? json.rows
          : [];

        setRows(dataRows);
      } catch (err) {
        setError(err.message);
      }
    }

    async function loadPerformance() {
      try {
        const res = await fetch(PERF_URL, { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        setPerformance(json);
      } catch {
        setPerformance(null);
      }
    }

    loadData();
    loadPerformance();
  }, []);

  const filteredRows = useMemo(() => {
    const q = filters.search.toLowerCase().trim();

    return rows
      .filter((r) => {
        const player = String(r.player || r.player_name || "").toLowerCase();
        const team = String(r.team || "").toLowerCase();
        const opp = String(r.opponent || r.opp || "").toLowerCase();
        const pitcher = String(r.pitcher || r.opposing_pitcher || "").toLowerCase();

        const prob = safeNum(r.probability ?? r.hit_probability ?? r.top_prob);
        const score = safeNum(r.score ?? r.hit_score ?? r.prophit_score);
        const conf = safeNum(r.confidence ?? r.confidence_score);
        const avgVsHand = safeNum(r.avg_vs_hand ?? r.batter_avg_vs_hand);
        const pitcherBaa = safeNum(
          r.pitcher_baa_vs_batter_hand ??
            r.pitcher_season_baa_allowed_vs_batter_hand ??
            r.pitcher_baa
        );

        const confirmed =
          r.confirmed === true ||
          r.lineup_confirmed === true ||
          String(r.status || "").toLowerCase().includes("confirmed");

        const haystack = `${player} ${team} ${opp} ${pitcher}`;

        if (q && !haystack.includes(q)) return false;
        if (prob < Number(filters.minProb)) return false;
        if (score < Number(filters.minScore)) return false;
        if (conf < Number(filters.minConf)) return false;
        if (avgVsHand < Number(filters.minAvgVsHand)) return false;
        if (pitcherBaa < Number(filters.minPitcherBaa)) return false;
        if (filters.confirmedOnly && !confirmed) return false;
        if (filters.strongOnly && score < 75) return false;
        if (filters.eliteOnly && score < 80) return false;

        return true;
      })
      .sort((a, b) => {
        const lockedA = locked[a.player || a.player_name] ? 1 : 0;
        const lockedB = locked[b.player || b.player_name] ? 1 : 0;
        if (lockedA !== lockedB) return lockedB - lockedA;

        return (
          safeNum(b.score ?? b.hit_score ?? b.prophit_score) -
          safeNum(a.score ?? a.hit_score ?? a.prophit_score)
        );
      });
  }, [rows, filters, locked]);

  function updateFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function clearFilters() {
    setFilters({
      search: "",
      minProb: 0,
      minScore: 0,
      minConf: 0,
      minAvgVsHand: 0,
      minPitcherBaa: 0,
      confirmedOnly: false,
      strongOnly: false,
      eliteOnly: false,
    });
  }

  function toggleLock(row) {
    const id = row.player || row.player_name;
    setLocked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function exportExcel() {
    const csvRows = [
      [
        "Player",
        "Team",
        "Opponent",
        "Pitcher",
        "Probability",
        "Score",
        "Confidence",
        "Grade",
        "AVG vs Hand",
        "Pitcher BAA",
        "Fair Odds",
      ],
      ...filteredRows.map((r) => [
        r.player || r.player_name || "",
        r.team || "",
        r.opponent || r.opp || "",
        r.pitcher || r.opposing_pitcher || "",
        r.probability ?? r.hit_probability ?? r.top_prob ?? "",
        r.score ?? r.hit_score ?? r.prophit_score ?? "",
        r.confidence ?? r.confidence_score ?? "",
        gradeFromConfidence(r.confidence ?? r.confidence_score),
        r.avg_vs_hand ?? r.batter_avg_vs_hand ?? "",
        r.pitcher_baa_vs_batter_hand ??
          r.pitcher_season_baa_allowed_vs_batter_hand ??
          r.pitcher_baa ??
          "",
        r.fair_odds ?? "",
      ]),
    ];

    const csv = csvRows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "prophit_board.csv";
    a.click();

    URL.revokeObjectURL(url);
  }

  return (
    <div className="app">
      <header className="hero">
        <div>
          <h1>PropHit</h1>
          <p>Daily MLB hitter board powered by matchup probability, confidence, and split quality.</p>
        </div>
        <div className="hero-card">
          <span>Visible Plays</span>
          <strong>{filteredRows.length}</strong>
        </div>
      </header>

      <section className="top-grid">
        <div className="panel large-panel">
          <h3>Board Summary</h3>
          <p>
            This board loads live from:
            <br />
            <code>{DATA_URL}</code>
          </p>
        </div>

        <div className="panel">
          <h3>Confidence Key</h3>
          <div className="grade-row">
            <span>A<br />80+</span>
            <span>B<br />70-79</span>
            <span>C<br />60-69</span>
            <span>D<br />45-59</span>
            <span>F<br />&lt;45</span>
          </div>

          <div className="metric-box">
            <small>Avg Top Prob</small>
            <strong>{performance?.avg_top_prob ? pct(performance.avg_top_prob) : "—"}</strong>
          </div>
        </div>
      </section>

      <section className="filter-grid">
        <div className="panel filters">
          <h3>Filters</h3>

          <div className="inputs">
            <label>
              Search
              <input
                value={filters.search}
                onChange={(e) => updateFilter("search", e.target.value)}
                placeholder="Player, team, pitcher..."
              />
            </label>

            <label>
              Min Prob
              <input
                type="number"
                step="0.01"
                value={filters.minProb}
                onChange={(e) => updateFilter("minProb", e.target.value)}
              />
            </label>

            <label>
              Min Score
              <input
                type="number"
                value={filters.minScore}
                onChange={(e) => updateFilter("minScore", e.target.value)}
              />
            </label>

            <label>
              Min Conf
              <input
                type="number"
                value={filters.minConf}
                onChange={(e) => updateFilter("minConf", e.target.value)}
              />
            </label>

            <label>
              Min AVG vs Hand
              <input
                type="number"
                step="0.001"
                value={filters.minAvgVsHand}
                onChange={(e) => updateFilter("minAvgVsHand", e.target.value)}
              />
            </label>

            <label>
              Min Pitcher BAA
              <input
                type="number"
                step="0.001"
                value={filters.minPitcherBaa}
                onChange={(e) => updateFilter("minPitcherBaa", e.target.value)}
              />
            </label>
          </div>

          <div className="button-row">
            <button onClick={() => updateFilter("confirmedOnly", !filters.confirmedOnly)}>
              Confirmed Only
            </button>
            <button onClick={() => updateFilter("strongOnly", !filters.strongOnly)}>
              Strong Only
            </button>
            <button onClick={() => updateFilter("eliteOnly", !filters.eliteOnly)}>
              Elite Only
            </button>
            <button onClick={clearFilters}>Clear</button>
          </div>
        </div>

        <div className="panel why">
          <h3>Why These Plays</h3>
          {filteredRows.length ? (
            <p>
              Showing hitters that meet your probability, score, confidence, batter split,
              and pitcher BAA thresholds.
            </p>
          ) : (
            <p>No visible plays meet the current filters. Clear filters or wait for the next slate refresh.</p>
          )}
        </div>
      </section>

      <section className="board panel">
        <div className="board-header">
          <h2>PropHit Board</h2>
          <div>
            <button onClick={exportExcel}>Export Excel</button>
          </div>
        </div>

        {error && <div className="error">{error}</div>}

        {!error && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="sticky-col">Lock</th>
                  <th className="sticky-name">Player</th>
                  <th>Team</th>
                  <th>Opp</th>
                  <th>Pitcher</th>
                  <th>Prob</th>
                  <th>Score</th>
                  <th>Conf</th>
                  <th>Grade</th>
                  <th>AVG vs Hand</th>
                  <th>Pitcher BAA</th>
                  <th>Fair Odds</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.map((r, idx) => {
                  const name = r.player || r.player_name || `Player ${idx + 1}`;
                  const isLocked = locked[name];

                  const opponentRaw = r.opponent || r.opp || "";
                  const isAway = r.is_away === true || r.away === true;
                  const opponent = isAway && opponentRaw && !String(opponentRaw).startsWith("@")
                    ? `@${opponentRaw}`
                    : opponentRaw;

                  return (
                    <tr key={`${name}-${idx}`} className={isLocked ? "locked-row" : ""}>
                      <td className="sticky-col">
                        <button className="lock-btn" onClick={() => toggleLock(r)}>
                          {isLocked ? "🔒" : "⬜"}
                        </button>
                      </td>

                      <td className="sticky-name">
                        <button className="player-link" onClick={() => setSelected(r)}>
                          {name}
                        </button>
                      </td>

                      <td>{r.team || ""}</td>
                      <td>{opponent}</td>
                      <td>{r.pitcher || r.opposing_pitcher || ""}</td>
                      <td>{pct(r.probability ?? r.hit_probability ?? r.top_prob)}</td>
                      <td>{safeNum(r.score ?? r.hit_score ?? r.prophit_score).toFixed(1)}</td>
                      <td>{safeNum(r.confidence ?? r.confidence_score).toFixed(1)}</td>
                      <td>{gradeFromConfidence(r.confidence ?? r.confidence_score)}</td>
                      <td>{safeNum(r.avg_vs_hand ?? r.batter_avg_vs_hand).toFixed(3)}</td>
                      <td>
                        {safeNum(
                          r.pitcher_baa_vs_batter_hand ??
                            r.pitcher_season_baa_allowed_vs_batter_hand ??
                            r.pitcher_baa
                        ).toFixed(3)}
                      </td>
                      <td>{r.fair_odds ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <aside className="drawer">
          <button className="close" onClick={() => setSelected(null)}>×</button>
          <h2>{selected.player || selected.player_name}</h2>

          <div className="drawer-grid">
            {Object.entries(selected).map(([key, value]) => (
              <div key={key}>
                <small>{key}</small>
                <strong>{String(value)}</strong>
              </div>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}

export default App;
