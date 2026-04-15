#!/usr/bin/env python3
"""
03_train_svd.py — Train an SVD collaborative filtering model using only
numpy and pandas. No scikit-surprise, no C compiler needed.

Implements Funk SVD (matrix factorization via SGD), the same algorithm
used in the original Netflix Prize solution.

Outputs:
  data/processed/model.pkl            — trained SVD model
  data/processed/trainset_mappings.pkl — user/item id mappings
"""

import os
import pickle
import argparse
import numpy as np
import pandas as pd

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT       = os.path.join(SCRIPT_DIR, "..")
DATA_DIR   = os.path.join(ROOT, "data")
OUT_DIR    = os.path.join(DATA_DIR, "processed")


class FunkSVD:
    """
    Funk SVD matrix factorization.
    Predicts r_ui = mu + b_u + b_i + p_u · q_i
    where mu=global mean, b_u=user bias, b_i=item bias,
    p_u=user factors, q_i=item factors.
    """

    def __init__(self, n_factors=50, n_epochs=20, lr=0.005, reg=0.02,
                 random_state=42):
        self.n_factors    = n_factors
        self.n_epochs     = n_epochs
        self.lr           = lr
        self.reg          = reg
        self.random_state = random_state

    def fit(self, ratings_df: pd.DataFrame):
        rng = np.random.default_rng(self.random_state)

        uids = ratings_df["userId"].unique()
        iids = ratings_df["movieId"].unique()
        self.user2idx = {u: i for i, u in enumerate(uids)}
        self.item2idx = {m: i for i, m in enumerate(iids)}
        self.idx2user = {i: u for u, i in self.user2idx.items()}
        self.idx2item = {i: m for m, i in self.item2idx.items()}

        n_users = len(uids)
        n_items = len(iids)

        self.global_mean = float(ratings_df["rating"].mean())
        self.bu = np.zeros(n_users)
        self.bi = np.zeros(n_items)
        self.pu = rng.normal(0, 0.1, (n_users, self.n_factors))
        self.qi = rng.normal(0, 0.1, (n_items, self.n_factors))

        u_arr = ratings_df["userId"].map(self.user2idx).values.astype(np.int32)
        i_arr = ratings_df["movieId"].map(self.item2idx).values.astype(np.int32)
        r_arr = ratings_df["rating"].values.astype(np.float32)
        n     = len(r_arr)

        print(f"  users={n_users:,}  items={n_items:,}  ratings={n:,}  "
              f"factors={self.n_factors}  epochs={self.n_epochs}")

        for epoch in range(self.n_epochs):
            idx = rng.permutation(n)
            u_arr, i_arr, r_arr = u_arr[idx], i_arr[idx], r_arr[idx]
            total_loss = 0.0

            for k in range(n):
                u, i, r = u_arr[k], i_arr[k], r_arr[k]
                pred = float(np.clip(
                    self.global_mean + self.bu[u] + self.bi[i]
                    + np.dot(self.pu[u], self.qi[i]), 0.5, 5.0))
                err  = r - pred
                total_loss += err ** 2

                self.bu[u] += self.lr * (err - self.reg * self.bu[u])
                self.bi[i] += self.lr * (err - self.reg * self.bi[i])
                pu_old = self.pu[u].copy()
                self.pu[u] += self.lr * (err * self.qi[i] - self.reg * self.pu[u])
                self.qi[i] += self.lr * (err * pu_old    - self.reg * self.qi[i])

            print(f"  Epoch {epoch + 1:>2}/{self.n_epochs}  RMSE={np.sqrt(total_loss / n):.4f}")

        return self

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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset",   default="ml-latest-small",
                        choices=["ml-latest-small", "ml-32m"])
    parser.add_argument("--n-factors", type=int, default=50)
    parser.add_argument("--n-epochs",  type=int, default=20)
    parser.add_argument("--lr",        type=float, default=0.005)
    parser.add_argument("--reg",       type=float, default=0.02)
    parser.add_argument("--eval",      action="store_true",
                        help="Run quick train/test split evaluation")
    args = parser.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)

    ds_dir  = os.path.join(DATA_DIR, args.dataset)
    dtype   = {"userId": "int32", "movieId": "int32", "rating": "float32"}
    ratings = pd.read_csv(os.path.join(ds_dir, "ratings.csv"), dtype=dtype)
    print(f"[train] {len(ratings):,} ratings  {ratings['userId'].nunique():,} users  "
          f"{ratings['movieId'].nunique():,} movies")

    if args.eval:
        print("[eval] 80/20 train-test split…")
        train = ratings.sample(frac=0.8, random_state=42)
        test  = ratings.drop(train.index)
        m = FunkSVD(n_factors=args.n_factors, n_epochs=args.n_epochs,
                    lr=args.lr, reg=args.reg)
        m.fit(train)
        errs = [m.predict(int(r.userId), int(r.movieId)) - r.rating
                for _, r in test.sample(min(2000, len(test))).iterrows()]
        print(f"  Test RMSE={np.sqrt(np.mean(np.square(errs))):.4f}  "
              f"MAE={np.mean(np.abs(errs)):.4f}")

    print("[train] Fitting on full dataset…")
    model = FunkSVD(n_factors=args.n_factors, n_epochs=args.n_epochs,
                    lr=args.lr, reg=args.reg)
    model.fit(ratings)

    with open(os.path.join(OUT_DIR, "model.pkl"), "wb") as f:
        pickle.dump(model, f)
    print(f"[saved] model.pkl")

    mappings = {
        "user2idx": model.user2idx, "item2idx": model.item2idx,
        "idx2user": model.idx2user, "idx2item": model.idx2item,
        "global_mean": model.global_mean,
        "n_users": len(model.user2idx), "n_items": len(model.item2idx),
    }
    with open(os.path.join(OUT_DIR, "trainset_mappings.pkl"), "wb") as f:
        pickle.dump(mappings, f)
    print(f"[saved] trainset_mappings.pkl")
    print("[done] Training complete.")


if __name__ == "__main__":
    main()