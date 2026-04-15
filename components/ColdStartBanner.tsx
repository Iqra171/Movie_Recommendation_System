"use client";

interface ColdStartBannerProps {
  realRatingCount: number;
  threshold?: number;
}

export default function ColdStartBanner({
  realRatingCount,
  threshold = 5,
}: ColdStartBannerProps) {
  if (realRatingCount >= threshold) return null;

  const remaining = threshold - realRatingCount;

  return (
    <div className="cold-banner mb-6 rounded-xl border border-teal-600/40 bg-teal-900/20 px-4 py-3 text-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-lg">🧊</span>
        <div>
          <p className="font-medium text-teal-300">Cold start mode</p>
          <p className="mt-0.5 text-teal-400/80">
            Recommendations are based on your stated genre and mood preferences.
            Rate {remaining} more movie{remaining !== 1 ? "s" : ""} to unlock
            collaborative filtering.
          </p>
        </div>
        <div className="ml-auto shrink-0">
          <div className="flex gap-1">
            {Array.from({ length: threshold }).map((_, i) => (
              <div
                key={i}
                className={`h-2 w-2 rounded-full transition-all duration-300 ${
                  i < realRatingCount
                    ? "bg-teal-400"
                    : "bg-teal-900 border border-teal-600/40"
                }`}
              />
            ))}
          </div>
          <p className="mt-1 text-right text-xs text-teal-500">
            {realRatingCount}/{threshold}
          </p>
        </div>
      </div>
    </div>
  );
}
