import React, { useEffect, useMemo, useState } from "react";

const DATA_URL = `${import.meta.env.BASE_URL}data/prophit_latest.json`;
const PERF_URL = `${import.meta.env.BASE_URL}data/prophit_performance_summary.json`;

export default function App() {
  const [data, setData] = useState([]);
  const [performance, setPerformance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [filters, setFilters] = useState({
    search: "",
    minProb: 0.58,
    minScore: 70,
    minConf: 60,
    minAvgVsHand: 0.26,
    minPitcherBaa: 0.26,
  });

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch(DATA_URL, { cache: "no-store" });

        if (!res.ok) {
          throw new Error(`Unable to load ${DATA_URL}`);
        }

        const json = await res.json();

        const rows = Array.isArray(json)
          ? json
          : Array.isArray(json.players)
          ? json.players
          : Array.isArray(json.rows)
          ? json.rows
          : [];

        setData(rows);
      } catch (err) {
        console.error("Error loading JSON:", err);
        setError(err.message);
      } finally {
        setLoading(false);
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

  const topPlays = useMemo(() => {
    const search = filters.search.toLowerCase().trim();

    return data
      .filter((p) => {
        const player = String(p.player || p.player_name || "").toLowerCase();
        const team = String(p.team || "").toLowerCase();
        const opp = String(p.opp || p.opponent || "").toLowerCase();
        const pitcher = String(p.pitcher || p.opposing_pitcher || "").toLowerCase();

        const prob = num(p.probability ?? p.hit_probability ?? p.top_prob);
        const score = num(p.score ?? p.hit_score ?? p.prophit_score);
        const conf = num(p.confidence ?? p.confidence_score);
        const avgVsHand = num(p.avg_vs_hand ?? p.batter_avg_vs_hand);
        const pitcherBaa = num(
          p.pitcher_baa_vs_batter_hand ??
            p.pitcher_season_baa_allowed_vs_batter_hand ??
            p.pitcher_baa
        );

        const haystack = `${player} ${team} ${opp} ${pitcher}`;

        if (search && !haystack.includes(search)) return false;
        if (prob < Number(filters.minProb)) return false;
        if (score < Number(filters.minScore)) return false;
        if (conf < Number(filters.minConf)) return false;
        if (avgVsHand < Number(filters.minAvgVsHand)) return false;
        if (pitcherBaa < Number(filters.minPitcherBaa)) return false;

        return true;
      })
      .sort(
        (a, b) =>
          num(b.score ?? b.hit_score ?? b.prophit_score) -
          num(a.score ?? a.hit_score ?? a.prophit_score)
      );
  }, [data, filters]);

  if (loading) {
    return <div style={styles.loading}>Loading PropHit...</div>;
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>🔥 PropHit MLB Board</h1>

      <div style={styles.summary}>
        <div>
          <strong>Total Loaded:</strong> {data.length}
        </div>
        <div>
          <strong>Visible Plays:</strong> {topPlays.length}
        </div>
        <div>
          <strong>Avg Top Prob:</strong>{" "}
          {performance?.avg_top_prob ? pct(performance.avg_top_prob) : "—"}
        </div>
      </div>

      <div style={styles.filters}>
        <input
          style={styles.input}
          placeholder="Search player, team, pitcher..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        />

        <input
          style={styles.input}
          type="number"
          step="0.01"
          value={filters.minProb}
          onChange={(e) => setFilters({ ...filters, minProb: e.target.value })}
          placeholder="Min Prob"
        />

        <input
          style={styles.input}
          type="number"
          value={filters.minScore}
          onChange={(e) => setFilters({ ...filters, minScore: e.target.value })}
          placeholder="Min Score"
        />

        <input
          style={styles.input}
          type="number"
          value={filters.minConf}
          onChange={(e) => setFilters({ ...filters, minConf: e.target.value })}
          placeholder="Min Conf"
        />

        <button
          style={styles.button}
          onClick={() =>
            setFilters({
              search: "",
              minProb: 0,
              minScore: 0,
              minConf: 0,
              minAvgVsHand: 0,
              minPitcherBaa: 0,
            })
          }
        >
          Clear Filters
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {!error && topPlays.length === 0 && (
        <div style={styles.error}>
          No visible plays meet the current filters. Clear filters or lower thresholds.
        </div>
      )}

      <div style={styles.grid}>
        {topPlays.map((p, i) => {
          const player = p.player || p.player_name || "Unknown Player";
          const score = num(p.score ?? p.hit_score ?? p.prophit_score);
          const prob = num(p.probability ?? p.hit_probability ?? p.top_prob);
          const conf = num(p.confidence ?? p.confidence_score);

          return (
            <div key={`${player}-${i}`} style={styles.card}>
              <h2 style={styles.player}>{player}</h2>

              <p style={styles.matchup}>
                {p.team || "—"} vs {p.opp || p.opponent || "—"}
              </p>

              <div style={styles.prop}>PROP HIT PLAY</div>

              <div style={styles.metrics}>
                <div>
                  <strong>Probability:</strong> {pct(prob)}
                </div>
                <div>
                  <strong>Score:</strong> {score.toFixed(1)}
                </div>
                <div>
                  <strong>Confidence:</strong> {conf.toFixed(1)}
                </div>
                <div>
                  <strong>Grade:</strong> {grade(conf)}
                </div>
                <div>
                  <strong>Fair Odds:</strong> {p.fair_odds ?? "—"}
                </div>
                <div>
                  <strong>Pitcher:</strong> {p.pitcher || p.opposing_pitcher || "—"}
                </div>
              </div>

              <div style={styles.flags}>
                AVG vs Hand: {format(p.avg_vs_hand ?? p.batter_avg_vs_hand)} | Pitcher BAA:{" "}
                {format(
                  p.pitcher_baa_vs_batter_hand ??
                    p.pitcher_season_baa_allowed_vs_batter_hand ??
                    p.pitcher_baa
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function format(value) {
  if (value === undefined || value === null || value === "") return "-";
  return Number(value).toFixed(3);
}

function pct(value) {
  const n = num(value);
  return n <= 1 ? `${(n * 100).toFixed(1)}%` : `${n.toFixed(1)}%`;
}

function grade(score) {
  const n = num(score);
  if (n >= 80) return "A";
  if (n >= 70) return "B";
  if (n >= 60) return "C";
  if (n >= 45) return "D";
  return "F";
}

const styles = {
  page: {
    background: "#050b18",
    minHeight: "100vh",
    color: "white",
    padding: "24px",
    fontFamily: "Arial, sans-serif",
  },
  title: {
    fontSize: "34px",
    marginBottom: "18px",
  },
  summary: {
    display: "flex",
    gap: "18px",
    flexWrap: "wrap",
    background: "#0d172b",
    border: "1px solid #14365c",
    padding: "14px",
    borderRadius: "14px",
    marginBottom: "18px",
  },
  filters: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
    marginBottom: "20px",
  },
  input: {
    background: "#071020",
    color: "white",
    border: "1px solid #15527d",
    borderRadius: "12px",
    padding: "12px",
    minWidth: "190px",
  },
  button: {
    background: "#07395a",
    color: "white",
    border: "1px solid #1f8bc0",
    borderRadius: "12px",
    padding: "12px 16px",
    fontWeight: "bold",
    cursor: "pointer",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "16px",
  },
  card: {
    background: "#101a2f",
    padding: "16px",
    borderRadius: "16px",
    border: "1px solid #21446d",
    boxShadow: "0 8px 18px rgba(0,0,0,0.25)",
  },
  player: {
    margin: 0,
    fontSize: "21px",
  },
  matchup: {
    color: "#9fb3d9",
    marginBottom: "10px",
  },
  prop: {
    color: "#4ade80",
    fontWeight: "bold",
    marginBottom: "10px",
  },
  metrics: {
    fontSize: "14px",
    lineHeight: "1.8",
    marginBottom: "10px",
  },
  flags: {
    fontSize: "12px",
    color: "#aab8d6",
  },
  error: {
    color: "#ff4d6d",
    background: "#160814",
    border: "1px solid #5f1d35",
    padding: "14px",
    borderRadius: "12px",
    marginBottom: "18px",
  },
  loading: {
    background: "#050b18",
    minHeight: "100vh",
    color: "white",
    padding: "50px",
    fontSize: "24px",
  },
};
