"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import type { Movie } from "@/lib/types";
import { genreColor, genreColorLight } from "@/lib/utils";

interface MovieSearchProps {
  allMovies:      Movie[];
  userGenres:     string[];
  onSelectMovie:  (movie: Movie) => void;
}

export default function MovieSearch({ allMovies, userGenres, onSelectMovie }: MovieSearchProps) {
  const [query, setQuery]         = useState("");
  const [results, setResults]     = useState<Movie[]>([]);
  const [selected, setSelected]   = useState<Movie | null>(null);
  const [alsoLike, setAlsoLike]   = useState<Movie[]>([]);
  const [focused, setFocused]     = useState(false);
  const inputRef                  = useRef<HTMLInputElement>(null);

  // Search as user types
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const q = query.toLowerCase();
    const matches = allMovies
      .filter(m =>
        m.title.toLowerCase().includes(q) ||
        (m.year && String(m.year).includes(q))
      )
      .sort((a, b) => {
        // Exact title match first, then starts-with, then contains
        const aTitle = a.title.toLowerCase();
        const bTitle = b.title.toLowerCase();
        if (aTitle === q) return -1;
        if (bTitle === q) return 1;
        if (aTitle.startsWith(q) && !bTitle.startsWith(q)) return -1;
        if (!aTitle.startsWith(q) && bTitle.startsWith(q)) return 1;
        // Prefer movies matching user's genre preferences
        const aMatch = a.genres.some(g => userGenres.includes(g)) ? 1 : 0;
        const bMatch = b.genres.some(g => userGenres.includes(g)) ? 1 : 0;
        if (aMatch !== bMatch) return bMatch - aMatch;
        return b.rating_count - a.rating_count;
      })
      .slice(0, 8);
    setResults(matches);
  }, [query, allMovies, userGenres]);

  // Build "You may also like" when a movie is selected
  function selectMovie(movie: Movie) {
    setSelected(movie);
    setQuery(movie.title + (movie.year ? ` (${movie.year})` : ""));
    setResults([]);
    setFocused(false);
    onSelectMovie(movie);

    // Find similar movies by genre overlap
    const movieGenres = new Set(movie.genres);
    // WITH THIS
const baseTitle = movie.title
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, "")
  .split(/[\s:,]+/)[0]; // first word e.g. "jurassic"

const similar = allMovies
  .filter(m =>
    m.movieId !== movie.movieId &&
    m.rating_count >= 30 &&
    m.genres.filter(g => movieGenres.has(g)).length >= 1
  )
  .sort((a, b) => {
    const aTitle = a.title.toLowerCase().replace(/[^a-z0-9\s]/g, "");
    const bTitle = b.title.toLowerCase().replace(/[^a-z0-9\s]/g, "");

    // Franchise match — same first word (e.g. "jurassic") → always first
    const aFranchise = aTitle.startsWith(baseTitle) ? 2 : 0;
    const bFranchise = bTitle.startsWith(baseTitle) ? 2 : 0;
    if (aFranchise !== bFranchise) return bFranchise - aFranchise;

    // Then genre overlap
    const aOverlap = a.genres.filter(g => movieGenres.has(g)).length;
    const bOverlap = b.genres.filter(g => movieGenres.has(g)).length;
    if (aOverlap !== bOverlap) return bOverlap - aOverlap;

    // Then rating
    return b.avg_rating - a.avg_rating;
  })
  .slice(0, 6);
    setAlsoLike(similar);
  }

  function handleClear() {
    setQuery("");
    setResults([]);
    setSelected(null);
    setAlsoLike([]);
    inputRef.current?.focus();
  }

  return (
    <div className="mb-8">
      {/* Search bar */}
      <div className="relative">
        <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all ${
          focused ? "border-teal-500/60 bg-slate-800/80" : "border-white/10 bg-white/3"
        }`}>
          <span className="text-lg text-slate-500">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(null); }}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 300)}
            placeholder="Search for a movie..."
            className="flex-1 bg-transparent text-slate-100 placeholder-slate-600 outline-none text-sm"
          />
          {query && (
            <button onClick={handleClear} className="text-slate-600 hover:text-slate-400 transition-colors text-lg">
              ✕
            </button>
          )}
        </div>

        {/* Dropdown results */}
        {focused && query.trim() && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-2xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">
            {results.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-500">
                <p className="text-2xl mb-1">🎬</p>
                <p>No movie found for <span className="text-slate-300">"{query}"</span></p>
                <p className="text-xs mt-1 text-slate-600">Try a different title or year</p>
              </div>
            ) : (
              <ul>
                {results.map((movie, i) => (
                  <li key={movie.movieId}>
                    <button
                     onMouseDown={(e) => { e.preventDefault(); selectMovie(movie); }}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors ${
                        i !== results.length - 1 ? "border-b border-white/5" : ""
                      }`}
                    >
                      {/* Mini poster */}
                      <div className="relative h-12 w-8 shrink-0 overflow-hidden rounded bg-slate-800">
                        {movie.poster_url ? (
                          <Image src={movie.poster_url} alt={movie.title} fill sizes="32px" className="object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-slate-600">🎬</div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-100 truncate">{movie.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-slate-500">{movie.year ?? "—"}</span>
                          <span className="text-xs text-amber-400">{movie.avg_rating.toFixed(1)} ★</span>
                          {movie.genres.slice(0, 2).map(g => (
                            <span key={g} className="text-[10px] rounded-full px-1.5 py-0.5"
                              style={{ color: genreColor(g), background: genreColorLight(g) }}>
                              {g}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Highlight if matches user preferences */}
                      {movie.genres.some(g => userGenres.includes(g)) && (
                        <span className="shrink-0 text-[10px] text-teal-400 border border-teal-700/40 rounded-full px-2 py-0.5">
                          matches you
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Selected movie detail + You may also like */}
      {selected && (
        <div className="mt-4 animate-slide-up">
          {/* Selected movie card */}
          <div className="glass-bright rounded-2xl p-4 flex gap-4">
            <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-800">
              {selected.poster_url ? (
                <Image src={selected.poster_url} alt={selected.title} fill sizes="80px" className="object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-2xl opacity-20">🎬</div>
              )}
            </div>
            <div className="flex-1">
              <h3 className="font-display text-lg text-slate-100">{selected.title}</h3>
              <p className="text-sm text-slate-500">{selected.year}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {selected.genres.map(g => (
                  <span key={g} className="rounded-full px-2 py-0.5 text-xs"
                    style={{ color: genreColor(g), background: genreColorLight(g) }}>
                    {g}
                  </span>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-3 text-sm">
                <span className="text-amber-400 font-medium">{selected.avg_rating.toFixed(1)} ★</span>
                <span className="text-slate-600">{selected.rating_count.toLocaleString()} ratings</span>
              </div>
            </div>
          </div>

          {/* You may also like */}
          {alsoLike.length > 0 && (
            <div className="mt-4">
              <p className="mb-3 text-sm font-medium text-slate-400">
                You may also like
                <span className="ml-2 text-xs text-slate-600">— same genre as {selected.title}</span>
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {alsoLike.map(movie => (
                  <button
                    key={movie.movieId}
                    onClick={() => selectMovie(movie)}
                    className="group text-left"
                  >
                    <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-slate-800 ring-0 group-hover:ring-2 ring-teal-500/50 transition-all">
                      {movie.poster_url ? (
                        <Image src={movie.poster_url} alt={movie.title} fill sizes="100px" className="object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-2xl opacity-20">🎬</div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 p-2">
                        <p className="text-[10px] text-amber-400">{movie.avg_rating.toFixed(1)} ★</p>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-400 line-clamp-2 group-hover:text-slate-200 transition-colors">
                      {movie.title}
                    </p>
                    <p className="text-[10px] text-slate-600">{movie.year}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}