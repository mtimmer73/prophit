import React, { useEffect, useMemo, useState } from "react";

export default function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/proppulse_mlb_edges_v1.json")
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading JSON:", err);
        setLoading(false);
      });
  }, []);

  const topPlays = useMemo(() => {
    return data
      .filter((p) => p.best_prop)
      .sort((a, b) => b.best_prop_ev - a.best_prop_ev)
      .slice(0, 30);
  }, [data]);

  if (loading) {
    return <div style={styles.loading}>Loading PropPulse...</div>;
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>🔥 PropPulse MLB Top Plays</h1>

      <div style={styles.grid}>
        {topPlays.map((p, i) => (
          <div key={i} style={styles.card}>
            <h2 style={styles.player}>{p.player}</h2>
            <p style={styles.matchup}>
              {p.team} vs {p.opp}
            </p>

            <div style={styles.prop}>{p.best_prop} AUTO PLAY</div>

            <div style={styles.metrics}>
              <div>
                <strong>EV:</strong> {format(p.best_prop_ev)}
              </div>
              <div>
                <strong>Edge:</strong> {format(p.best_prop_edge)}
              </div>
              <div>
                <strong>Confidence:</strong> {p.confidence_score}
              </div>
            </div>

            <div style={styles.flags}>{p.edge_flags}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function format(val) {
  if (!val && val !== 0) return "-";
  return Number(val).toFixed(3);
}

const styles = {
  page: {
    background: "#0b1020",
    minHeight: "100vh",
    color: "white",
    padding: "20px",
    fontFamily: "Arial",
  },
  title: {
    fontSize: "32px",
    marginBottom: "20px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "16px",
  },
  card: {
    background: "#141c32",
    padding: "16px",
    borderRadius: "16px",
    border: "1px solid #2a3a5f",
  },
  player: {
    margin: 0,
    fontSize: "20px",
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
    marginBottom: "10px",
  },
  flags: {
    fontSize: "12px",
    color: "#aab8d6",
  },
  loading: {
    color: "white",
    padding: "50px",
    fontSize: "24px",
  },
};