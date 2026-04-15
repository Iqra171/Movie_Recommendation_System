/**
 * lib/prefs.ts — User preference persistence via localStorage.
 * Stores genre selections and rated movies so onboarding is skipped on return visits.
 */

const KEY = "movielens_prefs_v1";

export interface StoredPrefs {
  genres:      string[];
  ratedMovies: Array<{ movieId: number; rating: number; timestamp: number }>;
  notInterested:   number[];   // movieIds the user dismissed
  boostedMovies:   number[];   // movieIds the user boosted
  savedAt:     number;
}

export function savePrefs(prefs: StoredPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // localStorage unavailable (SSR or private mode) — fail silently
  }
}

export function loadPrefs(): StoredPrefs | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredPrefs;
  } catch {
    return null;
  }
}

export function clearPrefs(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}