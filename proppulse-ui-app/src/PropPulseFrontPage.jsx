import React from "react";

/**
 * PropPulse Front Page UI
 *
 * Features:
 * - Hero header
 * - Quick navigation cards
 * - Top 5 plays summary section
 * - Model overview section
 * - Clean sportsbook-style dashboard landing page
 *
 * Save as:
 *   src/App.jsx
 * or
 *   src/FrontPage.jsx
 */

const navCards = [
  {
    title: "V7 Model",
    subtitle: "Traditional split-driven projections",
    description: "View today’s top hits, total bases, RBI, runs, HR, and SB plays from the V7 model.",
    button: "Open V7 Dashboard",
  },
  {
    title: "Justin Model",
    subtitle: "Advanced metrics + handedness model",
    description: "Use the Justin Model to surface high-quality contact plays using AVG, OBP, SLG, OPS, xBA, EV, and barrel data.",
    button: "Open Justin Dashboard",
  },
  {
    title: "Top 5 Plays",
    subtitle: "Best plays by category",
    description: "See the top 5 plays for each stat category across both models in one place.",
    button: "Open Top 5 Board",
  },
  {
    title: "Consensus Board",
    subtitle: "Where both models agree",
    description: "Find the strongest overlap spots where V7 and Justin point to the same hitters and props.",
    button: "Open Consensus Board",
  },
];

const summaryCards = [
  { label: "Top Hits", value: "5 Best Plays", note: "Best hit spots from both models" },
  { label: "Top Total Bases", value: "5 Best Plays", note: "Power + slugging opportunities" },
  { label: "Top RBI", value: "5 Best Plays", note: "Run-production targets" },
  { label: "Top Runs", value: "5 Best Plays", note: "Best on-base + scoring spots" },
];

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <div className="text-2xl font-bold tracking-tight">PropPulse</div>
            <div className="text-sm text-slate-400">Baseball prediction and prop dashboard</div>
          </div>
          <div className="hidden gap-3 md:flex">
            <button className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-900">
              Models
            </button>
            <button className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-900">
              Top Plays
            </button>
            <button className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-900">
              Results
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <section className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="rounded-3xl border border-slate-800 bg-gradient-to-br from-blue-950 via-slate-900 to-slate-950 p-8 shadow-2xl">
            <div className="mb-4 inline-flex rounded-full border border-blue-800 bg-blue-950/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-200">
              Live dashboard front page
            </div>
            <h1 className="max-w-3xl text-4xl font-bold leading-tight md:text-5xl">
              Your command center for daily MLB prop projections
            </h1>
            <p className="mt-4 max-w-2xl text-base text-slate-300 md:text-lg">
              Track V7 and Justin Model outputs, compare top plays, identify consensus spots,
              and navigate directly into your betting dashboards from one clean front page.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <button className="rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white shadow-lg hover:bg-blue-500">
                Open Today’s Top Plays
              </button>
              <button className="rounded-2xl border border-slate-700 px-5 py-3 font-semibold text-slate-100 hover:bg-slate-900">
                View Model Dashboards
              </button>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="text-sm text-slate-400">Models</div>
                <div className="mt-2 text-3xl font-bold">2</div>
                <div className="mt-1 text-sm text-slate-500">V7 + Justin</div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="text-sm text-slate-400">Categories</div>
                <div className="mt-2 text-3xl font-bold">6</div>
                <div className="mt-1 text-sm text-slate-500">Hits, TB, RBI, Runs, HR, SB</div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="text-sm text-slate-400">Daily Goal</div>
                <div className="mt-2 text-3xl font-bold">Top 5</div>
                <div className="mt-1 text-sm text-slate-500">Best plays by category</div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold">Today’s Focus</h2>
              <div className="rounded-full border border-emerald-700 bg-emerald-950 px-3 py-1 text-xs font-semibold text-emerald-300">
                Ready
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <div className="text-sm text-slate-400">Top Hits Board</div>
                <div className="mt-2 text-lg font-semibold">Find the safest base-hit spots</div>
                <div className="mt-1 text-sm text-slate-500">Use V7 and Justin side by side</div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <div className="text-sm text-slate-400">Consensus Tracker</div>
                <div className="mt-2 text-lg font-semibold">Model agreement matters</div>
                <div className="mt-1 text-sm text-slate-500">Spot overlapping picks faster</div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <div className="text-sm text-slate-400">Results Review</div>
                <div className="mt-2 text-lg font-semibold">Grade and improve daily</div>
                <div className="mt-1 text-sm text-slate-500">Track what wins and refine weights</div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold">Quick Navigation</h2>
              <p className="mt-1 text-sm text-slate-400">
                Jump into each part of the site from the homepage
              </p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {navCards.map((card) => (
              <div
                key={card.title}
                className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-lg transition hover:-translate-y-1 hover:border-blue-700"
              >
                <div className="text-xs font-semibold uppercase tracking-wide text-blue-300">
                  {card.subtitle}
                </div>
                <h3 className="mt-3 text-2xl font-bold">{card.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">{card.description}</p>
                <button className="mt-6 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500">
                  {card.button}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
            <div className="mb-5">
              <h2 className="text-2xl font-bold">Top Play Categories</h2>
              <p className="mt-1 text-sm text-slate-400">
                A front-page summary of the best daily play buckets
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {summaryCards.map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                  <div className="text-sm text-slate-400">{item.label}</div>
                  <div className="mt-2 text-2xl font-bold">{item.value}</div>
                  <div className="mt-1 text-sm text-slate-500">{item.note}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
            <div className="mb-5">
              <h2 className="text-2xl font-bold">Model Overview</h2>
              <p className="mt-1 text-sm text-slate-400">
                Two different lenses for finding edges
              </p>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                <div className="text-sm font-semibold uppercase tracking-wide text-blue-300">
                  V7 Model
                </div>
                <div className="mt-2 text-lg font-bold">Traditional matchup + split engine</div>
                <div className="mt-2 text-sm leading-6 text-slate-400">
                  Best for daily split-driven projections, reliable hit spots, and quick reads
                  on matchup quality.
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                <div className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
                  Justin Model
                </div>
                <div className="mt-2 text-lg font-bold">Advanced quality-of-contact engine</div>
                <div className="mt-2 text-sm leading-6 text-slate-400">
                  Uses handedness-aware production plus contact quality like xBA, EV,
                  barrel rate, and hard-hit percentage.
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
