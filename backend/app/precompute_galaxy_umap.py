from __future__ import annotations

import argparse
import math
import time

import numpy as np
from scipy.sparse import lil_matrix
from sqlalchemy import delete, select
from umap import UMAP

from .db import Base, SessionLocal, engine
from .galaxy import structural_region
from .models import BibleBook, BibleChapter, BibleVerse, CrossReference, GalaxyCoordinate

MODEL_NAME = "relationship-umap-v1"
FEATURE_DIM = 66 + 8 + 8 + 512


def _hashed_feature(key: str, width: int = 512) -> int:
    # Stable FNV-1a style hash; avoids Python's randomized hash seed.
    value = 2166136261
    for byte in key.encode("utf-8"):
        value ^= byte
        value = (value * 16777619) & 0xFFFFFFFF
    return value % width


def build_feature_matrix():
    with SessionLocal() as db:
        books = {book.id: book for book in db.scalars(select(BibleBook)).all()}
        chapters = {chapter.id: chapter for chapter in db.scalars(select(BibleChapter)).all()}
        verses = list(db.scalars(select(BibleVerse).order_by(BibleVerse.id)).all())
        refs = list(db.scalars(select(CrossReference)).all())

    index_by_verse = {int(verse.id): index for index, verse in enumerate(verses)}
    matrix = lil_matrix((len(verses), FEATURE_DIM), dtype=np.float32)

    book_offset = 0
    region_offset = 66
    scalar_offset = 74
    hash_offset = 82

    for row, verse in enumerate(verses):
        chapter = chapters[verse.chapter_id]
        book = books[chapter.book_id]
        book_index = max(0, min(65, book.canonical_order - 1))
        region = structural_region(book.canonical_order)

        matrix[row, book_offset + book_index] = 1.0
        matrix[row, region_offset + region] = 0.72

        chapter_progress = chapter.chapter_number / max(book.chapter_count, 1)
        verse_progress = min(1.0, verse.verse_number / 60.0)
        canonical_progress = (book.canonical_order - 1) / 65.0

        # Smooth structural anchors: enough to keep the Bible coherent, but weak
        # enough that relationship features can pull connected verses together.
        matrix[row, scalar_offset + 0] = canonical_progress * 0.28
        matrix[row, scalar_offset + 1] = chapter_progress * 0.24
        matrix[row, scalar_offset + 2] = verse_progress * 0.08
        matrix[row, scalar_offset + 3] = math.sin(canonical_progress * math.tau) * 0.18
        matrix[row, scalar_offset + 4] = math.cos(canonical_progress * math.tau) * 0.18
        matrix[row, scalar_offset + 5] = math.sin(chapter_progress * math.tau) * 0.12
        matrix[row, scalar_offset + 6] = math.cos(chapter_progress * math.tau) * 0.12
        matrix[row, scalar_offset + 7] = 0.06

    for ref in refs:
        source_row = index_by_verse.get(int(ref.source_verse_id))
        target_row = index_by_verse.get(int(ref.target_start_verse_id))
        if source_row is None or target_row is None:
            continue

        source_verse = verses[source_row]
        target_verse = verses[target_row]
        source_book = books[chapters[source_verse.chapter_id].book_id]
        target_book = books[chapters[target_verse.chapter_id].book_id]
        relation = ref.relation_type or ("DIRECT" if ref.provenance_level == "VERIFIED" else "RELATED")
        weight = 1.35 if ref.provenance_level == "VERIFIED" else 1.05
        if relation == "PARALLEL_ACCOUNT":
            weight = 1.6
        elif relation == "SAME_EVENT":
            weight = 1.45

        # Shared hashed relation signatures create an embedding space from the graph
        # without storing or copying Bible text. Both ends receive the same signature.
        signatures = (
            f"rel:{relation}",
            f"pair:{min(source_book.canonical_order, target_book.canonical_order)}:{max(source_book.canonical_order, target_book.canonical_order)}",
            f"target-book:{target_book.canonical_order}",
            f"source-book:{source_book.canonical_order}",
        )
        for signature in signatures:
            col = hash_offset + _hashed_feature(signature)
            matrix[source_row, col] += weight
            matrix[target_row, col] += weight

    return verses, matrix.tocsr()


def normalize_coords(coords: np.ndarray) -> np.ndarray:
    centered = coords - np.median(coords, axis=0, keepdims=True)
    span = np.percentile(np.abs(centered), 97, axis=0)
    span[span < 1e-6] = 1.0
    normalized = centered / span
    # Galaxy coordinates roughly span +/- 9 units while preserving UMAP geometry.
    return normalized * np.array([8.8, 7.0, 5.8], dtype=np.float32)


def run(commit: bool, force: bool) -> None:
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        existing = db.scalars(
            select(GalaxyCoordinate).where(GalaxyCoordinate.model_name == MODEL_NAME)
        ).all()
        if existing and not force:
            print(f"{MODEL_NAME}: {len(existing)} coordinates already exist. Use --force to recompute.")
            return

    started = time.perf_counter()
    verses, features = build_feature_matrix()
    print(f"Feature matrix: {features.shape[0]} verses x {features.shape[1]} features; nnz={features.nnz}")
    print("Running UMAP: n_components=3, n_neighbors=30, min_dist=0.08, metric=cosine ...")

    reducer = UMAP(
        n_components=3,
        n_neighbors=30,
        min_dist=0.08,
        metric="cosine",
        random_state=42,
        low_memory=True,
        verbose=True,
    )
    coords = normalize_coords(reducer.fit_transform(features).astype(np.float32))
    elapsed = time.perf_counter() - started

    print(
        f"UMAP complete in {elapsed:.1f}s; x=[{coords[:,0].min():.2f},{coords[:,0].max():.2f}] "
        f"y=[{coords[:,1].min():.2f},{coords[:,1].max():.2f}] z=[{coords[:,2].min():.2f},{coords[:,2].max():.2f}]"
    )

    if not commit:
        print(f"[DRY RUN] would store {len(verses)} coordinates as {MODEL_NAME}")
        return

    with SessionLocal() as db:
        if force:
            db.execute(delete(GalaxyCoordinate).where(GalaxyCoordinate.model_name == MODEL_NAME))
        rows = [
            GalaxyCoordinate(
                verse_id=int(verse.id),
                model_name=MODEL_NAME,
                x=float(coords[index, 0]),
                y=float(coords[index, 1]),
                z=float(coords[index, 2]),
                source_kind="RELATIONSHIP_UMAP",
            )
            for index, verse in enumerate(verses)
        ]
        db.add_all(rows)
        db.commit()

    print(f"[COMMIT] stored {len(verses)} coordinates as {MODEL_NAME}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Precompute relationship-aware 3D UMAP coordinates for the Bible galaxy.")
    parser.add_argument("--commit", action="store_true", help="Persist computed coordinates")
    parser.add_argument("--force", action="store_true", help="Replace an existing model projection")
    args = parser.parse_args()
    run(commit=args.commit, force=args.force)


if __name__ == "__main__":
    main()
