# Interactive Explainable Recommender System — MovieLens

**Human-in-the-Loop & Explainable AI · MS Computer Science Research Prototype**

---

## System Description

This is an interactive, explainable movie recommender system built on the MovieLens dataset (Harper & Konstan, 2015) as a research prototype for the HESTIA Lab. The system demonstrates two core concepts in recommender system research: (1) **cold start mitigation** via genre chip selection, and (2) **honest, mode-aware explainability** that switches between content-based and collaborative filtering explanations based on the actual algorithm in use. The backend runs entirely as static JSON served by Next.js on Vercel — the SVD model is trained offline with scikit-surprise and all predictions are pre-computed and serialized, eliminating Python runtime dependencies in production. Users interact through a two-step onboarding wizard, see explanations for every recommendation, and can provide explicit feedback ("Not interested", "More like this") that re-ranks results in real time without a page reload.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React 18, Tailwind CSS |
| Backend | Next.js API routes (Node.js, no Python runtime) |
| ML | Python + scikit-surprise SVD, run offline |
| Dataset | MovieLens ml-latest-small (dev) |
| Posters | TMDB API v3 (free tier, no credit card) |
| Deployment | Vercel (free tier) |

---

## Dataset

Both datasets share the same file structure:

- `ratings.csv` — `userId, movieId, rating (0.5–5.0 half-star), timestamp`
- `movies.csv` — `movieId, title (includes year), genres (pipe-separated)`
- `tags.csv` — `userId, movieId, tag (free-text), timestamp`
- `links.csv` — `movieId, imdbId, tmdbId` (used to fetch TMDB posters)

**Development:** [ml-latest-small](https://grouplens.org/datasets/movielens/latest/) — ~100K ratings, ~9K movies, ~600 users

> Harper, F. M., & Konstan, J. A. (2015). The MovieLens datasets: History and context. *ACM Transactions on Interactive Intelligent Systems (TiiS)*, 5(4), 1–19. https://doi.org/10.1145/2827872

---

## Architecture Overview

```
User browser
    │
    ├── OnboardingFlow (2-step wizard)
    │       Step 1: Genre chip selection (18 genres)
    │       Step 2: Recommendations
    │
    ├── RecommendationsView
    │       ├── RecommendationCard × 10
    │       │     ├── TMDB poster
    │       │     ├── Predicted rating
    │       │     ├── ExplanationPanel (cold/CF, mode-honest)
    │       │     │     └── NeighborBar visualization
    │       │     └── Feedback buttons (Not interested / More like this)
    │       └── TasteProfile sidebar (live genre breakdown)
    │
    └── Next.js API routes
            ├── /api/recommend  → reads recs_{hash}.json from /public/data/
            └── /api/movies     → reads movies.json from /public/data/

Offline Python pipeline (no runtime dependency):
    01_download.py   → downloads MovieLens zip
    02_preprocess.py → parses CSV, builds movies_enriched.json, tag_mood_map.json
    03_train_svd.py  → trains SVD with scikit-surprise, saves model.pkl
    04_export_json.py → pre-computes recs per seed profile, exports to /public/data/
    05_fetch_posters.py → fetches TMDB poster URLs, merges into movies.json
```

---

## Cold Start Strategy (Academic Rationale)

The cold start problem — providing useful recommendations to new users with no rating history — is a fundamental challenge in collaborative filtering. Kim et al. (2024, A-LLMRec) identify this gap as a primary motivation for LLM-augmented recommenders: without sufficient rating history, SVD and similar matrix factorization methods cannot place a new user meaningfully in the latent space.

This system addresses cold start with a **synthetic profile seeding** approach:

1. The user selects genre preferences (Step 1). A synthetic rating profile is constructed by assigning `rating = 4.0` to the top-ranked movies from the genre intersection, ranked by community average rating.
2. The synthetic profile is fed into the pre-computed SVD predictions to generate initial recommendations.


The transition is **visually explicit** — the explanation text changes from "Recommended because you selected [Genre]…" to "~N users with similar taste rated this [avg rating]★…"

This is academically grounded: it avoids the hallucinated preference injection described in LLM Data Augmenters (Mysore et al., 2023) while still providing meaningful cold-start recommendations from real tag and rating data.

---

## Explainability Design

The system provides two types of explanations, and **never mixes them dishonestly**:

**Cold start mode** (`< 5 feedback interactions`):
```
Recommended because you selected Action, Sci-Fi and matches your taste profile.
```

**Warm/CF mode** (`≥ 5 feedback interactions`):
```
~24 users with similar taste rated this movie (avg 4.1★).
They also liked The Dark Knight and Inception.
```

Each recommendation card also shows a **neighbor rating distribution bar** — a stacked horizontal bar showing how the top-K similar users distributed their ratings across 1★–5★ buckets. This bar is a direct visualization of the `neighbor_data.json` pre-computed from SVD latent factors.

---

## Folder Structure

```
movielens-recommender/
├── scripts/                     Python preprocessing pipeline
│   ├── 01_download.py           Download MovieLens dataset
│   ├── 02_preprocess.py         Parse CSV, build tag_mood_map, movies_enriched
│   ├── 03_train_svd.py          Train SVD model with scikit-surprise
│   ├── 04_export_json.py        Pre-compute recs, export to /public/data/
│   └── 05_fetch_posters.py      Fetch TMDB poster URLs
├── data/                        Raw dataset (gitignored)
│   ├── ml-latest-small/
│   └── ml-32m/
├── public/
│   └── data/                    Generated JSON (committed, served statically)
│       ├── movies.json
│       ├── tag_mood_map.json
│       ├── neighbor_data.json
│       ├── profiles_manifest.json
│       └── recs_{hash}.json     (one per genre seed profile)
├── app/
│   ├── layout.tsx
│   ├── page.tsx                 Root page (onboarding ↔ recommendations)
│   ├── globals.css
│   └── api/
│       ├── recommend/route.ts   POST: returns pre-computed recs for profile
│       └── movies/route.ts      GET: serves movie catalog with filters
├── components/
│   ├── OnboardingFlow.tsx       2-step cold start wizard
│   ├── RecommendationCard.tsx   Movie card with poster, rating, explanation
│   ├── ExplanationPanel.tsx     Mode-aware explanation + neighbor bar
│   ├── TasteProfile.tsx         Live taste profile sidebar
│   ├── RecommendationsView.tsx  Main recommendations page with state
│   └── AboutSection.tsx         Collapsible research description
├── lib/
│   ├── types.ts                 Shared TypeScript interfaces
│   ├── recommender.ts           Client-side rec engine + scoring logic
│   └── utils.ts                 Helpers (hash, colors, formatting)
├── requirements.txt             Python deps
├── package.json
├── next.config.js
├── tailwind.config.js
└── vercel.json
```

---

## Setup Instructions

### Prerequisites

- **Python 3.10+** with pip
- **Node.js 18+** with npm
- **TMDB API key** (free at https://www.themoviedb.org/settings/api, no credit card needed)

---

### Step 1: Python preprocessing pipeline

```bash
# Clone / download the project
cd movielens-recommender

# Install Python dependencies
pip install -r requirements.txt

# 1. Download ml-latest-small (development)
python scripts/01_download.py
# For production ml-32m (32M ratings — takes longer):
# python scripts/01_download.py --full

# 2. Preprocess dataset
python scripts/02_preprocess.py
# For ml-32m:
# python scripts/02_preprocess.py --dataset ml-32m

# 3. Train SVD model
python scripts/03_train_svd.py
# Optional: run with cross-validation to report RMSE/MAE:
# python scripts/03_train_svd.py --eval
# For ml-32m (slower — set n_factors lower for speed):
# python scripts/03_train_svd.py --dataset ml-32m --n-factors 50

# 4. Export pre-computed JSON
python scripts/04_export_json.py
# This generates /public/data/movies.json, recs_*.json, tag_mood_map.json, etc.

# 5. Fetch TMDB poster URLs
export TMDB_API_KEY=your_tmdb_api_key_here
python scripts/05_fetch_posters.py
# To resume a partial run:
# python scripts/05_fetch_posters.py --resume
# To test with just the first 100 movies:
# python scripts/05_fetch_posters.py --limit 100
```

---

### Step 2: Next.js app

```bash
# Install dependencies
npm install

# Development server
npm run dev
# Open http://localhost:3000

# Production build
npm run build
npm start
```

---

### Step 3: Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy (will prompt for project settings)
vercel

# Or connect your GitHub repo to Vercel for automatic deployments
```

**Important:** Commit the `public/data/` JSON files to your repository before deploying. The app reads these as static assets at runtime — no Python is needed on Vercel.

---

## Environment Variables

None required for the app itself. The TMDB API key is only used during the offline preprocessing step (`05_fetch_posters.py`).

---

## Extending the System

- **Add user accounts:** Replace localStorage with a database (e.g., Vercel KV or PlanetScale) to persist feedback across sessions.
- **Online model updates:** Add a `/api/feedback` route that logs interactions to a database and triggers periodic model retraining.
- **LLM explanations:** Connect to Claude or GPT-4 to generate natural-language explanations per movie, grounded in the SVD neighbor data.
- **A/B testing explainability:** Randomly assign users to explanation types (none / cold / CF / LLM) and measure engagement — a natural HESTIA Lab experiment.

---

## References

1. Harper, F. M., & Konstan, J. A. (2015). The MovieLens datasets: History and context. *ACM Transactions on Interactive Intelligent Systems (TiiS)*, 5(4), 1–19.
2. Kim, J., et al. (2024). A-LLMRec: Large language models meet collaborative filtering: An efficient all-round LLM-based recommender system. *arXiv:2404.11343*.

