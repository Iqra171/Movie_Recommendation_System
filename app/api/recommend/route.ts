import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const PUBLIC_DATA = path.join(process.cwd(), "public", "data");

function profileHash(genres: string[], mood: string): string {
  const key = [...genres].sort().join("|") + ":" + mood;
  return crypto.createHash("md5").update(key).digest("hex").slice(0, 12);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { genres, mood, userRatings, excludeIds = [] } = body;

    if (!genres?.length || !mood) {
      return NextResponse.json({ error: "genres and mood are required" }, { status: 400 });
    }

    // Look up precomputed seed profile
    const hash    = profileHash(genres, mood);
    const recFile = path.join(PUBLIC_DATA, `recs_${hash}.json`);

    let precomputedRecs: Array<{ movieId: number; predicted_rating: number }> = [];
    if (fs.existsSync(recFile)) {
      const data = JSON.parse(fs.readFileSync(recFile, "utf8"));
      precomputedRecs = data.recommendations ?? [];
    }

    // Filter excluded IDs
    const excludeSet = new Set<number>(excludeIds);
    const ratedSet   = new Set<number>((userRatings ?? []).map((r: { movieId: number }) => r.movieId));

    const filtered = precomputedRecs.filter(
      r => !excludeSet.has(r.movieId) && !ratedSet.has(r.movieId)
    );

    return NextResponse.json({
      recommendations: filtered.slice(0, 20),
      hash,
      source: fs.existsSync(recFile) ? "precomputed" : "fallback",
    });
  } catch (err) {
    console.error("[api/recommend]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
