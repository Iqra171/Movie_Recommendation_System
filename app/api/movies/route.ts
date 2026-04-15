import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

const MOVIES_FILE = path.join(process.cwd(), "public", "data", "movies.json");

let _cache: unknown[] | null = null;

function loadMovies() {
  if (_cache) return _cache;
  if (!fs.existsSync(MOVIES_FILE)) return [];
  _cache = JSON.parse(fs.readFileSync(MOVIES_FILE, "utf8"));
  return _cache!;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const genre    = searchParams.get("genre");
    const mood     = searchParams.get("mood");   // not filtered here; use tag_mood_map
    const limit    = parseInt(searchParams.get("limit") ?? "0", 10);
    const minRating = parseFloat(searchParams.get("min_rating") ?? "0");

    let movies = loadMovies() as Array<{
      movieId: number;
      genres:  string[];
      avg_rating: number;
    }>;

    if (genre) {
      movies = movies.filter(m => m.genres.includes(genre));
    }
    if (minRating > 0) {
      movies = movies.filter(m => m.avg_rating >= minRating);
    }
    if (limit > 0) {
      movies = movies.slice(0, limit);
    }

    return NextResponse.json(movies, {
      headers: { "Cache-Control": "public, max-age=86400" },
    });
  } catch (err) {
    console.error("[api/movies]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
