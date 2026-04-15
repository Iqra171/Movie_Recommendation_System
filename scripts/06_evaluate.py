#!/usr/bin/env python3
"""
06_evaluate.py — Comprehensive evaluation of the MovieLens recommender system.

Metrics computed:
  Accuracy:       RMSE, MAE (overall, cold users, warm users)
  Ranking:        Precision@K, Recall@K, NDCG@K  (K = 5, 10, 20)
  Coverage:       Catalog coverage, User coverage, Gini coefficient
  Cold start:     Learning curve (RMSE vs. number of ratings per user)
  Explainability: Explanation mode consistency audit

Outputs:
  data/processed/evaluation_report.json   — full results
  Prints a clean summary table to stdout

Usage:
  python scripts/06_evaluate.py
  python scripts/06_evaluate.py --dataset ml-32m
  python scripts/06_evaluate.py --k 10 --test-frac 0.2
"""

import os
import json
import pickle
import argparse
import numpy as np
import pandas as pd
from collections import defaultdict
from datetime import datetime


class FunkSVD:
    """Must match definition in 03_train_svd.py for pickle to deserialize."""
    def __init__(self, n_factors=50, n_epochs=20, lr=0.005, reg=0.02, random_state=42):
        self.n_factors = n_factors
        self.n_epochs  = n_epochs
        self.lr        = lr
        self.reg       = reg
        self.random_state = random_state

    def fit(self, ratings_df):
        pass

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

WARM_THRESHOLD = 5   # must match lib/types.ts


# ── Helpers ───────────────────────────────────────────────────────────────────

def dcg(relevances: list[float]) -> float:
    return sum(r / np.log2(i + 2) for i, r in enumerate(relevances))


def ndcg_at_k(recommended: list[int], relevant: set[int], k: int) -> float:
    hits   = [1.0 if mid in relevant else 0.0 for mid in recommended[:k]]
    ideal  = sorted(hits, reverse=True)
    return dcg(hits) / dcg(ideal) if dcg(ideal) > 0 else 0.0


def precision_at_k(recommended: list[int], relevant: set[int], k: int) -> float:
    hits = sum(1 for mid in recommended[:k] if mid in relevant)
    return hits / k


def recall_at_k(recommended: list[int], relevant: set[int], k: int) -> float:
    if not relevant:
        return 0.0
    hits = sum(1 for mid in recommended[:k] if mid in relevant)
    return hits / len(relevant)


def rmse(errors: list[float]) -> float:
    return float(np.sqrt(np.mean(np.square(errors)))) if errors else 0.0


def mae(errors: list[float]) -> float:
    return float(np.mean(np.abs(errors))) if errors else 0.0


def gini_coefficient(counts: list[int]) -> float:
    """Gini coefficient of recommendation frequency — 0=equal, 1=monopoly."""
    arr = np.array(sorted(counts), dtype=float)
    if arr.sum() == 0:
        return 0.0
    n   = len(arr)
    idx = np.arange(1, n + 1)
    return float((2 * np.dot(idx, arr)) / (n * arr.sum()) - (n + 1) / n)


# ── Data loading ──────────────────────────────────────────────────────────────

def load_data(dataset: str):
    ds_dir  = os.path.join(DATA_DIR, dataset)
    dtype_r = {"userId": "int32", "movieId": "int32", "rating": "float32"}

    print(f"[load] {dataset}")
    ratings = pd.read_csv(os.path.join(ds_dir, "ratings.csv"), dtype=dtype_r)
    movies  = pd.read_csv(os.path.join(ds_dir, "movies.csv"))
    tags    = pd.read_csv(os.path.join(ds_dir, "tags.csv"))

    print(f"  ratings={len(ratings):,}  movies={len(movies):,}  "
          f"users={ratings['userId'].nunique():,}  tags={len(tags):,}")
    return ratings, movies, tags


def load_model():
    model_path = os.path.join(PROC_DIR, "model.pkl")
    if not os.path.exists(model_path):
        raise FileNotFoundError(
            f"model.pkl not found at {model_path}. Run 03_train_svd.py first."
        )
    with open(model_path, "rb") as f:
        return pickle.load(f)


# ── Train / test split ────────────────────────────────────────────────────────

def temporal_split(ratings: pd.DataFrame, test_frac: float):
    """
    Leave-last-N-out split: for each user, the most recent `test_frac` of
    ratings go to test, the rest to train. Preserves temporal order.
    """
    ratings = ratings.sort_values(["userId", "timestamp"])
    train_rows, test_rows = [], []

    for uid, grp in ratings.groupby("userId"):
        n_test = max(1, int(len(grp) * test_frac))
        train_rows.append(grp.iloc[:-n_test])
        test_rows.append(grp.iloc[-n_test:])

    train = pd.concat(train_rows).reset_index(drop=True)
    test  = pd.concat(test_rows).reset_index(drop=True)
    return train, test


# ── SVD prediction (using serialized model) ───────────────────────────────────

def predict_rating(algo, uid: int, mid: int) -> float:
    return algo.predict(uid, mid)


def get_top_k_recs(algo, uid: int, candidate_ids: list[int], k: int) -> list[int]:
    preds = [(mid, predict_rating(algo, uid, mid)) for mid in candidate_ids]
    preds.sort(key=lambda x: -x[1])
    return [mid for mid, _ in preds[:k]]


# ── 1. Accuracy metrics ───────────────────────────────────────────────────────

def compute_accuracy(algo, test: pd.DataFrame, train: pd.DataFrame, sample_n: int = 2000):
    print("[eval] Accuracy metrics (RMSE, MAE)…")

    # Classify users by warmth based on training set size
    user_train_counts = train.groupby("userId").size()

    cold_errors, warm_errors, all_errors = [], [], []

    # Sample for speed on large datasets
    sampled = test.sample(min(sample_n, len(test)), random_state=42)

    for _, row in sampled.iterrows():
        uid, mid, true_r = int(row["userId"]), int(row["movieId"]), float(row["rating"])
        pred_r = predict_rating(algo, uid, mid)
        err    = pred_r - true_r
        all_errors.append(err)

        n_train = user_train_counts.get(uid, 0)
        if n_train < WARM_THRESHOLD:
            cold_errors.append(err)
        else:
            warm_errors.append(err)

    return {
        "overall": {"rmse": round(rmse(all_errors), 4), "mae": round(mae(all_errors), 4),
                    "n": len(all_errors)},
        "cold_users": {"rmse": round(rmse(cold_errors), 4), "mae": round(mae(cold_errors), 4),
                       "n": len(cold_errors),
                       "note": f"users with < {WARM_THRESHOLD} training ratings"},
        "warm_users": {"rmse": round(rmse(warm_errors), 4), "mae": round(mae(warm_errors), 4),
                       "n": len(warm_errors),
                       "note": f"users with >= {WARM_THRESHOLD} training ratings"},
    }


# ── 2. Ranking metrics ────────────────────────────────────────────────────────

def compute_ranking(algo, test: pd.DataFrame, train: pd.DataFrame,
                    all_movie_ids: list[int], k_values: list[int], sample_users: int = 200,
                    relevance_threshold: float = 4.0):
    print(f"[eval] Ranking metrics (P@K, R@K, NDCG@K) for K={k_values}…")

    # Build per-user test relevant sets
    test_relevant = defaultdict(set)
    for _, row in test.iterrows():
        if row["rating"] >= relevance_threshold:
            test_relevant[int(row["userId"])].add(int(row["movieId"]))

    train_seen = defaultdict(set)
    for _, row in train.iterrows():
        train_seen[int(row["userId"])].add(int(row["movieId"]))

    # Sample users who have relevant test items
    eligible = [uid for uid, rel in test_relevant.items() if len(rel) > 0]
    sampled_users = np.random.default_rng(42).choice(
        eligible, size=min(sample_users, len(eligible)), replace=False
    )

    results = {k: {"precision": [], "recall": [], "ndcg": []} for k in k_values}
    max_k   = max(k_values)

    for uid in sampled_users:
        seen       = train_seen[uid]
        candidates = [mid for mid in all_movie_ids if mid not in seen]
        if not candidates:
            continue

        top_recs = get_top_k_recs(algo, uid, candidates, max_k)
        relevant  = test_relevant[uid]

        for k in k_values:
            results[k]["precision"].append(precision_at_k(top_recs, relevant, k))
            results[k]["recall"].append(recall_at_k(top_recs, relevant, k))
            results[k]["ndcg"].append(ndcg_at_k(top_recs, relevant, k))

    summary = {}
    for k in k_values:
        summary[f"@{k}"] = {
            "precision": round(float(np.mean(results[k]["precision"])), 4),
            "recall":    round(float(np.mean(results[k]["recall"])), 4),
            "ndcg":      round(float(np.mean(results[k]["ndcg"])), 4),
            "n_users":   len(results[k]["precision"]),
        }
    return summary


# ── 3. Coverage metrics ───────────────────────────────────────────────────────

def compute_coverage(algo, train: pd.DataFrame, all_movie_ids: list[int],
                     sample_users: int = 300, k: int = 10):
    print("[eval] Coverage metrics (catalog, user, Gini)…")

    train_seen   = defaultdict(set)
    for _, row in train.iterrows():
        train_seen[int(row["userId"])].add(int(row["movieId"]))

    all_uids     = train["userId"].unique()
    sampled      = np.random.default_rng(42).choice(
        all_uids, size=min(sample_users, len(all_uids)), replace=False
    )

    rec_counts   = defaultdict(int)   # movieId → times recommended
    users_served = 0

    for uid in sampled:
        seen       = train_seen[uid]
        candidates = [mid for mid in all_movie_ids if mid not in seen]
        if not candidates:
            continue
        top_recs = get_top_k_recs(algo, uid, candidates, k)
        for mid in top_recs:
            rec_counts[mid] += 1
        users_served += 1

    recommended_items = set(rec_counts.keys())
    catalog_coverage  = len(recommended_items) / len(all_movie_ids)
    user_coverage     = users_served / len(sampled)
    gini              = gini_coefficient(list(rec_counts.values()))

    return {
        "catalog_coverage":  round(catalog_coverage, 4),
        "user_coverage":     round(user_coverage, 4),
        "gini_coefficient":  round(gini, 4),
        "unique_items_recommended": len(recommended_items),
        "total_items":       len(all_movie_ids),
        "note": "Gini: 0=perfectly equal distribution, 1=single item monopoly",
    }


# ── 4. Cold start learning curve ──────────────────────────────────────────────

def compute_cold_start_curve(algo, ratings: pd.DataFrame, buckets: list[int] = None):
    print("[eval] Cold start learning curve (RMSE vs. rating count)…")

    if buckets is None:
        buckets = [1, 2, 3, 5, 10, 20, 50]

    user_counts = ratings.groupby("userId").size()
    curve       = {}

    for b in buckets:
        # Users whose total count puts them in this bucket
        lower = b
        upper = buckets[buckets.index(b) + 1] if b != buckets[-1] else 9999
        uids  = user_counts[(user_counts >= lower) & (user_counts < upper)].index

        if len(uids) == 0:
            continue

        sample = ratings[ratings["userId"].isin(uids)].sample(
            min(500, len(ratings[ratings["userId"].isin(uids)])), random_state=42
        )

        errors = []
        for _, row in sample.iterrows():
            pred = predict_rating(algo, int(row["userId"]), int(row["movieId"]))
            errors.append(pred - float(row["rating"]))

        curve[str(b)] = {
            "rmse":     round(rmse(errors), 4),
            "mae":      round(mae(errors), 4),
            "n_users":  int(len(uids)),
            "n_samples": len(errors),
        }

    return curve


# ── 5. Explainability consistency audit ───────────────────────────────────────

def compute_explainability_audit(public_dir: str, warm_threshold: int = WARM_THRESHOLD):
    """
    Audits precomputed recs_*.json files to verify that:
    - All seed profiles (cold start by definition) have mode='cold' in explanations
    - No CF-style explanation is attached to a cold-start profile
    This verifies the honesty guarantee of the explainability system.
    """
    print("[eval] Explainability consistency audit…")

    manifest_path = os.path.join(public_dir, "profiles_manifest.json")
    if not os.path.exists(manifest_path):
        return {"status": "skipped", "reason": "profiles_manifest.json not found — run 04_export_json.py first"}

    with open(manifest_path) as f:
        manifest = json.load(f)

    total_profiles   = len(manifest)
    total_recs       = 0
    consistent       = 0
    inconsistent     = 0
    missing_files    = 0

    for h, profile in manifest.items():
        rec_path = os.path.join(public_dir, f"recs_{h}.json")
        if not os.path.exists(rec_path):
            missing_files += 1
            continue

        with open(rec_path) as f:
            data = json.load(f)

        recs = data.get("recommendations", [])
        total_recs += len(recs)

        # All seed profiles are cold-start by definition (no real user ratings)
        # The explanation mode in rec files should always reflect cold-start source
        for rec in recs:
            # Seed profile recs are always content/SVD-cold — flag any that
            # accidentally claim to be CF-warm
            mode = rec.get("explanation_mode", "cold")  # default cold if absent
            if mode == "warm":
                inconsistent += 1
            else:
                consistent += 1

    return {
        "status":            "passed" if inconsistent == 0 else "failed",
        "total_profiles":    total_profiles,
        "missing_rec_files": missing_files,
        "total_recs_audited": total_recs,
        "consistent":        consistent,
        "inconsistent":      inconsistent,
        "consistency_rate":  round(consistent / max(total_recs, 1), 4),
        "guarantee":         "Cold start profiles never use CF-mode explanations",
    }


# ── 6. Dataset statistics ─────────────────────────────────────────────────────

def compute_dataset_stats(ratings: pd.DataFrame, movies: pd.DataFrame, tags: pd.DataFrame):
    print("[eval] Dataset statistics…")

    user_counts  = ratings.groupby("userId").size()
    movie_counts = ratings.groupby("movieId").size()

    cold_users = (user_counts < WARM_THRESHOLD).sum()
    warm_users = (user_counts >= WARM_THRESHOLD).sum()

    return {
        "n_ratings":        int(len(ratings)),
        "n_movies":         int(movies["movieId"].nunique()),
        "n_movies_rated":   int(ratings["movieId"].nunique()),
        "n_users":          int(ratings["userId"].nunique()),
        "n_tags":           int(len(tags)),
        "cold_users":       int(cold_users),
        "warm_users":       int(warm_users),
        "cold_user_pct":    round(cold_users / len(user_counts) * 100, 1),
        "rating_scale":     "0.5–5.0 (half-star)",
        "sparsity":         round(1 - len(ratings) / (ratings["userId"].nunique() * ratings["movieId"].nunique()), 4),
        "avg_ratings_per_user":  round(float(user_counts.mean()), 1),
        "median_ratings_per_user": round(float(user_counts.median()), 1),
        "avg_ratings_per_movie": round(float(movie_counts.mean()), 1),
        "rating_distribution": {
            str(r): int((ratings["rating"] == r).sum())
            for r in sorted(ratings["rating"].unique())
        },
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def print_report(report: dict):
    sep = "─" * 60

    print(f"\n{'═' * 60}")
    print("  RECOMMENDER SYSTEM EVALUATION REPORT")
    print(f"  Generated: {report['generated_at']}")
    print(f"{'═' * 60}")

    # Dataset
    ds = report["dataset_statistics"]
    print(f"\n{'Dataset':}")
    print(f"  Ratings:        {ds['n_ratings']:,}")
    print(f"  Users:          {ds['n_users']:,}  "
          f"(cold={ds['cold_users']:,} [{ds['cold_user_pct']}%], warm={ds['warm_users']:,})")
    print(f"  Movies rated:   {ds['n_movies_rated']:,} / {ds['n_movies']:,}")
    print(f"  Sparsity:       {ds['sparsity']:.4f}")
    print(f"  Avg ratings/user: {ds['avg_ratings_per_user']}")

    # Accuracy
    print(f"\n{sep}")
    print("Accuracy")
    acc = report["accuracy"]
    print(f"  {'Subset':<20} {'RMSE':>8}  {'MAE':>8}  {'N':>8}")
    print(f"  {'─'*20} {'─'*8}  {'─'*8}  {'─'*8}")
    for key in ["overall", "cold_users", "warm_users"]:
        a = acc[key]
        print(f"  {key:<20} {a['rmse']:>8.4f}  {a['mae']:>8.4f}  {a['n']:>8,}")

    # Ranking
    print(f"\n{sep}")
    print("Ranking  (relevance threshold: rating ≥ 4.0)")
    rank = report["ranking"]
    print(f"  {'K':<6} {'Precision':>10}  {'Recall':>10}  {'NDCG':>10}  {'Users':>8}")
    print(f"  {'─'*6} {'─'*10}  {'─'*10}  {'─'*10}  {'─'*8}")
    for k_label, v in rank.items():
        print(f"  {k_label:<6} {v['precision']:>10.4f}  {v['recall']:>10.4f}  {v['ndcg']:>10.4f}  {v['n_users']:>8,}")

    # Coverage
    print(f"\n{sep}")
    print("Coverage")
    cov = report["coverage"]
    print(f"  Catalog coverage:  {cov['catalog_coverage']:.2%}  "
          f"({cov['unique_items_recommended']:,} / {cov['total_items']:,} items)")
    print(f"  User coverage:     {cov['user_coverage']:.2%}")
    print(f"  Gini coefficient:  {cov['gini_coefficient']:.4f}  (0=equal, 1=monopoly)")

    # Cold start curve
    print(f"\n{sep}")
    print("Cold Start Learning Curve  (RMSE by user rating count)")
    print(f"  {'Ratings':>10}  {'RMSE':>8}  {'MAE':>8}  {'Users':>8}")
    print(f"  {'─'*10}  {'─'*8}  {'─'*8}  {'─'*8}")
    for bucket, v in report["cold_start_curve"].items():
        print(f"  {bucket:>10}  {v['rmse']:>8.4f}  {v['mae']:>8.4f}  {v['n_users']:>8,}")

    # Explainability
    print(f"\n{sep}")
    print("Explainability Audit")
    ea = report["explainability_audit"]
    status_icon = "✓" if ea["status"] == "passed" else "✗"
    print(f"  Status:           {status_icon} {ea['status'].upper()}")
    print(f"  Profiles audited: {ea.get('total_profiles', 'N/A')}")
    print(f"  Recs audited:     {ea.get('total_recs_audited', 'N/A')}")
    print(f"  Consistency rate: {ea.get('consistency_rate', 'N/A')}")
    print(f"  Guarantee:        {ea.get('guarantee', '')}")

    print(f"\n{'═' * 60}\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset",      default="ml-latest-small",
                        choices=["ml-latest-small", "ml-32m"])
    parser.add_argument("--test-frac",    type=float, default=0.15,
                        help="Fraction of each user's ratings held out for test")
    parser.add_argument("--k",            type=int, nargs="+", default=[5, 10, 20],
                        help="K values for ranking metrics")
    parser.add_argument("--sample-users", type=int, default=200,
                        help="Users to sample for ranking/coverage (speed vs. accuracy)")
    parser.add_argument("--no-ranking",   action="store_true",
                        help="Skip ranking metrics (slow for large datasets)")
    args = parser.parse_args()

    os.makedirs(PROC_DIR, exist_ok=True)

    # Load
    ratings, movies, tags = load_data(args.dataset)
    algo                  = load_model()
    all_movie_ids         = ratings["movieId"].unique().tolist()

    # Split
    print(f"[split] temporal split  test_frac={args.test_frac}")
    train, test = temporal_split(ratings, args.test_frac)
    print(f"  train={len(train):,}  test={len(test):,}")

    # Run evaluations
    report = {
        "generated_at": datetime.now().isoformat(),
        "dataset":      args.dataset,
        "test_frac":    args.test_frac,
        "warm_threshold": WARM_THRESHOLD,
    }

    report["dataset_statistics"]  = compute_dataset_stats(ratings, movies, tags)
    report["accuracy"]            = compute_accuracy(algo, test, train)

    if not args.no_ranking:
        report["ranking"] = compute_ranking(
            algo, test, train, all_movie_ids, args.k, args.sample_users
        )
        report["coverage"] = compute_coverage(
            algo, train, all_movie_ids, args.sample_users
        )
    else:
        report["ranking"]  = {"skipped": True}
        report["coverage"] = {"skipped": True}

    report["cold_start_curve"]      = compute_cold_start_curve(algo, ratings)
    report["explainability_audit"]  = compute_explainability_audit(PUBLIC_DIR)

    # Save
    out_path = os.path.join(PROC_DIR, "evaluation_report.json")
    with open(out_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\n[saved] {out_path}")

    # Print
    print_report(report)


if __name__ == "__main__":
    main()