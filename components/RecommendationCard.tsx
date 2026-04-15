"use client";

import { useState } from "react";
import Image from "next/image";
import type { Recommendation } from "@/lib/types";
import { genreColor, genreColorLight } from "@/lib/utils";
import ExplanationPanel from "./ExplanationPanel";

interface RecommendationCardProps {
  rec:              Recommendation;
  index:            number;
  onNotInterested:  (movieId: number) => void;
  onMoreLikeThis:   (movieId: number) => void;
}

export default function RecommendationCard({
  rec,
  index,
  onNotInterested,
  onMoreLikeThis,
}: RecommendationCardProps) {
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [dismissed, setDismissed]             = useState(false);
  const [boosted, setBoosted]                  = useState(false);

  const { movie, predicted_rating, explanation, neighbor_stats } = rec;

  if (dismissed) return null;

  const ratingColor =
    predicted_rating >= 4.5 ? "#2dd4bf" :
    predicted_rating >= 3.5 ? "#22c55e" :
    predicted_rating >= 2.5 ? "#eab308" : "#f97316";

  return (
    <div
      className="rec-card animate-slide-up glass-bright rounded-2xl overflow-hidden flex flex-col"
      style={{ opacity: 0, animationFillMode: "forwards" }}
    >
      {/* Poster */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-slate-800">
        {movie.poster_url ? (
          <Image
            src={movie.poster_url}
            alt={movie.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900">
            <span className="text-4xl opacity-30">🎬</span>
          </div>
        )}

        {/* Rank badge */}
        <div className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-xs font-bold text-white backdrop-blur-sm">
          {index + 1}
        </div>

        {/* Predicted rating badge */}
        <div
          className="absolute right-2 top-2 rounded-lg px-2 py-0.5 text-sm font-bold backdrop-blur-sm"
          style={{ background: ratingColor + "33", color: ratingColor, border: `1px solid ${ratingColor}55` }}
        >
          {predicted_rating.toFixed(1)} ★
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-3">
        <h3 className="font-display text-base font-medium leading-tight text-slate-100 line-clamp-2">
          {movie.title}
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          {movie.year ?? "Unknown year"}
        </p>

        {/* Genre chips */}
        <div className="mt-2 flex flex-wrap gap-1">
          {movie.genres.slice(0, 3).map(g => (
            <span
              key={g}
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ color: genreColor(g), background: genreColorLight(g) }}
            >
              {g}
            </span>
          ))}
          {movie.genres.length > 3 && (
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-500">
              +{movie.genres.length - 3}
            </span>
          )}
        </div>

        {/* Explanation panel */}
        <ExplanationPanel
          explanation={explanation}
          neighborStats={neighbor_stats}
          expanded={explanationOpen}
          onToggle={() => setExplanationOpen(v => !v)}
        />

        {/* Feedback buttons */}
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => {
              setDismissed(true);
              onNotInterested(movie.movieId);
            }}
            className="flex-1 rounded-lg border border-white/8 bg-white/3 py-1.5 text-xs text-slate-400 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 transition-all"
          >
            Not interested
          </button>
          <button
            onClick={() => {
              setBoosted(true);
              onMoreLikeThis(movie.movieId);
            }}
            className={`flex-1 rounded-lg border py-1.5 text-xs transition-all ${
              boosted
                ? "border-teal-500/50 bg-teal-500/15 text-teal-300"
                : "border-white/8 bg-white/3 text-slate-400 hover:border-teal-500/30 hover:bg-teal-500/10 hover:text-teal-400"
            }`}
          >
            {boosted ? "✓ More like this" : "More like this"}
          </button>
        </div>
      </div>
    </div>
  );
}
