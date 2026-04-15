"use client";

import { useState } from "react";

interface StarRatingProps {
  movieId:   number;
  value:     number | null;   // current rating or null
  onChange:  (movieId: number, rating: number) => void;
  onSkip?:   (movieId: number) => void;
  size?:     "sm" | "md";
}

const RATINGS = [1, 2, 3, 4, 5] as const;

export default function StarRating({
  movieId, value, onChange, onSkip, size = "md",
}: StarRatingProps) {
  const [hover, setHover] = useState<number | null>(null);

  const active  = hover ?? value ?? 0;
  const starSize = size === "sm" ? "text-lg" : "text-2xl";

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="flex gap-0.5"
        onMouseLeave={() => setHover(null)}
      >
        {RATINGS.map(r => (
          <button
            key={r}
            className={`star-btn ${starSize} leading-none ${
              r <= active ? "text-amber-400" : "text-slate-700"
            }`}
            onMouseEnter={() => setHover(r)}
            onClick={() => onChange(movieId, r)}
            aria-label={`Rate ${r} star${r !== 1 ? "s" : ""}`}
          >
            ★
          </button>
        ))}
      </div>
      {onSkip && (
        <button
          onClick={() => onSkip(movieId)}
          className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
        >
          {value ? "rated" : "skip"}
        </button>
      )}
    </div>
  );
}
