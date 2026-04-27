import React from "react";
import * as XLSX from "xlsx";

export default function App() {
  const [players, setPlayers] = React.useState([]);
  const [status, setStatus] = React.useState("Loading real slate JSON...");
  const [search, setSearch] = React.useState("");
  const [teamFilter, setTeamFilter] = React.useState("ALL");
  const [sortKey, setSortKey] = React.useState("hit_score");
  const [sortDirection, setSortDirection] = React.useState("desc");

  React.useEffect(() => {
    fetch("/proppulse_v6_all_players.json")
      .then((res) => res.json())
      .then((data) => {
        setPlayers(Array.isArray(data) ? data : []);
        setStatus(`Loaded real slate: ${Array.isArray(data) ? data.length : 0} players`);
      })
      .catch(() => {
        setStatus("Failed to load JSON");
      });
  }, []);

  const teams = ["ALL", ...new Set(players.map((p) => p.team).filter(Boolean))].sort();

  const filtered = players.filter((p) => {
    const matchesSearch = (p.player || "").toLowerCase().includes(search.toLowerCase());
    const matchesTeam = teamFilter === "ALL" || p.team === teamFilter;
    return matchesSearch && matchesTeam;
  });

  const getValue = (player, key) => {
    const fallbacks = {
      projected_hits: ["projected_hits", "projHits"],
      hit_score: ["hit_score", "hitScore", "Hit Score"],
      projected_runs: ["projected_runs", "projRuns"],
      run_score: ["run_score", "runScore", "Run Score"],
      projected_hr: ["projected_hr", "projHR"],
      hr_score: ["hr_score", "hrScore", "HR Score"],
      projected_rbi: ["projected_rbi", "projRBI"],
      rbi_score: ["rbi_score", "rbiScore", "RBI Score"],
      projected_sb: ["projected_sb", "projSB"],
      sb_score: ["sb_score", "sbScore", "SB Score"],
      player: ["player"],
      team: ["team"],
      opp: ["opp"],
    };

    const keys = fallbacks[key] || [key];
    for (const k of keys) {
      if (player[k] !== undefined && player[k] !== null) {
        return player[k];
      }
    }
    return "";
  };

  const sorted = [...filtered].sort((a, b) => {
    const aVal = getValue(a, sortKey);
    const bVal = getValue(b, sortKey);

    const aNum = Number(aVal);
    const bNum = Number(bVal);
    const bothNumeric = !Number.isNaN(aNum) && !Number.isNaN(bNum) && aVal !== "" && bVal !== "";

    if (bothNumeric) {
      return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
    }

    return sortDirection === "asc"
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  const sortLabel = (key) => {
    if (sortKey !== key) return "";
    return sortDirection === "asc" ? " ↑" : " ↓";
  };

  const exportToExcel = () => {
    const rows = sorted.map((p) => ({
      Player: getValue(p, "player"),
      Team: getValue(p, "team"),
      Opp: getValue(p, "opp"),
      "Proj Hits": getValue(p, "projected_hits"),
      "Hit Score": getValue(p, "hit_score"),
      "Proj Runs": getValue(p, "projected_runs"),
      "Run Score": getValue(p, "run_score"),
      "Proj HR": getValue(p, "projected_hr"),
      "HR Score": getValue(p, "hr_score"),
      "Proj RBI": getValue(p, "projected_rbi"),
      "RBI Score": getValue(p, "rbi_score"),
      "Proj SB": getValue(p, "projected_sb"),
      "SB Score": getValue(p, "sb_score"),
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "PropPulse V6");
    XLSX.writeFile(workbook, "PropPulse_V6_All_Players.xlsx");
  };

  const thStyle = { cursor: "pointer", background: "#07153a", color: "white" };
  const tdStyle = { padding: 8, border: "1px solid #5f6b8a", textAlign: "center" };

  return (
    <div style={{ padding: 20, background: "#0f172a", minHeight: "100vh", color: "white" }}>
      <h1 style={{ marginBottom: 8 }}>PropPulse V6 – All Players Dashboard</h1>
      <p>{status}</p>

      <div style={{ marginBottom: 20, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          placeholder="Search player..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: 6 }}
        />

        <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} style={{ padding: 6 }}>
          {teams.map((team) => (
            <option key={team} value={team}>{team}</option>
          ))}
        </select>

        <button onClick={exportToExcel} style={{ padding: "6px 10px", cursor: "pointer" }}>
          Export table to Excel
        </button>
      </div>

      <table cellPadding="6" style={{ width: "100%", background: "#020617", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle} onClick={() => handleSort("player")}>Player{sortLabel("player")}</th>
            <th style={thStyle} onClick={() => handleSort("team")}>Team{sortLabel("team")}</th>
            <th style={thStyle} onClick={() => handleSort("opp")}>Opp{sortLabel("opp")}</th>
            <th style={thStyle} onClick={() => handleSort("projected_hits")}>Proj Hits{sortLabel("projected_hits")}</th>
            <th style={thStyle} onClick={() => handleSort("hit_score")}>Hit Score{sortLabel("hit_score")}</th>
            <th style={thStyle} onClick={() => handleSort("projected_runs")}>Proj Runs{sortLabel("projected_runs")}</th>
            <th style={thStyle} onClick={() => handleSort("run_score")}>Run Score{sortLabel("run_score")}</th>
            <th style={thStyle} onClick={() => handleSort("projected_hr")}>Proj HR{sortLabel("projected_hr")}</th>
            <th style={thStyle} onClick={() => handleSort("hr_score")}>HR Score{sortLabel("hr_score")}</th>
            <th style={thStyle} onClick={() => handleSort("projected_rbi")}>Proj RBI{sortLabel("projected_rbi")}</th>
            <th style={thStyle} onClick={() => handleSort("rbi_score")}>RBI Score{sortLabel("rbi_score")}</th>
            <th style={thStyle} onClick={() => handleSort("projected_sb")}>Proj SB{sortLabel("projected_sb")}</th>
            <th style={thStyle} onClick={() => handleSort("sb_score")}>SB Score{sortLabel("sb_score")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => (
            <tr key={i}>
              <td style={tdStyle}>{getValue(p, "player")}</td>
              <td style={tdStyle}>{getValue(p, "team")}</td>
              <td style={tdStyle}>{getValue(p, "opp")}</td>
              <td style={tdStyle}>{getValue(p, "projected_hits")}</td>
              <td style={tdStyle}>{getValue(p, "hit_score")}</td>
              <td style={tdStyle}>{getValue(p, "projected_runs")}</td>
              <td style={tdStyle}>{getValue(p, "run_score")}</td>
              <td style={tdStyle}>{getValue(p, "projected_hr")}</td>
              <td style={tdStyle}>{getValue(p, "hr_score")}</td>
              <td style={tdStyle}>{getValue(p, "projected_rbi")}</td>
              <td style={tdStyle}>{getValue(p, "rbi_score")}</td>
              <td style={tdStyle}>{getValue(p, "projected_sb")}</td>
              <td style={tdStyle}>{getValue(p, "sb_score")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
