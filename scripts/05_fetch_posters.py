#!/usr/bin/env python3
"""
05_fetch_posters.py — Fetch poster URLs from TMDB for all movies that have a tmdbId.
Reads /public/data/movies.json, enriches poster_url field, writes back in-place.
Also writes /public/data/poster_map.json for fast lookup.

Usage:
  TMDB_API_KEY=your_key python scripts/05_fetch_posters.py
  # or
  python scripts/05_fetch_posters.py --api-key YOUR_KEY

Get a free TMDB API key at https://www.themoviedb.org/settings/api (no credit card needed).
"""

import os
import json
import time
import argparse
import urllib.request
import urllib.error
from dotenv import load_dotenv

SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
ROOT         = os.path.join(SCRIPT_DIR, "..")
PUBLIC_DIR   = os.path.join(ROOT, "public", "data")
MOVIES_FILE  = os.path.join(PUBLIC_DIR, "movies.json")
POSTER_MAP   = os.path.join(PUBLIC_DIR, "poster_map.json")

# Load environment variables from .env file in the scripts directory
load_dotenv(os.path.join(SCRIPT_DIR, '.env'))

TMDB_BASE    = "https://api.themoviedb.org/3/movie/{tmdb_id}?api_key={api_key}&append_to_response=images"
IMG_BASE     = "https://image.tmdb.org/t/p/w342"
RATE_LIMIT   = 0.26   # TMDB free tier: ~40 req/s; we stay conservative at ~4/s


def fetch_poster(tmdb_id: str, api_key: str) -> str | None:
    url = TMDB_BASE.format(tmdb_id=tmdb_id, api_key=api_key)
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        path = data.get("poster_path")
        return IMG_BASE + path if path else None
    except (urllib.error.HTTPError, urllib.error.URLError, json.JSONDecodeError,
            TimeoutError, KeyError):
        return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-key", default=os.environ.get("TMDB_API_KEY", ""),
                        help="TMDB API key (or set TMDB_API_KEY env var)")
    parser.add_argument("--resume", action="store_true",
                        help="Skip movies that already have a poster_url")
    parser.add_argument("--limit", type=int, default=0,
                        help="Only fetch first N movies (0 = all)")
    args = parser.parse_args()

    if not args.api_key:
        print("[error] No TMDB API key. Set TMDB_API_KEY or pass --api-key.")
        print("  Get a free key at https://www.themoviedb.org/settings/api")
        return

    with open(MOVIES_FILE) as f:
        movies = json.load(f)

    # Load existing poster map if resuming
    existing: dict[str, str | None] = {}
    if args.resume and os.path.exists(POSTER_MAP):
        with open(POSTER_MAP) as f:
            existing = json.load(f)

    poster_map: dict[str, str | None] = dict(existing)

    to_fetch = [m for m in movies
                if m.get("tmdbId")
                and (not args.resume or str(m["movieId"]) not in existing)]

    if args.limit:
        to_fetch = to_fetch[:args.limit]

    print(f"[posters] Fetching for {len(to_fetch):,} movies…")
    found = 0

    for i, movie in enumerate(to_fetch):
        tmdb_id  = movie["tmdbId"]
        movie_id = str(movie["movieId"])

        if not tmdb_id or tmdb_id == "nan":
            poster_map[movie_id] = None
            continue

        url = fetch_poster(tmdb_id, args.api_key)
        poster_map[movie_id] = url
        if url:
            found += 1

        if (i + 1) % 100 == 0:
            pct = (i + 1) / len(to_fetch) * 100
            print(f"  {i+1}/{len(to_fetch)} ({pct:.0f}%)  found={found}")
            # Checkpoint
            with open(POSTER_MAP, "w") as f:
                json.dump(poster_map, f, separators=(",", ":"))

        time.sleep(RATE_LIMIT)

    # Merge poster_url back into movies.json
    pm_lookup = dict(poster_map)
    for movie in movies:
        movie["poster_url"] = pm_lookup.get(str(movie["movieId"]))

    with open(MOVIES_FILE, "w") as f:
        json.dump(movies, f, separators=(",", ":"))
    print(f"[saved] {MOVIES_FILE}  (with poster_url)")

    with open(POSTER_MAP, "w") as f:
        json.dump(poster_map, f, separators=(",", ":"))
    print(f"[saved] {POSTER_MAP}")

    print(f"[done] {found}/{len(to_fetch)} posters found.")


if __name__ == "__main__":
    main()
