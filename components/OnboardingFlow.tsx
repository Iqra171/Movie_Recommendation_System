"use client";

import { useState, useEffect } from "react";
import { ALL_GENRES } from "@/lib/types";
import { genreColor, genreColorLight } from "@/lib/utils";
import { loadPrefs, savePrefs } from "@/lib/prefs";

interface OnboardingFlowProps {
  onComplete: (genres: string[]) => void;
}

const GENRE_ICONS: Record<string, string> = {
  Action: "💥", Adventure: "🗺️", Animation: "🎨", Children: "🧸",
  Comedy: "😄", Crime: "🔍", Documentary: "📽️", Drama: "🎭",
  Fantasy: "🧙", "Film-Noir": "🕵️", Horror: "👻", IMAX: "🎬",
  Musical: "🎵", Mystery: "🔮", Romance: "❤️", "Sci-Fi": "🚀",
  Thriller: "⚡", War: "🎖️", Western: "🤠",
};

export default function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [returning, setReturning] = useState(false);

  useEffect(() => {
    const prefs = loadPrefs();
    if (prefs?.genres?.length) {
      setSelected(prefs.genres);
      setReturning(true);
    }
  }, []);

  function toggle(g: string) {
    setSelected(prev =>
      prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]
    );
  }

  function handleContinue() {
    savePrefs({
  genres: selected,
  ratedMovies: [],
  notInterested: [],
  boostedMovies: [],
  savedAt: Date.now()
});
    onComplete(selected);
  }

  return (
    <div className="mx-auto max-w-2xl animate-fade-in">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-900/40 border border-teal-700/30 text-3xl">
          🎞️
        </div>
        <h2 className="font-display text-3xl text-slate-100">
          {returning ? "Welcome back" : "What do you like to watch?"}
        </h2>
        <p className="mt-2 text-slate-500 max-w-md mx-auto text-sm">
          {returning
            ? "Your preferences are saved. Update them or jump straight in."
            : "Pick any genres that interest you and we'll find movies you'll love."}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {ALL_GENRES.map(g => {
          const isSelected = selected.includes(g);
          return (
            <button
              key={g}
              onClick={() => toggle(g)}
              className={`genre-chip flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm text-left transition-all ${
                isSelected ? "selected" : "border-white/10 text-slate-400"
              }`}
              style={isSelected ? {
                borderColor: genreColor(g) + "99",
                background:  genreColorLight(g),
                color:       genreColor(g),
              } : {}}
            >
              <span className="text-base">{GENRE_ICONS[g] ?? "🎬"}</span>
              <span>{g}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex gap-3 text-xs text-slate-500">
        <button onClick={() => setSelected([...ALL_GENRES])} className="hover:text-slate-300 transition-colors">Select all</button>
        <span>·</span>
        <button onClick={() => setSelected([])} className="hover:text-slate-300 transition-colors">Clear</button>
        <span className="ml-auto">{selected.length} selected</span>
      </div>

      <div className="mt-8 flex justify-end">
        <button
          onClick={handleContinue}
          disabled={selected.length === 0}
          className="rounded-xl bg-teal-600 px-8 py-3 text-sm font-medium text-white transition-all hover:bg-teal-500 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {returning ? "Update preferences →" : "Show me movies →"}
        </button>
      </div>
    </div>
  );
}