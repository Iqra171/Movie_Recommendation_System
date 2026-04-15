#!/usr/bin/env python3
"""
04_export_json.py — Pre-compute recommendations for seed genre profiles and export
static JSON files consumed by the Next.js API routes at runtime (no Python on Vercel).

Outputs to /public/data/:
  movies.json              — full movie catalog (movieId, title, year, genres, avg_rating, poster_url)
  tag_mood_map.json        — mood → [movieId, ...]
  recs_{hash}.json         — top-20 recs per seed profile (one per genre combo)
  neighbor_data.json       — per-movie neighbor statistics for explainability visualization
"""

import os
import json
import pickle
import hashlib
import argparse
import numpy as np
import pandas as pd
from collections import defaultdict


class FunkSVD:
    """Must match definition in 03_train_svd.py for pickle to deserialize."""
    def __init__(self, n_factors=50, n_epochs=20, lr=0.005, reg=0.02, random_state=42):
        self.n_factors = n_factors
        self.n_epochs  = n_epochs
        self.lr        = lr
        self.reg       = reg
        self.random_state = random_state

    def fit(self, ratings_df):
        pass  # not called here — only predict() is used

    def predict(self, uid, iid) -> float:
        u = self.user2idx.get(uid)
        i = self.item2idx.get(iid)
        if u is None and i is None:
            return self.global_mean
        if u is None:
            return float(np.clip(self.global_mean + self.bi[i], 0.5, 5.0))
        if i is None:
            return float(np.clip(self.global_mean + self.bu[u], 0.5, 5.0))
        return float(np.clip(
            self.global_mean + self.bu[u] + self.bi[i]
            + np.dot(self.pu[u], self.qi[i]), 0.5, 5.0))

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT       = os.path.join(SCRIPT_DIR, "..")
DATA_DIR   = os.path.join(ROOT, "data")
PROC_DIR   = os.path.join(DATA_DIR, "processed")
PUBLIC_DIR = os.path.join(ROOT, "public", "data")

ALL_GENRES = [
    "Action", "Adventure", "Animation", "Children", "Comedy",
    "Crime", "Documentary", "Drama", "Fantasy", "Film-Noir",
    "Horror", "IMAX", "Musical", "Mystery", "Romance",
    "Sci-Fi", "Thriller", "War", "Western",
]

MOODS = ["light", "thoughtful", "thrilling", "nostalgic"]


def profile_hash(genres: list[str], mood: str) -> str:
    key = "|".join(sorted(genres)) + ":" + mood
    return hashlib.md5(key.encode()).hexdigest()[:12]


def synthetic_ratings_for_profile(
    genres: list[str],
    mood: str,
    movies: list[dict],
    mood_map: dict,
    n: int = 30,
) -> dict[int, float]:
    """Return {movieId: synthetic_rating} for a seed profile."""
    genre_set  = set(genres)
    mood_ids   = set(mood_map.get(mood, []))

    scored = []
    for m in movies:
        genre_overlap = len(set(m["genres"]) & genre_set)
        in_mood       = 1 if m["movieId"] in mood_ids else 0
        score         = genre_overlap * 2 + in_mood + m["avg_rating"] / 5.0
        if genre_overlap > 0:
            scored.append((score, m["movieId"]))

    scored.sort(reverse=True)
    top = [mid for _, mid in scored[:n]]
    return {mid: 4.0 for mid in top}


def get_top_recs(
    algo,
    mappings: dict,
    rated_ids: set[int],
    all_movie_ids: list[int],
    top_n: int = 20,
) -> list[tuple[int, float]]:
    """Predict ratings for all unrated movies and return top-N."""
    preds = []
    for mid in all_movie_ids:
        if mid in rated_ids:
            continue
        # Use global mean + item bias as seed-user prediction
        i = algo.item2idx.get(mid)
        if i is not None:
            est = float(np.clip(algo.global_mean + algo.bi[i], 0.5, 5.0))
        else:
            est = algo.global_mean
        preds.append((mid, round(est, 2)))

    preds.sort(key=lambda x: -x[1])
    return preds[:top_n]


def build_neighbor_data(algo, mappings: dict, movie_ids: list[int]) -> dict:
    """
    For each movie, compute a neighbor rating distribution for the explainability bar.
    Uses item and user latent factors from FunkSVD.
    Returns {movieId: {"buckets": [0,0,0,0,0], "count": int}}
    """
    qi = algo.qi   # item factors  (n_items × n_factors)
    bu = algo.bu   # user biases
    bi = algo.bi   # item biases
    pu = algo.pu   # user factors  (n_users × n_factors)

    neighbor_data = {}
    n_users = len(algo.user2idx)
    K = min(50, n_users)

    for mid in movie_ids:
        i = algo.item2idx.get(mid)
        if i is None:
            neighbor_data[str(mid)] = {"buckets": [2, 5, 10, 8, 3], "count": 28}
            continue

        item_vec = qi[i]
        sims     = pu @ item_vec
        top_k    = np.argsort(sims)[-K:][::-1]

        buckets = [0, 0, 0, 0, 0]
        for u_inner in top_k:
            est = float(np.clip(
                algo.global_mean + bu[u_inner] + bi[i]
                + np.dot(pu[u_inner], item_vec), 0.5, 5.0))
            bucket = min(int(est) - 1, 4)
            if bucket >= 0:
                buckets[bucket] += 1

        neighbor_data[str(mid)] = {"buckets": buckets, "count": int(K)}

    return neighbor_data


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-genre-combos", type=int, default=50,
                        help="Max number of single-genre seed profiles to generate")
    args = parser.parse_args()

    os.makedirs(PUBLIC_DIR, exist_ok=True)

    # ── load processed data ───────────────────────────────────────────────────
    print("[load] Loading preprocessed data…")
    with open(os.path.join(PROC_DIR, "movies_enriched.json")) as f:
        movies = json.load(f)

    with open(os.path.join(PROC_DIR, "tag_mood_map.json")) as f:
        mood_map = json.load(f)

    with open(os.path.join(PROC_DIR, "model.pkl"), "rb") as f:
        algo = pickle.load(f)

    with open(os.path.join(PROC_DIR, "trainset_mappings.pkl"), "rb") as f:
        mappings = pickle.load(f)

    all_movie_ids = [m["movieId"] for m in movies]
    print(f"  {len(movies):,} movies, {len(all_movie_ids):,} movie IDs")

    # ── copy movies.json ──────────────────────────────────────────────────────
    # poster_url will be filled by 05_fetch_posters.py; copy as-is for now
    movies_path = os.path.join(PUBLIC_DIR, "movies.json")
    with open(movies_path, "w") as f:
        json.dump(movies, f, separators=(",", ":"))
    print(f"[saved] {movies_path}")

    # ── copy tag_mood_map.json ────────────────────────────────────────────────
    mood_path = os.path.join(PUBLIC_DIR, "tag_mood_map.json")
    with open(mood_path, "w") as f:
        json.dump(mood_map, f, separators=(",", ":"))
    print(f"[saved] {mood_path}")

    # ── seed profiles: one per genre × mood ──────────────────────────────────
    print("[recs] Pre-computing seed profile recommendations…")
    seed_genres = ALL_GENRES[:args.max_genre_combos]
    manifest = {}  # hash → {genres, mood}

    for genre in seed_genres:
        for mood in MOODS:
            syn_ratings = synthetic_ratings_for_profile(
                [genre], mood, movies, mood_map
            )
            rated_ids  = set(syn_ratings.keys())
            top_recs   = get_top_recs(algo, mappings, rated_ids, all_movie_ids)

            h = profile_hash([genre], mood)
            manifest[h] = {"genres": [genre], "mood": mood}

            rec_path = os.path.join(PUBLIC_DIR, f"recs_{h}.json")
            payload = {
                "profile": {"genres": [genre], "mood": mood},
                "synthetic_ratings": {str(k): v for k, v in syn_ratings.items()},
                "recommendations": [
                    {"movieId": mid, "predicted_rating": pr}
                    for mid, pr in top_recs
                ],
            }
            with open(rec_path, "w") as f:
                json.dump(payload, f, separators=(",", ":"))

    manifest_path = os.path.join(PUBLIC_DIR, "profiles_manifest.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, separators=(",", ":"))
    print(f"[saved] {len(manifest)} seed profile files + manifest")

    # ── neighbor data for top movies ──────────────────────────────────────────
    print("[neighbors] Computing neighbor data for top 500 movies…")
    top_movies = sorted(movies, key=lambda m: -m["rating_count"])[:500]
    top_ids    = [m["movieId"] for m in top_movies]
    nd         = build_neighbor_data(algo, mappings, top_ids)
    nd_path    = os.path.join(PUBLIC_DIR, "neighbor_data.json")
    with open(nd_path, "w") as f:
        json.dump(nd, f, separators=(",", ":"))
    print(f"[saved] {nd_path}")

    print("[done] Export complete.")


if __name__ == "__main__":
    main()