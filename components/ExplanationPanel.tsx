"use client";

import type { Explanation, NeighborStats } from "@/lib/types";
import { MOOD_CONFIG } from "@/lib/types";
import { genreColor } from "@/lib/utils";

interface ExplanationPanelProps {
  explanation:    Explanation;
  neighborStats:  NeighborStats | null;
  expanded:       boolean;
  onToggle:       () => void;
}

export default function ExplanationPanel({
  explanation,
  neighborStats,
  expanded,
  onToggle,
}: ExplanationPanelProps) {
  const isCold = explanation.mode === "cold";

  return (
    <div className="mt-3 rounded-lg border border-white/5 bg-white/3">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <span>{isCold ? "🧊" : "🔗"}</span>
          <span className="font-medium">
            {isCold ? "Why we recommended this" : "Why we recommended this"}

          </span>
        </span>
        <span className="text-slate-500">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="border-t border-white/5 px-3 pb-3 pt-2 text-xs text-slate-400 space-y-2.5">
          {/* Explanation text */}
          <p className="leading-relaxed text-slate-300">
            {isCold ? (
              <ColdExplanation explanation={explanation} />
            ) : (
              <WarmExplanation explanation={explanation} />
            )}
          </p>

          {/* Mode badge */}
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                isCold
                  ? "bg-teal-900/40 text-teal-400 border border-teal-700/40"
                  : "bg-blue-900/40 text-blue-400 border border-blue-700/40"
              }`}
            >
             {isCold ? "Based on your preferences" : "Based on similar users"}

            </span>
          </div>

          {/* Neighbor bar */}
          {neighborStats && neighborStats.buckets.length === 5 && (
            <NeighborBar stats={neighborStats} />
          )}
        </div>
      )}
    </div>
  );
}

// FIND AND REPLACE the entire ColdExplanation function
function ColdExplanation({ explanation }: { explanation: Explanation }) {
  return (
    <>
      Recommended because you selected{" "}
      {explanation.genres?.map((g, i) => (
        <span key={g}>
          {i > 0 && ", "}
          <span className="font-medium" style={{ color: genreColor(g) }}>
            {g}
          </span>
        </span>
      ))}
      {" "}and matches your taste profile.{" "}
      
    </>
  );
}

function WarmExplanation({ explanation }: { explanation: Explanation }) {
  return (
    <>
      <span className="font-medium text-blue-300">
        ~{explanation.similar_users} users
      </span>{" "}
      with similar taste rated this movie (avg{" "}
      <span className="font-medium text-slate-200">
        {explanation.avg_neighbor_rating?.toFixed(1)} ★
      </span>
      ).
      {explanation.neighbor_liked && explanation.neighbor_liked.length > 0 && (
        <>
          {" "}They also liked{" "}
          {explanation.neighbor_liked.map((title, i) => (
            <span key={title}>
              {i > 0 && " and "}
              <span className="font-medium text-slate-200 italic">{title}</span>
            </span>
          ))}
          .
        </>
      )}
    </>
  );
}

const BUCKET_COLORS = [
  "#ef4444", // 1★  red
  "#f97316", // 2★  orange
  "#eab308", // 3★  yellow
  "#22c55e", // 4★  green
  "#2dd4bf", // 5★  teal
];

function NeighborBar({ stats }: { stats: NeighborStats }) {
  const total  = stats.buckets.reduce((s, v) => s + v, 0);
  if (!total) return null;

  return (
    <div>
      <p className="mb-1.5 text-[10px] text-slate-500">
        Neighbor rating distribution (top-{stats.count} similar users)
      </p>
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {stats.buckets.map((count, i) => {
          const pct = (count / total) * 100;
          return (
            <div
              key={i}
              className="neighbor-bar-segment h-full transition-all"
              style={{ width: `${pct}%`, background: BUCKET_COLORS[i] }}
              title={`${i + 1}★: ${count} users (${pct.toFixed(0)}%)`}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-slate-600">
        <span>1★</span>
        <span>3★</span>
        <span>5★</span>
      </div>
    </div>
  );
}
