// ── Core data types ────────────────────────────────────────────────────────────

export interface Movie {
  movieId:      number;
  title:        string;
  year:         number | null;
  genres:       string[];
  avg_rating:   number;
  rating_count: number;
  tmdbId:       string;
  poster_url:   string | null;
}

export interface UserRating {
  movieId:   number;
  rating:    number;        // 0.5 – 5.0
  synthetic: boolean;       // true = seeded from genre/mood; false = user input
  timestamp: number;
}

export interface Recommendation {
  movie:             Movie;
  predicted_rating:  number;
  explanation:       Explanation;
  neighbor_stats:    NeighborStats | null;
}

export type SystemMode = "cold" | "warm";

export interface Explanation {
  mode:           SystemMode;
  // Cold start fields
  genres?:        string[];
  mood_tag?:      string;
  // Warm / CF fields
  similar_users?:  number;
  avg_neighbor_rating?: number;
  neighbor_liked?: string[];   // 2 movie titles similar users also liked
}

export interface NeighborStats {
  buckets: number[];   // [#ratings-in-1★, #in-2★, #in-3★, #in-4★, #in-5★]
  count:   number;
}

export interface TasteProfile {
  topGenres:        Array<{ genre: string; pct: number }>;
  avgRating:        number;
  ratingBias:       "generous" | "average" | "critical";
  totalRatings:     number;
  modeTransitioned: boolean;
}

export interface OnboardingState {
  step:            1 | 2 | 3 | "done";
  selectedGenres:  string[];
  selectedMood:    MoodKey | null;
  ratedMovies:     UserRating[];
}

export type MoodKey = "light" | "thoughtful" | "thrilling" | "nostalgic";

export const MOOD_CONFIG: Record<MoodKey, { label: string; desc: string; icon: string; tags: string[] }> = {
  light: {
    label: "Something light",
    desc:  "Fun, feel-good, uplifting",
    icon:  "☀️",
    tags:  ["funny", "feel-good", "lighthearted", "comedy"],
  },
  thoughtful: {
    label: "Deep & thoughtful",
    desc:  "Complex, philosophical, cerebral",
    icon:  "🧠",
    tags:  ["thought-provoking", "complex", "mind-bending", "philosophical"],
  },
  thrilling: {
    label: "Edge of my seat",
    desc:  "Suspenseful, gripping, intense",
    icon:  "⚡",
    tags:  ["suspense", "thriller", "gripping", "tension"],
  },
  nostalgic: {
    label: "Classic / nostalgic",
    desc:  "Before 1990, highly rated",
    icon:  "🎞️",
    tags:  [],
  },
};

export const ALL_GENRES = [
  "Action", "Adventure", "Animation", "Children", "Comedy",
  "Crime", "Documentary", "Drama", "Fantasy", "Film-Noir",
  "Horror", "IMAX", "Musical", "Mystery", "Romance",
  "Sci-Fi", "Thriller", "War", "Western",
] as const;

export const DATASET_MEAN_RATING = 3.5;
export const WARM_THRESHOLD      = 5;
