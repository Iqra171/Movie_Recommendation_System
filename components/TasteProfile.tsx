"use client";

import type { TasteProfile } from "@/lib/types";
import { WARM_THRESHOLD } from "@/lib/types";
import { genreColor, formatBias } from "@/lib/utils";

interface TasteProfileProps {
  profile:    TasteProfile;
  mode:       "cold" | "warm";
}

export default function TasteProfilePanel({ profile, mode }: TasteProfileProps) {
  const isEmpty = profile.totalRatings === 0;

  return (
    <div className="glass-bright rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base font-medium text-slate-200">
          Your taste profile
        </h2>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            mode === "warm"
              ? "bg-blue-900/40 text-blue-400 border border-blue-700/40"
              : "bg-teal-900/40 text-teal-400 border border-teal-700/40"
          }`}
        >
          {mode === "warm" ? "CF active" : "Cold start"}
        </span>
      </div>

      {isEmpty ? (
        <p className="text-xs text-slate-500">
          Rate some movies to build your taste profile.
        </p>
      ) : (
        <>
          {/* Top genres */}
          {profile.topGenres.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-slate-400">Top genres</p>
              <div className="space-y-2">
                {profile.topGenres.map(({ genre, pct }) => (
                  <div key={genre}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span style={{ color: genreColor(genre) }}>{genre}</span>
                      <span className="text-slate-500">{pct}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: genreColor(genre) }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2">
            <StatCard
              label="Avg rating"
              value={`${profile.avgRating.toFixed(1)} ★`}
              sub={formatBias(profile.ratingBias)}
            />
            <StatCard
              label="Rated movies"
              value={String(profile.totalRatings)}
              sub={`${WARM_THRESHOLD - profile.totalRatings > 0
                ? `${WARM_THRESHOLD - profile.totalRatings} more to unlock CF`
                : "CF unlocked ✓"}`}
            />
          </div>

          {/* Mode transition notice */}
          {profile.modeTransitioned && (
            <div className="rounded-lg border border-blue-700/30 bg-blue-900/20 px-3 py-2 text-xs text-blue-300">
              <span className="font-medium">🔗 Collaborative filtering active</span>
              <p className="mt-0.5 text-blue-400/70">
                Now using your {profile.totalRatings} real ratings to find similar users.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/3 p-3">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-slate-100">{value}</p>
      <p className="text-[9px] text-slate-500 leading-tight">{sub}</p>
    </div>
  );
}
