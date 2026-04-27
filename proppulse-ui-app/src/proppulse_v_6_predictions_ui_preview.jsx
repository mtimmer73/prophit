export default function PropPulseV6Preview() {
  const topPlays = [
    { rank: 1, player: "Wilyer Abreu", team: "BOS", opp: "SD", score: 4.00, hits: 1.84, tb: 3.74, hr: 0.44, lineup: 5, hand: "RHP" },
    { rank: 2, player: "Alec Burleson", team: "STL", opp: "DET", score: 4.00, hits: 0.93, tb: 1.58, hr: 0.33, lineup: 9, hand: "RHP" },
    { rank: 3, player: "Gleyber Torres", team: "DET", opp: "STL", score: 4.00, hits: 1.04, tb: 1.49, hr: 0.74, lineup: 9, hand: "LHP" },
    { rank: 4, player: "Justin Crawford", team: "PHI", opp: "COL", score: 3.31, hits: 0.90, tb: 1.02, hr: 0.24, lineup: 9, hand: "RHP" },
    { rank: 5, player: "Jarren Duran", team: "BOS", opp: "SD", score: 4.54, hits: 0.88, tb: 1.09, hr: 0.53, lineup: 3, hand: "RHP" },
    { rank: 6, player: "Corey Seager", team: "TEX", opp: "CIN", score: 4.00, hits: 0.68, tb: 1.58, hr: 0.37, lineup: 9, hand: "RHP" },
  ];

  const games = [
    { matchup: "BOS vs SD", park: "BOS Home", weather: "Neutral", count: 6 },
    { matchup: "DET vs STL", park: "DET Home", weather: "Neutral", count: 7 },
    { matchup: "TEX vs CIN", park: "TEX Home", weather: "Slight boost", count: 5 },
    { matchup: "SEA vs LAA", park: "SEA Away", weather: "Neutral", count: 4 },
  ];

  const columns = [
    "Player",
    "Team",
    "Opp",
    "Lineup",
    "Proj Score",
    "Proj Hits",
    "Proj Total Bases",
    "Proj HR",
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="text-sm uppercase tracking-[0.25em] text-cyan-400">PropPulse</div>
            <h1 className="text-3xl md:text-5xl font-bold mt-2">MLB V6 Prediction Dashboard</h1>
            <p className="text-slate-400 mt-2 text-sm md:text-base">
              Preview of the current V6 model layout for daily hitter projections and top playable spots.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm min-w-[280px]">
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
              <div className="text-slate-400">Model Version</div>
              <div className="text-xl font-semibold mt-1">V6</div>
            </div>
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
              <div className="text-slate-400">Slate Status</div>
              <div className="text-xl font-semibold mt-1">Current</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Top Projection Board</h2>
                <p className="text-slate-400 text-sm mt-1">Sorted by projected score from the latest V6 output.</p>
              </div>
              <div className="rounded-full px-3 py-1 bg-cyan-500/10 text-cyan-300 text-xs font-medium border border-cyan-500/20">
                Daily View
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-950/70 text-slate-400">
                  <tr>
                    <th className="text-left px-6 py-4">#</th>
                    {columns.map((col) => (
                      <th key={col} className="text-left px-4 py-4 whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topPlays.map((row) => (
                    <tr key={row.rank} className="border-t border-slate-800 hover:bg-slate-800/30">
                      <td className="px-6 py-4 font-semibold text-cyan-300">{row.rank}</td>
                      <td className="px-4 py-4 font-medium whitespace-nowrap">{row.player}</td>
                      <td className="px-4 py-4">{row.team}</td>
                      <td className="px-4 py-4">{row.opp}</td>
                      <td className="px-4 py-4">{row.lineup}</td>
                      <td className="px-4 py-4">{row.score.toFixed(2)}</td>
                      <td className="px-4 py-4">{row.hits.toFixed(2)}</td>
                      <td className="px-4 py-4">{row.tb.toFixed(2)}</td>
                      <td className="px-4 py-4">{row.hr.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
              <h2 className="text-xl font-semibold">Top Card</h2>
              <div className="mt-4 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-500/10 border border-cyan-500/20 p-5">
                <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Best Current Projection</div>
                <div className="text-2xl font-bold mt-2">Wilyer Abreu</div>
                <div className="text-slate-300 mt-1">BOS vs SD</div>
                <div className="grid grid-cols-2 gap-3 mt-5 text-sm">
                  <div className="rounded-xl bg-slate-950/50 p-3 border border-slate-800">
                    <div className="text-slate-400">Projected Hits</div>
                    <div className="text-lg font-semibold mt-1">1.84</div>
                  </div>
                  <div className="rounded-xl bg-slate-950/50 p-3 border border-slate-800">
                    <div className="text-slate-400">Projected TB</div>
                    <div className="text-lg font-semibold mt-1">3.74</div>
                  </div>
                  <div className="rounded-xl bg-slate-950/50 p-3 border border-slate-800">
                    <div className="text-slate-400">Projected HR</div>
                    <div className="text-lg font-semibold mt-1">0.44</div>
                  </div>
                  <div className="rounded-xl bg-slate-950/50 p-3 border border-slate-800">
                    <div className="text-slate-400">Lineup Spot</div>
                    <div className="text-lg font-semibold mt-1">5</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
              <h2 className="text-xl font-semibold">Game Buckets</h2>
              <div className="mt-4 space-y-3">
                {games.map((game) => (
                  <div key={game.matchup} className="rounded-2xl border border-slate-800 p-4 bg-slate-950/40">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold">{game.matchup}</div>
                        <div className="text-sm text-slate-400 mt-1">{game.park}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-slate-400">Playable bats</div>
                        <div className="text-lg font-semibold">{game.count}</div>
                      </div>
                    </div>
                    <div className="mt-3 text-xs inline-flex rounded-full px-2 py-1 border border-slate-700 text-slate-300">
                      {game.weather}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
