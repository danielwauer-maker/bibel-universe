from __future__ import annotations

import argparse

from sqlalchemy import select

from .db import Base, SessionLocal, engine
from .models import BibleChapter, BibleVerse, CrossReference, SourceCatalog
from .seed_data import seed_bible_skeleton


SOURCE_CODE = "BIBLE_UNIVERSE_CURATED_V1"
SOURCE_ID = 2

# First curated semantic cluster: the transfiguration of Jesus.
# These ranges are the three Synoptic parallel accounts of the same event.
PASSAGES = [
    {
        "label": "Mat 17:1-9",
        "book_id": 40,
        "chapter": 17,
        "start": 1,
        "end": 9,
        "anchor": 1,
        "source_url": "https://wol.jw.org/de/wol/b/r10/lp-x/nwtsty/40/17",
    },
    {
        "label": "Mar 9:2-9",
        "book_id": 41,
        "chapter": 9,
        "start": 2,
        "end": 9,
        "anchor": 2,
        "source_url": "https://wol.jw.org/de/wol/b/r10/lp-x/nwtsty/41/9",
    },
    {
        "label": "Luk 9:28-36",
        "book_id": 42,
        "chapter": 9,
        "start": 28,
        "end": 36,
        "anchor": 28,
        "source_url": "https://wol.jw.org/de/wol/b/r10/lp-x/nwtsty/42/9",
    },
]


def _ensure_source(session) -> SourceCatalog:
    source = session.scalar(select(SourceCatalog).where(SourceCatalog.code == SOURCE_CODE))
    if source is not None:
        return source

    source = SourceCatalog(
        id=SOURCE_ID,
        code=SOURCE_CODE,
        name="Bible Universe – kuratierte semantische Beziehungen",
        publisher="Bible Universe",
        source_kind="CURATED_SEMANTIC_LAYER",
        base_url="https://wol.jw.org/de/wol/binav/r10/lp-x",
        notes=(
            "Human-curated semantic relationships grounded in the NWT Study Bible. "
            "Used to distinguish direct cross-references from relationships such as "
            "parallel accounts and the same narrated event."
        ),
    )
    session.add(source)
    session.flush()
    return source


def _verse(session, book_id: int, chapter_number: int, verse_number: int) -> BibleVerse:
    chapter = session.scalar(
        select(BibleChapter).where(
            BibleChapter.book_id == book_id,
            BibleChapter.chapter_number == chapter_number,
        )
    )
    if chapter is None:
        raise RuntimeError(f"Chapter not found: {book_id}/{chapter_number}")

    verse = session.scalar(
        select(BibleVerse).where(
            BibleVerse.chapter_id == chapter.id,
            BibleVerse.verse_number == verse_number,
        )
    )
    if verse is None:
        raise RuntimeError(f"Verse not found: {book_id}/{chapter_number}/{verse_number}")
    return verse


def _already_exists(
    session,
    *,
    source_verse_id: int,
    target_start_verse_id: int,
    target_end_verse_id: int | None,
    source_catalog_id: int,
    native_category: str,
) -> bool:
    return session.scalar(
        select(CrossReference.id).where(
            CrossReference.source_verse_id == source_verse_id,
            CrossReference.target_start_verse_id == target_start_verse_id,
            CrossReference.target_end_verse_id == target_end_verse_id,
            CrossReference.source_catalog_id == source_catalog_id,
            CrossReference.native_category == native_category,
        )
    ) is not None


def build_semantic_rows(session, source: SourceCatalog) -> list[CrossReference]:
    anchors: list[tuple[dict, BibleVerse, BibleVerse]] = []
    for passage in PASSAGES:
        start = _verse(session, passage["book_id"], passage["chapter"], passage["anchor"])
        end = _verse(session, passage["book_id"], passage["chapter"], passage["end"])
        anchors.append((passage, start, end))

    rows: list[CrossReference] = []
    for passage_index, passage in enumerate(PASSAGES):
        own_anchor = anchors[passage_index][1]
        own_end = anchors[passage_index][2]

        for verse_number in range(passage["start"], passage["end"] + 1):
            source_verse = _verse(session, passage["book_id"], passage["chapter"], verse_number)

            # Interior verses are tied back to the anchor of their own narrated passage.
            if source_verse.id != own_anchor.id:
                rows.append(
                    CrossReference(
                        source_verse_id=source_verse.id,
                        target_start_verse_id=own_anchor.id,
                        target_end_verse_id=own_end.id,
                        source_catalog_id=source.id,
                        native_category="CURATED_SAME_EVENT",
                        relation_type="SAME_EVENT",
                        provenance_level="CURATED",
                        confidence=1.0,
                        source_url=passage["source_url"],
                        source_anchor="TRANSFIGURATION_OF_JESUS",
                        evidence_note=(
                            f"{source_verse.source_reference} belongs to the same narrated event as "
                            f"the passage {passage['label']}."
                        ),
                    )
                )

            # Every verse in one account is semantically connected to the anchor ranges
            # of the other Synoptic parallel accounts.
            for target_index, (target_passage, target_anchor, target_end) in enumerate(anchors):
                if target_index == passage_index:
                    continue
                rows.append(
                    CrossReference(
                        source_verse_id=source_verse.id,
                        target_start_verse_id=target_anchor.id,
                        target_end_verse_id=target_end.id,
                        source_catalog_id=source.id,
                        native_category="CURATED_PARALLEL_ACCOUNT",
                        relation_type="PARALLEL_ACCOUNT",
                        provenance_level="CURATED",
                        confidence=1.0,
                        source_url=target_passage["source_url"],
                        source_anchor="TRANSFIGURATION_OF_JESUS",
                        evidence_note=(
                            f"{source_verse.source_reference} is part of the transfiguration account; "
                            f"{target_passage['label']} is a parallel account of the same event."
                        ),
                    )
                )

    return rows


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed the first curated semantic Bible Universe cluster: the transfiguration of Jesus."
    )
    parser.add_argument(
        "--commit",
        action="store_true",
        help="Write semantic relationships to PostgreSQL. Without this flag, run as dry-run.",
    )
    args = parser.parse_args()

    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        seed_bible_skeleton(session)
        source = _ensure_source(session)
        candidates = build_semantic_rows(session, source)

        would_import = 0
        skipped = 0
        imported = 0
        relation_counts = {"SAME_EVENT": 0, "PARALLEL_ACCOUNT": 0}

        for row in candidates:
            if _already_exists(
                session,
                source_verse_id=row.source_verse_id,
                target_start_verse_id=row.target_start_verse_id,
                target_end_verse_id=row.target_end_verse_id,
                source_catalog_id=row.source_catalog_id,
                native_category=row.native_category,
            ):
                skipped += 1
                continue

            would_import += 1
            relation_counts[row.relation_type or "SAME_EVENT"] += 1
            if args.commit:
                session.add(row)
                imported += 1

        if args.commit:
            session.commit()
        else:
            session.rollback()

        mode = "COMMIT" if args.commit else "DRY RUN"
        print(
            f"[{mode}] semantic_cluster=TRANSFIGURATION_OF_JESUS "
            f"candidates={len(candidates)} would_import={would_import} "
            f"imported={imported} skipped={skipped}"
        )
        print(
            f"same_event={relation_counts['SAME_EVENT']} "
            f"parallel_account={relation_counts['PARALLEL_ACCOUNT']}"
        )
        print("passages=Mat 17:1-9 | Mar 9:2-9 | Luk 9:28-36")


if __name__ == "__main__":
    main()
