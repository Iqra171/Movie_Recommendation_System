"use client";

import { useState, useEffect } from "react";
import { loadPrefs, savePrefs } from "@/lib/prefs";
import OnboardingFlow from "@/components/OnboardingFlow";
import RecommendationsView from "@/components/RecommendationsView";

export default function HomePage() {
  const [genres, setGenres]   = useState<string[] | null>(null);
  const [ready, setReady]     = useState(false);

  // On mount: check localStorage for returning user — skip onboarding
  useEffect(() => {
    const prefs = loadPrefs();
    if (prefs?.genres?.length) {
      setGenres(prefs.genres);
    }
    setReady(true);
  }, []);

  function handleOnboardingComplete(selectedGenres: string[]) {
    savePrefs({
  genres: selectedGenres,
  ratedMovies: [],
  notInterested: [],
  boostedMovies: [],
  savedAt: Date.now()
});
    setGenres(selectedGenres);
  }

  function handleReset() {
    setGenres(null);
  }

  if (!ready) return null; // avoid hydration flash

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/5 backdrop-blur-md"
        style={{ background: "rgba(10,22,40,0.85)" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="text-xl">🎬</span>
            <div>
              <h1 className="font-display text-base font-medium text-slate-100 sm:text-lg">
                Interactive Explainable Recommender
              </h1>
              <p className="hidden text-xs text-slate-500 sm:block">
                MovieLens · SVD Collaborative Filtering 
              </p>
            </div>
          </div>
          {genres && (
            <button
              onClick={handleReset}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:border-white/20 hover:text-slate-300 transition-all"
            >
              ✏️ Edit preferences
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {!genres ? (
          <OnboardingFlow onComplete={handleOnboardingComplete} />
        ) : (
          <RecommendationsView
            genres={genres}
            onReset={handleReset}
          />
        )}
      </main>

      <footer className="mt-16 border-t border-white/5 py-6 text-center text-xs text-slate-600">
        <p>
          MovieLens data courtesy of{" "}
          <a href="https://grouplens.org" className="hover:text-slate-400 transition-colors"
            target="_blank" rel="noreferrer">
            GroupLens Research, University of Minnesota
          </a>. Harper &amp; Konstan (2015), ACM TiiS.
        </p>
        <p className="mt-1">HESTIA Lab · Human-in-the-Loop &amp; Explainable AI · MS CS Research Prototype</p>
      </footer>
    </div>
  );
}