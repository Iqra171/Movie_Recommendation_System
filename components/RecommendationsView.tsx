"use client";

import { useState, useEffect, useCallback } from "react";
import type { Recommendation, UserRating, TasteProfile, Movie } from "@/lib/types";
import { WARM_THRESHOLD } from "@/lib/types";
import {
  getRecommendations,
  buildSyntheticProfile,
  applyFeedback,
  computeTasteProfile,
  loadMovies,
  loadMoodMap,
  loadNeighborData,
} from "@/lib/recommender";
import { loadPrefs, savePrefs } from "@/lib/prefs";
import RecommendationCard from "./RecommendationCard";
import TasteProfilePanel from "./TasteProfile";
// import ColdStartBanner from "./ColdStartBanner";
import MovieSearch from "./MovieSearch";
import AboutSection from "./AboutSection";

interface RecommendationsViewProps {
  genres:   string[];
  onReset:  () => void;
}

export default function RecommendationsView({ genres, onReset }: RecommendationsViewProps) {
  const [recs, setRecs]           = useState<Recommendation[]>([]);
  const [allRatings, setAllRatings] = useState<UserRating[]>([]);
  const [allMovies, setAllMovies]   = useState<Movie[]>([]);
  const [excluded, setExcluded]     = useState<Set<number>>(new Set());
  const [profile, setProfile]       = useState<TasteProfile>({
    topGenres: [], avgRating: 0, ratingBias: "average",
    totalRatings: 0, modeTransitioned: false,
  });
  const [loading, setLoading]     = useState(true);
  const [sidebarOpen, setSidebar] = useState(false);

  const realRatings = allRatings.filter(r => !r.synthetic);
  const mode        = realRatings.length >= WARM_THRESHOLD ? "warm" : "cold";

  // Init: load movies, restore saved ratings, build synthetic profile
  useEffect(() => {
    async function init() {
      const [movies, moodMap] = await Promise.all([loadMovies(), loadMoodMap()]);
      setAllMovies(movies);

      // Restore saved ratings from localStorage
      // Inside the init() useEffect, after loading prefs
      const prefs = loadPrefs();
      if (prefs?.notInterested?.length) {
        setExcluded(new Set(prefs.notInterested));
      }
      const saved    = prefs?.ratedMovies ?? [];
      const realIds  = new Set(saved.map(r => r.movieId));

      // Use a neutral mood fallback since mood is removed
      const synth = buildSyntheticProfile(genres, "light", movies, moodMap);
      const merged = [
        ...synth.filter(r => !realIds.has(r.movieId)),
        ...saved.map(r => ({ ...r, synthetic: false, timestamp: r.timestamp })),
      ];
      // Inside the init() useEffect, after loading prefs

      setAllRatings(merged);
      setProfile(computeTasteProfile(merged, movies));
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh recs when ratings or excluded change
  useEffect(() => {
    if (!allRatings.length) return;
    setLoading(true);
    getRecommendations(genres, "light", allRatings, excluded,5)
      .then(r => { setRecs(r); setLoading(false); });
  }, [allRatings, excluded]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRate = useCallback(async (movieId: number, rating: number) => {
    const movies = await loadMovies();
    setAllRatings(prev => {
      const next = [
        ...prev.filter(r => r.movieId !== movieId),
        { movieId, rating, synthetic: false, timestamp: Date.now() },
      ];
      const profile = computeTasteProfile(next, movies);
      setProfile(profile);

      // Persist real ratings
      const prefs = loadPrefs();
      savePrefs({
        genres: prefs?.genres ?? genres,
        ratedMovies: next
          .filter(r => !r.synthetic)
          .map(r => ({ movieId: r.movieId, rating: r.rating, timestamp: r.timestamp })),
        savedAt: Date.now(),
      });

      return next;
    });
  }, [genres]);

  const handleNotInterested = useCallback((movieId: number) => {
  setRecs(prev => applyFeedback(prev, movieId, "not_interested"));
  setExcluded(prev => {
    const next = new Set([...prev, movieId]);
    // Persist to localStorage
    const prefs = loadPrefs();
    savePrefs({
      ...prefs!,
      notInterested: [...(prefs?.notInterested ?? []), movieId],
      savedAt: Date.now(),
    });
    return next;
  });
}, []);

  const handleMoreLikeThis = useCallback(async (movieId: number) => {
  setRecs(prev => {
    const reranked = applyFeedback(prev, movieId, "more_like_this");
    return reranked;
  });

  // Find the target movie and fetch 2-3 similar ones to inject
  const target = allMovies.find(m => m.movieId === movieId);
  if (!target) return;

  const targetGenres = new Set(target.genres);
  const currentIds   = new Set(recs.map(r => r.movie.movieId));
  currentIds.add(movieId);

  const similar = allMovies
    .filter(m =>
      !currentIds.has(m.movieId) &&
      !excluded.has(m.movieId) &&
      m.rating_count >= 30 &&
      m.genres.filter(g => targetGenres.has(g)).length >= 2
    )
    .sort((a, b) => {
      const aOverlap = a.genres.filter(g => targetGenres.has(g)).length;
      const bOverlap = b.genres.filter(g => targetGenres.has(g)).length;
      if (aOverlap !== bOverlap) return bOverlap - aOverlap;
      return b.avg_rating - a.avg_rating;
    })
    .slice(0, 3);

  if (!similar.length) return;

  // Build recommendation objects for the new movies
  const [moodMap, neighborData] = await Promise.all([
    loadMoodMap(),
    loadNeighborData(),
  ]);

  const newRecs: Recommendation[] = similar.map(movie => ({
    movie,
    predicted_rating: Math.round(movie.avg_rating * 10) / 10,
    explanation: {
      mode: "cold" as const,
      genres: movie.genres.filter(g => targetGenres.has(g)),
    },
    neighbor_stats: neighborData[String(movie.movieId)] ?? null,
  }));

  setRecs(prev => [...prev, ...newRecs]);
}, [recs, allMovies, excluded]);

  return (
    <div className="flex gap-6">
      {/* Main column */}
      <div className="flex-1 min-w-0">

        {/* Search bar — top of recommendations */}
        {allMovies.length > 0 && (
          <MovieSearch
            allMovies={allMovies}
            userGenres={genres}
            onSelectMovie={() => {}}
          />
        )}

        {/* Mode transition banner */}
        {mode === "warm" && (
          <div className="mb-6 rounded-xl border border-blue-700/40 bg-blue-900/20 px-4 py-3 text-sm animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔗</span>
              <div>
                <p className="font-medium text-blue-300">Collaborative filtering active</p>
                <p className="text-blue-400/70">
                  Now using SVD-based CF based on your {realRatings.length} real ratings.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* <ColdStartBanner realRatingCount={realRatings.length} /> */}

        {/* Genre preference chips */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">Your preferences:</span>
          {genres.map(g => (
            <span key={g} className="rounded-full border px-2.5 py-0.5 text-xs"
              style={{ borderColor: "#2dd4bf44", color: "#2dd4bf", background: "#2dd4bf11" }}>
              {g}
            </span>
          ))}
          <button onClick={onReset} className="ml-auto text-xs text-slate-600 hover:text-slate-400 transition-colors">
            Edit →
          </button>
        </div>

        {/* Rec grid */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
              <p className="text-sm text-slate-500">Finding movies for you…</p>
            </div>
          </div>
        ) : recs.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-white/3 px-6 py-12 text-center">
            <p className="text-slate-400">No more recommendations.</p>
            <button onClick={() => setExcluded(new Set())}
              className="mt-3 text-sm text-teal-400 hover:underline">
              Reset filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {recs.map((rec, i) => (
              <RecommendationCard
                key={rec.movie.movieId}
                rec={rec}
                index={i}
                onNotInterested={handleNotInterested}
                onMoreLikeThis={handleMoreLikeThis}
              />
            ))}
          </div>
          
        )}

        <div className="mt-10">
          <AboutSection />
        </div>
      </div>

      {/* Sidebar — desktop */}
      <div className="hidden lg:block w-64 shrink-0">
        <div className="sticky top-6 space-y-4">
          <TasteProfilePanel profile={profile} mode={mode} />
          <button onClick={onReset}
            className="w-full rounded-xl border border-white/10 py-2 text-sm text-slate-500 hover:border-white/20 hover:text-slate-400 transition-all">
            ✏️ Edit preferences
          </button>
        </div>
      </div>

      {/* Mobile sidebar toggle */}
      <button onClick={() => setSidebar(v => !v)}
        className="fixed bottom-4 right-4 z-40 lg:hidden h-12 w-12 rounded-full bg-teal-600 shadow-lg flex items-center justify-center text-white">
        👤
      </button>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setSidebar(false)}>
          <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl p-4 space-y-4"
            style={{ background: "var(--bg-card)" }}
            onClick={e => e.stopPropagation()}>
            <TasteProfilePanel profile={profile} mode={mode} />
            <button onClick={onReset}
              className="w-full rounded-xl border border-white/10 py-2 text-sm text-slate-500">
              ✏️ Edit preferences
            </button>
          </div>
        </div>
      )}
    </div>
  );
}