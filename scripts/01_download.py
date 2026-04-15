#!/usr/bin/env python3
"""
01_download.py — Download MovieLens datasets from GroupLens.
Downloads ml-latest-small by default; pass --full for ml-32m.
"""

import os
import sys
import urllib.request
import zipfile
import argparse

SMALL_URL = "https://files.grouplens.org/datasets/movielens/ml-latest-small.zip"
# FULL_URL  = "https://files.grouplens.org/datasets/movielens/ml-32m.zip"

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


def download_with_progress(url: str, dest: str):
    def reporthook(count, block_size, total_size):
        if total_size > 0:
            pct = count * block_size * 100 // total_size
            sys.stdout.write(f"\r  Downloading... {pct}%")
            sys.stdout.flush()

    urllib.request.urlretrieve(url, dest, reporthook)
    print()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--full", action="store_true",
                        help="Download ml-32m instead of ml-latest-small")
    args = parser.parse_args()

    os.makedirs(DATA_DIR, exist_ok=True)

    url     = FULL_URL if args.full else SMALL_URL
    fname   = "ml-32m.zip" if args.full else "ml-latest-small.zip"
    outdir  = "ml-32m"    if args.full else "ml-latest-small"
    dest    = os.path.join(DATA_DIR, fname)
    outpath = os.path.join(DATA_DIR, outdir)

    if os.path.exists(outpath):
        print(f"[skip] {outdir} already exists at {outpath}")
        return

    print(f"[download] {url}")
    download_with_progress(url, dest)

    print(f"[extract] {dest}")
    with zipfile.ZipFile(dest, "r") as z:
        z.extractall(DATA_DIR)

    os.remove(dest)
    print(f"[done] Dataset extracted to {outpath}")
    print("  Files:", os.listdir(outpath))


if __name__ == "__main__":
    main()
