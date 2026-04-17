"use client";

import { useState } from "react";

export default function AboutSection() {
  const [open, setOpen] = useState(false);

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">📖</span>
          <span className="font-medium text-slate-200">About this research prototype</span>
        </div>
        <span className="text-slate-500">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-white/5 px-5 pb-5 pt-4 text-sm text-slate-400 space-y-4">
          <p className="leading-relaxed">
            This is an interactive, explainable recommender system built on the{" "}
            <a
              href="https://grouplens.org/datasets/movielens/"
              target="_blank"
              rel="noreferrer"
              className="text-teal-400 hover:underline"
            >
              MovieLens dataset
            </a>{" "}
            (Harper &amp; Konstan, 2015) as a research prototype for the
            human-in-the-loop and explainable AI. It demonstrates two core concepts:
            cold start handling and honest explainability switching.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <InfoCard
            icon="❄️"
            title="Cold start strategy"
            body="When a new user has not yet interacted with any movies, the system builds a synthetic profile by seeding genre preferences derived from real MovieLens data. SVD-based predictions pre-computed offline with scikit-surprise (Funk, 2006) are served as static JSON — no Python runtime on Vercel. This approach is grounded in the cold-start gap identified in Kim et al. (2024, A-LLMRec)."
          />
          <InfoCard
            icon="🔗" 
            title="Collaborative filtering"
            body="Once you interact with 5 movies using 'More like this', the system switches to content-based collaborative scoring — weighting recommendations by genre overlap with movies you have responded to. Predictions are computed client-side in real time, no server call required."
          />
            <InfoCard
              icon="🔍"
              title="Honest explainability"
              body="Explanations are mode-aware: in cold start mode, the system explains which genre chips and mood tags drove the recommendation. In CF mode, it reports approximate neighbor count and average neighbor rating. The system never shows a CF-style explanation during cold start — explainability honesty is a first-class design requirement, not UI decoration."
            />
            <InfoCard
              icon="👤"
              title="Human-in-the-loop"
              body="Users can signal 'Not interested' (removes a movie) or 'More like this' (boosts genre-similar movies). Both actions re-rank results client-side without a page reload and update the live taste profile panel in real time. Implicit feedback is logged for future model fine-tuning."
            />
          </div>

          <div className="rounded-xl border border-white/5 bg-white/3 px-4 py-3 text-xs space-y-1">
            <p className="font-medium text-slate-300">📚 Citations</p>
            <p>
              Harper, F. M., &amp; Konstan, J. A. (2015). The MovieLens datasets: History and context.{" "}
              <em>ACM Transactions on Interactive Intelligent Systems (TiiS)</em>, 5(4), 1–19.
            </p>
            <p className="mt-1">
              Kim, J., et al. (2024). A-LLMRec: Large language models meet collaborative filtering.{" "}
              <em>arXiv:2404.11343</em>.
            </p>
            <p className="mt-1 text-slate-500">
              Development dataset: ml-latest-small (100K ratings, 9K movies).
              Production dataset: ml-32m (32M ratings, 200K users, 87K movies).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/3 p-4">
      <p className="flex items-center gap-1.5 font-medium text-slate-200">
        <span>{icon}</span> {title}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{body}</p>
    </div>
  );
}
