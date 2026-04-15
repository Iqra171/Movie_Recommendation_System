#!/usr/bin/env python3
"""
02_preprocess.py — Parse MovieLens CSV files and build intermediate data structures.
Outputs:
  data/processed/movies_enriched.json  — movies with avg_rating, genre list, year
  data/processed/tag_mood_map.json     — mood → list of movieIds from real tag data
  data/processed/ratings_summary.json — per-movie avg rating and count
"""

import os
import re
import json
import argparse
import pandas as pd
from collections import defaultdict

# ── paths ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT       = os.path.join(SCRIPT_DIR, "..")
DATA_DIR   = os.path.join(ROOT, "data")
OUT_DIR    = os.path.join(DATA_DIR, "processed")

# ── mood → tag keywords (derived from tags.csv at runtime) ────────────────────
MOOD_KEYWORDS = {
    "light":       ["funny", "feel-good", "feel good", "light", "comedy", "hilarious",
                    "lighthearted", "charming", "fun", "heartwarming"],
    "thoughtful":  ["thought-provoking", "thought provoking", "complex", "mind-bending",
                    "mind bending", "philosophical", "deep", "intelligent", "cerebral",
                    "thought provoking", "meaningful"],
    "thrilling":   ["suspense", "thriller", "gripping", "tension", "suspenseful",
                    "edge of your seat", "intense", "thrilling", "nail-biting", "exciting"],
    "nostalgic":   [],  # handled by year filter ≤ 1990, avg_rating ≥ 4.0
}


def extract_year(title: str) -> int | None:
    m = re.search(r'\((\d{4})\)\s*$', title)
    return int(m.group(1)) if m else None


def clean_title(title: str) -> str:
    return re.sub(r'\s*\(\d{4}\)\s*$', '', title).strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", default="ml-latest-small",
                        choices=["ml-latest-small", "ml-32m"])
    args = parser.parse_args()

    ds_dir = os.path.join(DATA_DIR, args.dataset)
    os.makedirs(OUT_DIR, exist_ok=True)

    print(f"[preprocess] Loading from {ds_dir}")

    # ── load ──────────────────────────────────────────────────────────────────
    dtype_r = {"userId": "int32", "movieId": "int32", "rating": "float32"}
    movies  = pd.read_csv(os.path.join(ds_dir, "movies.csv"))
    ratings = pd.read_csv(os.path.join(ds_dir, "ratings.csv"), dtype=dtype_r)
    tags    = pd.read_csv(os.path.join(ds_dir, "tags.csv"))
    links   = pd.read_csv(os.path.join(ds_dir, "links.csv"),
                          dtype={"movieId": "int32", "tmdbId": "str", "imdbId": "str"})

    print(f"  movies={len(movies):,}  ratings={len(ratings):,}  tags={len(tags):,}")

    # ── ratings summary ───────────────────────────────────────────────────────
    rs = (ratings.groupby("movieId")["rating"]
          .agg(avg_rating="mean", rating_count="count")
          .reset_index())
    rs["avg_rating"] = rs["avg_rating"].round(2)

    # ── enrich movies ─────────────────────────────────────────────────────────
    movies = movies.merge(rs, on="movieId", how="left")
    movies = movies.merge(links[["movieId", "tmdbId"]], on="movieId", how="left")
    movies["avg_rating"]   = movies["avg_rating"].fillna(0.0)
    movies["rating_count"] = movies["rating_count"].fillna(0).astype(int)
    movies["year"]         = movies["title"].apply(extract_year)
    movies["clean_title"]  = movies["title"].apply(clean_title)
    movies["genres_list"]  = movies["genres"].apply(
        lambda g: g.split("|") if isinstance(g, str) and g != "(no genres listed)" else []
    )
    movies["tmdbId"] = movies["tmdbId"].fillna("").astype(str)

    # ── export movies_enriched.json ───────────────────────────────────────────
    movies_out = []
    for _, row in movies.iterrows():
        movies_out.append({
            "movieId":      int(row["movieId"]),
            "title":        row["clean_title"],
            "year":         int(row["year"]) if pd.notna(row["year"]) else None,
            "genres":       row["genres_list"],
            "avg_rating":   float(row["avg_rating"]),
            "rating_count": int(row["rating_count"]),
            "tmdbId":       row["tmdbId"],
            "poster_url":   None,  # filled by 05_fetch_posters.py
        })

    out_path = os.path.join(OUT_DIR, "movies_enriched.json")
    with open(out_path, "w") as f:
        json.dump(movies_out, f, separators=(",", ":"))
    print(f"[saved] {out_path}  ({len(movies_out):,} movies)")

    # ── tag mood map ──────────────────────────────────────────────────────────
    tags["tag_lower"] = tags["tag"].str.lower().str.strip()

    mood_map: dict[str, list[int]] = {}

    for mood, keywords in MOOD_KEYWORDS.items():
        if mood == "nostalgic":
            # year ≤ 1990 AND avg_rating ≥ 4.0
            nostalgic_ids = movies[
                (movies["year"].notna()) &
                (movies["year"] <= 1990) &
                (movies["avg_rating"] >= 4.0)
            ]["movieId"].tolist()
            mood_map["nostalgic"] = [int(x) for x in nostalgic_ids]
            continue

        matched = tags[tags["tag_lower"].apply(
            lambda t: any(kw in t for kw in keywords)
        )]["movieId"].unique()
        mood_map[mood] = [int(x) for x in matched]

    out_path = os.path.join(OUT_DIR, "tag_mood_map.json")
    with open(out_path, "w") as f:
        json.dump(mood_map, f, separators=(",", ":"))
    for m, ids in mood_map.items():
        print(f"  mood '{m}': {len(ids)} movies")
    print(f"[saved] {out_path}")

    # ── ratings summary (for API cold start seeding) ──────────────────────────
    rs_out = {str(int(r["movieId"])): {"avg": round(float(r["avg_rating"]), 2),
                                        "count": int(r["rating_count"])}
              for _, r in rs.iterrows()}
    out_path = os.path.join(OUT_DIR, "ratings_summary.json")
    with open(out_path, "w") as f:
        json.dump(rs_out, f, separators=(",", ":"))
    print(f"[saved] {out_path}")

    print("[done] Preprocessing complete.")


if __name__ == "__main__":
    main()
