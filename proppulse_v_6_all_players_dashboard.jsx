export default function PropPulseV6AllPlayersDashboard() {
  const fallbackPlayers = [
    {
      player: "Juan Soto",
      team: "NYM",
      projHits: 1.42,
      hitScore: 87,
      projRuns: 1.01,
      runScore: 81,
      projHR: 0.34,
      hrScore: 74,
      projRBI: 0.98,
      rbiScore: 79,
      projSB: 0.16,
      sbScore: 58,
    },
    {
      player: "Francisco Lindor",
      team: "NYM",
      projHits: 1.31,
      hitScore: 82,
      projRuns: 0.92,
      runScore: 77,
      projHR: 0.21,
      hrScore: 61,
      projRBI: 0.73,
      rbiScore: 68,
      projSB: 0.24,
      sbScore: 70,
    },
    {
      player: "Mookie Betts",
      team: "LAD",
      projHits: 1.28,
      hitScore: 80,
      projRuns: 0.96,
      runScore: 79,
      projHR: 0.26,
      hrScore: 66,
      projRBI: 0.78,
      rbiScore: 71,
      projSB: 0.11,
      sbScore: 52,
    },
  ];

  const [players, setPlayers] = React.useState(fallbackPlayers);
  const [status, setStatus] = React.useState("Loading real slate JSON...");
  const [lastUpdated, setLastUpdated] = React.useState("");
  const [sortKey, setSortKey] = React.useState("hitScore");
  const [sortDir, setSortDir] = React.useState("desc");
  const [teamFilter, setTeamFilter] = React.useState("ALL");
  const [search, setSearch] = React.useState("");

  const toNumber = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const firstExisting = (obj, keys, fallback = null) => {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
        return obj[key];
      }
    }
    return fallback;
  };

  const normalizeRow = (row) => ({
    player: firstExisting(row, ["player", "Player", "name", "batter", "player_name"], "Unknown Player"),
    team: firstExisting(row, ["team", "Team", "Tm"], "—"),
    projHits: toNumber(firstExisting(row, ["projHits", "projected_hits", "proj_hits", "hits_proj", "Projected Hits"])),
    hitScore: toNumber(firstExisting(row, ["hitScore", "hit_score", "Hit Score"])),
    projRuns: toNumber(firstExisting(row, ["projRuns", "projected_runs", "proj_runs", "runs_proj", "Projected Runs"])),
    runScore: toNumber(firstExisting(row, ["runScore", "run_score", "Run Score"])),
    projHR: toNumber(firstExisting(row, ["projHR", "projected_home_runs", "projected_hr", "proj_hr", "hr_proj", "Projected HR"])),
    hrScore: toNumber(firstExisting(row, ["hrScore", "hr_score", "HR Score"])),
    projRBI: toNumber(firstExisting(row, ["projRBI", "projected_rbi", "proj_rbi", "rbi_proj", "Projected RBI"])),
    rbiScore: toNumber(firstExisting(row, ["rbiScore", "rbi_score", "RBI Score"])),
    projSB: toNumber(firstExisting(row, ["projSB", "projected_sb", "proj_sb", "sb_proj", "Projected SB"])),
    sbScore: toNumber(firstExisting(row, ["sbScore", "sb_score", "SB Score"])),
  });

  React.useEffect(() => {
    let active = true;

    async function loadSlate() {
      try {
        const response = await fetch("/proppulse_v6_all_players.json", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const raw = await response.json();
        const rows = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.players)
            ? raw.players
            : Array.isArray(raw?.data)
              ? raw.data
              : [];

        if (!rows.length) {
          throw new Error("JSON loaded, but no player rows were found.");
        }

        const normalized = rows.map(normalizeRow);

        if (active) {
          setPlayers(normalized);
          setStatus(`Loaded real slate: ${normalized.length} players`);
          setLastUpdated(new Date().toLocaleString());
        }
      } catch (error) {
        if (active) {
          setPlayers(fallbackPlayers);
          setStatus(`Using sample data — ${error.message}`);
          setLastUpdated("");
        }
      }
    }

    loadSlate();
    return () => {
      active = false;
    };
  }, []);

  const num = (v, digits = 2) => {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(digits) : "—";
  };

  const scoreTone = (score) => {
    const n = Number(score);
    if (!Number.isFinite(n)) return "bg-slate-700/70 text-slate-200 border-slate-600";
    if (n >= 85) return "bg-emerald-500/15 text-emerald-300 border-emerald-400/40";
    if (n >= 75) return "bg-lime-500/15 text-lime-300 border-lime-400/40";
    if (n >= 65) return "bg-amber-500/15 text-amber-300 border-amber-400/40";
    return "bg-rose-500/15 text-rose-300 border-rose-400/40";
  };

  const allTeams = ["ALL", ...Array.from(new Set(players.map((p) => p.team).filter(Boolean))).sort()];

  const filteredPlayers = players.filter((row) => {
    const teamOk = teamFilter === "ALL" || row.team === teamFilter;
    const searchOk = !search || row.player.toLowerCase().includes(search.toLowerCase());
    return teamOk && searchOk;
  });

  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];

    if (typeof av === "string" || typeof bv === "string") {
      const aText = String(av ?? "");
      const bText = String(bv ?? "");
      return sortDir === "asc" ? aText.localeCompare(bText) : bText.localeCompare(aText);
    }

    const aNum = Number.isFinite(Number(av)) ? Number(av) : -999999;
    const bNum = Number.isFinite(Number(bv)) ? Number(bv) : -999999;
    return sortDir === "asc" ? aNum - bNum : bNum - aNum;
  });

  const topBy = (key) => [...players].sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0))[0];

  const maxHitScore = topBy("hitScore");
  const maxRunScore = topBy("runScore");
  const maxHrScore = topBy("hrScore");
  const maxSbScore = topBy("sbScore");

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortLabel = (key) => (sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : "");

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
              PropPulse • V6 MLB Dashboard
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">All Players Projection Board</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300 sm:text-base">
              Live-slate board using your V6 JSON with player, team, projected hits, hit score, projected runs, run score,
              projected home runs, HR score, projected RBI, RBI score, projected stolen bases, and SB score.
            </p>
            <div className="mt-3 text-sm text-slate-400">{status}{lastUpdated ? ` • ${lastUpdated}` : ""}</div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-lg shadow-black/20">
              <div className="text-xs uppercase tracking-wide text-slate-400">Top Hit Score</div>
              <div className="mt-2 text-sm font-semibold">{maxHitScore?.player || "—"}</div>
              <div className="text-2xl font-bold text-emerald-300">{maxHitScore?.hitScore ?? "—"}</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-lg shadow-black/20">
              <div className="text-xs uppercase tracking-wide text-slate-400">Top Run Score</div>
              <div className="mt-2 text-sm font-semibold">{maxRunScore?.player || "—"}</div>
              <div className="text-2xl font-bold text-sky-300">{maxRunScore?.runScore ?? "—"}</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-lg shadow-black/20">
              <div className="text-xs uppercase tracking-wide text-slate-400">Top HR Score</div>
              <div className="mt-2 text-sm font-semibold">{maxHrScore?.player || "—"}</div>
              <div className="text-2xl font-bold text-violet-300">{maxHrScore?.hrScore ?? "—"}</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-lg shadow-black/20">
              <div className="text-xs uppercase tracking-wide text-slate-400">Top SB Score</div>
              <div className="mt-2 text-sm font-semibold">{maxSbScore?.player || "—"}</div>
              <div className="text-2xl font-bold text-amber-300">{maxSbScore?.sbScore ?? "—"}</div>
            </div>
          </div>
        </div>

        <div className="mb-5 grid gap-3 rounded-3xl border border-slate-800 bg-slate-900 p-4 md:grid-cols-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search player..."
            className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none ring-0 placeholder:text-slate-500"
          />

          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none"
          >
            {allTeams.map((team) => (
              <option key={team} value={team}>{team}</option>
            ))}
          </select>

          <div className="flex items-center rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-300">
            Showing <span className="mx-1 font-semibold text-white">{sortedPlayers.length}</span> of <span className="mx-1 font-semibold text-white">{players.length}</span> players
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/20">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/95">
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="cursor-pointer px-4 py-4" onClick={() => toggleSort("player")}>Player{sortLabel("player")}</th>
                  <th className="cursor-pointer px-4 py-4" onClick={() => toggleSort("team")}>Team{sortLabel("team")}</th>
                  <th className="cursor-pointer px-4 py-4" onClick={() => toggleSort("projHits")}>Proj Hits{sortLabel("projHits")}</th>
                  <th className="cursor-pointer px-4 py-4" onClick={() => toggleSort("hitScore")}>Hit Score{sortLabel("hitScore")}</th>
                  <th className="cursor-pointer px-4 py-4" onClick={() => toggleSort("projRuns")}>Proj Runs{sortLabel("projRuns")}</th>
                  <th className="cursor-pointer px-4 py-4" onClick={() => toggleSort("runScore")}>Run Score{sortLabel("runScore")}</th>
                  <th className="cursor-pointer px-4 py-4" onClick={() => toggleSort("projHR")}>Proj HR{sortLabel("projHR")}</th>
                  <th className="cursor-pointer px-4 py-4" onClick={() => toggleSort("hrScore")}>HR Score{sortLabel("hrScore")}</th>
                  <th className="cursor-pointer px-4 py-4" onClick={() => toggleSort("projRBI")}>Proj RBI{sortLabel("projRBI")}</th>
                  <th className="cursor-pointer px-4 py-4" onClick={() => toggleSort("rbiScore")}>RBI Score{sortLabel("rbiScore")}</th>
                  <th className="cursor-pointer px-4 py-4" onClick={() => toggleSort("projSB")}>Proj SB{sortLabel("projSB")}</th>
                  <th className="cursor-pointer px-4 py-4" onClick={() => toggleSort("sbScore")}>SB Score{sortLabel("sbScore")}</th>
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map((row, idx) => (
                  <tr
                    key={`${row.player}-${row.team}-${idx}`}
                    className="border-b border-slate-800/80 transition hover:bg-slate-800/45"
                  >
                    <td className="px-4 py-4">
                      <div className="font-semibold text-white">{row.player}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-200">
                        {row.team}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-medium text-slate-100">{num(row.projHits)}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex min-w-[60px] justify-center rounded-full border px-2.5 py-1 text-xs font-semibold ${scoreTone(row.hitScore)}`}>
                        {row.hitScore ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-medium text-slate-100">{num(row.projRuns)}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex min-w-[60px] justify-center rounded-full border px-2.5 py-1 text-xs font-semibold ${scoreTone(row.runScore)}`}>
                        {row.runScore ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-medium text-slate-100">{num(row.projHR)}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex min-w-[60px] justify-center rounded-full border px-2.5 py-1 text-xs font-semibold ${scoreTone(row.hrScore)}`}>
                        {row.hrScore ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-medium text-slate-100">{num(row.projRBI)}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex min-w-[60px] justify-center rounded-full border px-2.5 py-1 text-xs font-semibold ${scoreTone(row.rbiScore)}`}>
                        {row.rbiScore ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-medium text-slate-100">{num(row.projSB)}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex min-w-[60px] justify-center rounded-full border px-2.5 py-1 text-xs font-semibold ${scoreTone(row.sbScore)}`}>
                        {row.sbScore ?? "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-300">
          <div className="font-semibold text-white">JSON hookup</div>
          <p className="mt-2">
            Put a file named <span className="font-mono text-slate-200">proppulse_v6_all_players.json</span> inside your app’s <span className="font-mono text-slate-200">public</span> folder.
            This page now auto-loads it on refresh.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-300">
{`[
  {
    "player": "Juan Soto",
    "team": "NYM",
    "projected_hits": 1.42,
    "hit_score": 87,
    "projected_runs": 1.01,
    "run_score": 81,
    "projected_hr": 0.34,
    "hr_score": 74,
    "projected_rbi": 0.98,
    "rbi_score": 79,
    "projected_sb": 0.16,
    "sb_score": 58
  }
]`}
          </pre>
        </div>
      </div>
    </div>
  );
}
