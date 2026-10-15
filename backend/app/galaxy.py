from __future__ import annotations

import math
import struct
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import BibleBook, BibleChapter, BibleVerse, CrossReference


MAGIC = b"BUG1"
VERSION = 1
# Record layout: x, y, z, verse_id, book_id, chapter, verse, degree, region_id (all float32)
RECORD_FLOATS = 9
HEADER = struct.Struct("<4sIII")
RECORD = struct.Struct("<9f")


@dataclass(frozen=True)
class GalaxyRecord:
    x: float
    y: float
    z: float
    verse_id: int
    book_id: int
    chapter: int
    verse: int
    degree: int
    region_id: int


def structural_region(book_order: int) -> int:
    """Temporary visual region used until semantic UMAP/classification is available.

    This intentionally groups by broad canonical/genre-like book ranges only. It is a
    rendering scaffold, not a theological classification.
    """
    if 1 <= book_order <= 5:
        return 2  # Gesetz & Bund
    if 6 <= book_order <= 17:
        return 3  # Geschichte & Königreiche
    if 18 <= book_order <= 22:
        return 1  # Weisheit & Poesie
    if 23 <= book_order <= 39:
        return 5  # Prophezeiung & Gericht
    if 40 <= book_order <= 43:
        return 4  # Jesus & Evangelien
    if book_order == 44:
        return 7  # Versammlung & Mission
    if 45 <= book_order <= 58:
        return 6  # Glaube & Praxis
    if 59 <= book_order <= 66:
        return 7  # Versammlung & Mission
    return 0


def _noise(seed: int) -> float:
    # Fast deterministic pseudo-random value in [-1, 1].
    x = math.sin(seed * 12.9898 + 78.233) * 43758.5453
    return (x - math.floor(x)) * 2.0 - 1.0


def build_galaxy_binary(db: Session) -> bytes:
    books = {book.id: book for book in db.scalars(select(BibleBook)).all()}
    chapters = {chapter.id: chapter for chapter in db.scalars(select(BibleChapter)).all()}
    verses = list(db.scalars(select(BibleVerse).order_by(BibleVerse.id)).all())

    degree_rows = db.execute(
        select(CrossReference.source_verse_id, func.count(CrossReference.id))
        .group_by(CrossReference.source_verse_id)
    ).all()
    degree_rows_in = db.execute(
        select(CrossReference.target_start_verse_id, func.count(CrossReference.id))
        .group_by(CrossReference.target_start_verse_id)
    ).all()
    degree: dict[int, int] = {}
    for verse_id, count in [*degree_rows, *degree_rows_in]:
        degree[int(verse_id)] = degree.get(int(verse_id), 0) + int(count)

    payload = bytearray(HEADER.pack(MAGIC, VERSION, RECORD_FLOATS, len(verses)))

    for verse in verses:
        chapter = chapters[verse.chapter_id]
        book = books[chapter.book_id]
        order = book.canonical_order
        region = structural_region(order)

        # Stable book-level center on a flattened 3D spiral. This is deliberately
        # deterministic so the camera/journey position remains stable between loads.
        t = (order - 1) / 65.0
        angle = t * math.tau * 2.15
        radius = 4.2 + 5.6 * t
        center_x = math.cos(angle) * radius
        center_y = math.sin(angle) * radius * 0.72
        center_z = math.sin(angle * 0.67) * 2.8

        # Verse-level local cloud. Chapter progression introduces a gentle arc inside
        # each book; deterministic noise prevents grid-like appearance.
        chapter_phase = chapter.chapter_number / max(book.chapter_count, 1)
        local_angle = chapter_phase * math.tau + verse.verse_number * 0.095
        local_radius = 0.45 + chapter_phase * 1.15
        seed = int(verse.id)
        x = center_x + math.cos(local_angle) * local_radius + _noise(seed) * 0.34
        y = center_y + math.sin(local_angle) * local_radius * 0.72 + _noise(seed + 17) * 0.32
        z = center_z + _noise(seed + 31) * 1.25 + math.sin(local_angle * 0.5) * 0.35

        payload.extend(
            RECORD.pack(
                float(x),
                float(y),
                float(z),
                float(verse.id),
                float(book.id),
                float(chapter.chapter_number),
                float(verse.verse_number),
                float(min(degree.get(int(verse.id), 0), 999)),
                float(region),
            )
        )

    return bytes(payload)
