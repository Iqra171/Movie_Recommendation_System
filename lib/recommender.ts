/**
 * lib/recommender.ts
 * Client-side logic for building and ranking recommendations.
 * Consumes static JSON pre-computed by the Python pipeline.
 */

import type {
  Movie, UserRating, Recommendation, Explanation, NeighborStats,
  TasteProfile, MoodKey, SystemMode,
} from "./types";
import { DATASET_MEAN_RATING, WARM_THRESHOLD } from "./types";
import { md5Hash } from "./utils";

// ── Data loaders (cached) ─────────────────────────────────────────────────────

let _movies:       Movie[]                      | null = null;
let _moodMap:      Record<string, number[]>     | null = null;
let _neighborData: Record<string, NeighborStats>| null = null;

export async function loadMovies(): Promise<Movie[]> {
  if (_movies) return _movies;
  const res = await fetch("/data/movies.json");
  _movies = await res.json();
  return _movies!;
}

export async function loadMoodMap(): Promise<Record<string, number[]>> {
  if (_moodMap) return _moodMap;
  const res = await fetch("/data/tag_mood_map.json");
  _moodMap = await res.json();
  return _moodMap!;
}

export async function loadNeighborData(): Promise<Record<string, NeighborStats>> {
  if (_neighborData) return _neighborData;
  try {
    const res = await fetch("/data/neighbor_data.json");
    _neighborData = await res.json();
  } catch {
    _neighborData = {};
  }
  return _neighborData!;
}

// ── Genre / mood filtering ────────────────────────────────────────────────────

export function filterByGenres(movies: Movie[], genres: string[]): Movie[] {
  if (!genres.length) return movies;
  const gs = new Set(genres);
  return movies.filter(m => m.genres.some(g => gs.has(g)));
}

export function filterByMood(
  movies: Movie[],
  mood: MoodKey,
  moodMap: Record<string, number[]>
): Movie[] {
  if (mood === "nostalgic") {
    return movies.filter(m => (m.year ?? 9999) <= 1990 && m.avg_rating >= 4.0);
  }
  const ids = new Set(moodMap[mood] ?? []);
  return movies.filter(m => ids.has(m.movieId));
}

export function getOnboardingPool(
  movies: Movie[],
  genres: string[],
  mood: MoodKey,
  moodMap: Record<string, number[]>,
  n = 6
): Movie[] {
  const genreFiltered = filterByGenres(movies, genres);
  const moodFiltered  = filterByMood(genreFiltered, mood, moodMap);
  const pool = moodFiltered.length >= n ? moodFiltered : genreFiltered;
return [...pool]
  .filter(m => m.rating_count >= 30)   // only show recognisable movies in onboarding
  .sort((a, b) => b.avg_rating - a.avg_rating || b.rating_count - a.rating_count)
  .slice(0, n);
}

// ── Synthetic rating profile ──────────────────────────────────────────────────

export function buildSyntheticProfile(
  genres: string[],
  mood: MoodKey,
  movies: Movie[],
  moodMap: Record<string, number[]>,
  n = 30
): UserRating[] {
  const gs      = new Set(genres);
  const moodIds = new Set(moodMap[mood] ?? []);

  const scored = movies
    .filter(m => m.genres.some(g => gs.has(g)))
    .map(m => {
      const overlap = m.genres.filter(g => gs.has(g)).length;
      const inMood  = moodIds.has(m.movieId) ? 1 : 0;
      const score   = overlap * 2 + inMood + m.avg_rating / 5;
      return { score, movie: m };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, n);

  return scored.map(({ movie }) => ({
    movieId:   movie.movieId,
    rating:    4.0,
    synthetic: true,
    timestamp: Date.now(),
  }));
}

// ── Simple content-based scoring (fallback when SVD JSON unavailable) ─────────

export function scoreMovieContentBased(
  movie: Movie,
  userRatings: UserRating[],
  allMovies: Movie[]
): number {
  const movieById = new Map(allMovies.map(m => [m.movieId, m]));
  const realRatings = userRatings.filter(r => !r.synthetic);

  if (!realRatings.length) {
    return movie.avg_rating;
  }

  // Weighted average of genre overlap with user's rated movies
  let totalWeight = 0, weightedScore = 0;
  for (const ur of realRatings) {
    const rated = movieById.get(ur.movieId);
    if (!rated) continue;
    const ratedSet   = new Set(rated.genres);
    const targetSet  = new Set(movie.genres);
    const overlap    = [...targetSet].filter(g => ratedSet.has(g)).length;
    const similarity = overlap / Math.max(ratedSet.size, targetSet.size, 1);
    if (similarity > 0) {
      weightedScore += similarity * ur.rating;
      totalWeight   += similarity;
    }
  }

  return totalWeight > 0
    ? (weightedScore / totalWeight) * 0.7 + movie.avg_rating * 0.3
    : movie.avg_rating;
}

// ── SVD-based precomputed recs ────────────────────────────────────────────────

async function fetchPrecomputedRecs(
  genres: string[],
  mood: MoodKey
): Promise<Array<{ movieId: number; predicted_rating: number }> | null> {
  const hash = md5Hash([...genres].sort().join("|") + ":" + mood);
  try {
    const res = await fetch(`/data/recs_${hash}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.recommendations ?? null;
  } catch {
    return null;
  }
}

// ── Main recommendation function ──────────────────────────────────────────────

export async function getRecommendations(
  genres: string[],
  mood: MoodKey,
  userRatings: UserRating[],
  excludeIds: Set<number>,
  limit = 10
): Promise<Recommendation[]> {
  const [allMovies, moodMap, neighborData] = await Promise.all([
    loadMovies(),
    loadMoodMap(),
    loadNeighborData(),
  ]);

  const realRatings   = userRatings.filter(r => !r.synthetic);
  const mode: SystemMode = realRatings.length >= WARM_THRESHOLD ? "warm" : "cold";
  const ratedIds      = new Set(userRatings.map(r => r.movieId));
  const movieById     = new Map(allMovies.map(m => [m.movieId, m]));

  // Try to load SVD precomputed for cold start
  let svdRecs: Map<number, number> = new Map();
  if (mode === "cold") {
    const precomputed = await fetchPrecomputedRecs(genres, mood);
    if (precomputed) {
      for (const r of precomputed) svdRecs.set(r.movieId, r.predicted_rating);
    }
  }

  // Score candidates
  const gs      = new Set(genres);
const moodIds = new Set(moodMap[mood] ?? []);

// Hard filters — run before scoring
const candidates = allMovies.filter(m => {
  if (ratedIds.has(m.movieId) || excludeIds.has(m.movieId)) return false;
  if (m.rating_count < 10) return false;                          // drop obscure movies
  if (mode === "cold" && !m.genres.some(g => gs.has(g))) return false; // must match selected genre
  return true;
});

let scored = candidates.map(movie => {
  let predicted: number;
  if (svdRecs.has(movie.movieId)) {
    predicted = svdRecs.get(movie.movieId)!;
  } else {
    predicted = scoreMovieContentBased(movie, userRatings, allMovies);
  }

  if (mode === "cold") {
    const overlap    = movie.genres.filter(g => gs.has(g)).length;
    const moodBoost  = moodIds.has(movie.movieId) ? 0.5 : 0;
    const countBoost = movie.rating_count >= 50 ? 0.1 : 0;
    predicted = Math.min(5.0, predicted + overlap * 0.1 + moodBoost + countBoost);
  }

  return { movie, predicted };
});

scored.sort((a, b) => b.predicted - a.predicted);
const top = scored.slice(0, limit);

  return top.map(({ movie, predicted }) => {
    const explanation = buildExplanation(mode, movie, genres, mood, realRatings, allMovies);
    const neighborStats = neighborData[String(movie.movieId)] ?? null;
    return {
      movie,
      predicted_rating: Math.round(predicted * 10) / 10,
      explanation,
      neighbor_stats:   neighborStats,
    };
  });
}

// ── Explanation builder ───────────────────────────────────────────────────────

function buildExplanation(
  mode: SystemMode,
  movie: Movie,
  genres: string[],
  mood: MoodKey,
  realRatings: UserRating[],
  allMovies: Movie[]
): Explanation {
  if (mode === "cold") {
    const matchedGenres = movie.genres.filter(g => genres.includes(g));
    return {
      mode,
      genres:   matchedGenres.length ? matchedGenres : genres,
      mood_tag: mood,
    };
  }

  // Warm CF mode — derive neighbor explanation from real ratings
  const movieById   = new Map(allMovies.map(m => [m.movieId, m]));
  const userGenres  = new Set(
    realRatings.flatMap(r => movieById.get(r.movieId)?.genres ?? [])
  );
  const sharedGenres = movie.genres.filter(g => userGenres.has(g));

  // Find 2 other movies the user liked that share a genre
  const neighborLiked = realRatings
  .filter(r => r.rating >= 4.0)
  .map(r => movieById.get(r.movieId))
  .filter((m): m is Movie =>
    !!m &&
    m.movieId !== movie.movieId &&
    m.genres.some(g => new Set(movie.genres).has(g)) && // must share genre with rec
    !m.genres.includes("Children") === !movie.genres.includes("Children") // don't cross family/adult
  )
  .slice(0, 2)
  .map(m => m.title);

  const avgNeighborRating =
    realRatings.reduce((s, r) => s + r.rating, 0) / (realRatings.length || 1);

  return {
    mode,
    // AFTER — use the movie's actual avg_rating and rating_count from the dataset
    similar_users: Math.min(movie.rating_count, 120),
    avg_neighbor_rating: Math.round(movie.avg_rating * 10) / 10,
    neighbor_liked: neighborLiked.length > 0 ? neighborLiked : undefined,
  };
}

// ── Taste profile ─────────────────────────────────────────────────────────────

export function computeTasteProfile(
  ratings: UserRating[],
  allMovies: Movie[]
): TasteProfile {
  const realRatings = ratings.filter(r => !r.synthetic);
  if (!realRatings.length) {
    return { topGenres: [], avgRating: 0, ratingBias: "average", totalRatings: 0, modeTransitioned: false };
  }

  const movieById  = new Map(allMovies.map(m => [m.movieId, m]));
  const genreCounts: Record<string, number> = {};
  let totalRating = 0;

  for (const ur of realRatings) {
    const movie = movieById.get(ur.movieId);
    if (movie) {
      for (const g of movie.genres) {
        genreCounts[g] = (genreCounts[g] ?? 0) + 1;
      }
    }
    totalRating += ur.rating;
  }

  const total    = Object.values(genreCounts).reduce((s, v) => s + v, 0);
  const topGenres = Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([genre, count]) => ({ genre, pct: Math.round(count / total * 100) }));

  const avgRating = totalRating / realRatings.length;
  const ratingBias: TasteProfile["ratingBias"] =
    avgRating > DATASET_MEAN_RATING + 0.3 ? "generous" :
    avgRating < DATASET_MEAN_RATING - 0.3 ? "critical"  : "average";

  return {
    topGenres,
    avgRating:        Math.round(avgRating * 10) / 10,
    ratingBias,
    totalRatings:     realRatings.length,
    modeTransitioned: realRatings.length >= WARM_THRESHOLD,
  };
}

// ── Feedback re-ranking ───────────────────────────────────────────────────────

export function applyFeedback(
  recs: Recommendation[],
  movieId: number,
  action: "not_interested" | "more_like_this"
): Recommendation[] {
  if (action === "not_interested") {
    return recs.filter(r => r.movie.movieId !== movieId);
  }

  // "More like this" — boost movies sharing top genre
  const target = recs.find(r => r.movie.movieId === movieId);
  if (!target) return recs;
  const targetGenres = new Set(target.movie.genres);

  return [...recs]
    .map(r => {
      if (r.movie.movieId === movieId) return r;
      const overlap = r.movie.genres.filter(g => targetGenres.has(g)).length;
      return { ...r, predicted_rating: Math.min(5.0, r.predicted_rating + overlap * 0.15) };
    })
    .sort((a, b) => b.predicted_rating - a.predicted_rating);
}
