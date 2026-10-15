from collections.abc import Generator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from .db import Base, SessionLocal, engine
from .models import (
    BibleBook,
    BibleChapter,
    BibleVerse,
    CrossReference,
    SourceCatalog,
)
from .schemas import (
    BookDetailOut,
    BookOut,
    ChapterOut,
    CrossReferenceInspectorOut,
    CrossReferenceOut,
    GraphEdgeOut,
    GraphNodeOut,
    StatsOut,
    VerseGraphOut,
    VerseOut,
    VerseRefOut,
    VerseTextOut,
)
from .seed_data import seed_bible_skeleton
from .verse_text import fetch_live_verse_text


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        seed_bible_skeleton(session)
    yield


app = FastAPI(
    title="Bible Universe API",
    version="0.3.4",
    description="Local-first API for the Scripture Knowledge Graph.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def verse_ref(verse: BibleVerse) -> VerseRefOut:
    return VerseRefOut(
        id=verse.id,
        reference=verse.source_reference or f"Vers {verse.id}",
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "bible-universe-api"}


@app.get("/")
def root() -> dict[str, str]:
    return {
        "name": "Bible Universe API",
        "stage": "S2 NWT Cross-Reference Foundation",
        "message": "Verse coordinates and verified-source graph structures are ready.",
    }


@app.get("/api/stats", response_model=StatsOut)
def stats(db: Session = Depends(get_db)) -> StatsOut:
    book_count = db.scalar(select(func.count(BibleBook.id))) or 0
    chapter_count = db.scalar(select(func.count(BibleChapter.id))) or 0
    verse_count = db.scalar(select(func.count(BibleVerse.id))) or 0
    cross_reference_count = db.scalar(select(func.count(CrossReference.id))) or 0
    hebrew_count = db.scalar(
        select(func.count(BibleBook.id)).where(BibleBook.scripture_part == "HEBREW")
    ) or 0
    greek_count = db.scalar(
        select(func.count(BibleBook.id)).where(BibleBook.scripture_part == "GREEK")
    ) or 0
    jw_source_ready = (
        db.scalar(
            select(func.count(SourceCatalog.id)).where(
                SourceCatalog.code == "JW_NWT_STUDY_DE"
            )
        )
        or 0
    ) > 0

    return StatsOut(
        books=book_count,
        chapters=chapter_count,
        verses=verse_count,
        cross_references=cross_reference_count,
        hebrew_books=hebrew_count,
        greek_books=greek_count,
        verse_structure_ready=verse_count == 31102,
        jw_source_ready=jw_source_ready,
    )


@app.get("/api/books", response_model=list[BookOut])
def list_books(
    scripture_part: str | None = Query(default=None, pattern="^(HEBREW|GREEK)$"),
    db: Session = Depends(get_db),
) -> list[BibleBook]:
    statement = select(BibleBook).order_by(BibleBook.canonical_order)
    if scripture_part:
        statement = statement.where(BibleBook.scripture_part == scripture_part)
    return list(db.scalars(statement).all())


@app.get("/api/books/{book_id}", response_model=BookDetailOut)
def get_book(book_id: int, db: Session = Depends(get_db)) -> BibleBook:
    statement = (
        select(BibleBook)
        .options(selectinload(BibleBook.chapters))
        .where(BibleBook.id == book_id)
    )
    book = db.scalar(statement)
    if book is None:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


@app.get("/api/books/{book_id}/chapters", response_model=list[ChapterOut])
def list_book_chapters(book_id: int, db: Session = Depends(get_db)) -> list[BibleChapter]:
    book_exists = db.scalar(select(BibleBook.id).where(BibleBook.id == book_id))
    if book_exists is None:
        raise HTTPException(status_code=404, detail="Book not found")

    statement = (
        select(BibleChapter)
        .where(BibleChapter.book_id == book_id)
        .order_by(BibleChapter.chapter_number)
    )
    return list(db.scalars(statement).all())


@app.get("/api/books/{book_id}/chapters/{chapter_number}", response_model=ChapterOut)
def get_chapter(book_id: int, chapter_number: int, db: Session = Depends(get_db)) -> BibleChapter:
    statement = select(BibleChapter).where(
        BibleChapter.book_id == book_id,
        BibleChapter.chapter_number == chapter_number,
    )
    chapter = db.scalar(statement)
    if chapter is None:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return chapter


@app.get(
    "/api/books/{book_id}/chapters/{chapter_number}/verses",
    response_model=list[VerseOut],
)
def list_chapter_verses(
    book_id: int,
    chapter_number: int,
    db: Session = Depends(get_db),
) -> list[BibleVerse]:
    chapter = db.scalar(
        select(BibleChapter).where(
            BibleChapter.book_id == book_id,
            BibleChapter.chapter_number == chapter_number,
        )
    )
    if chapter is None:
        raise HTTPException(status_code=404, detail="Chapter not found")

    statement = (
        select(BibleVerse)
        .where(BibleVerse.chapter_id == chapter.id)
        .order_by(BibleVerse.verse_number)
    )
    return list(db.scalars(statement).all())


@app.get("/api/verses/{verse_id}", response_model=VerseOut)
def get_verse(verse_id: int, db: Session = Depends(get_db)) -> BibleVerse:
    verse = db.get(BibleVerse, verse_id)
    if verse is None:
        raise HTTPException(status_code=404, detail="Verse not found")
    return verse


@app.get("/api/verses/{verse_id}/text", response_model=VerseTextOut)
def get_live_verse_text(verse_id: int, db: Session = Depends(get_db)) -> VerseTextOut:
    verse = db.get(BibleVerse, verse_id)
    if verse is None:
        raise HTTPException(status_code=404, detail="Verse not found")

    chapter = db.get(BibleChapter, verse.chapter_id)
    if chapter is None:
        raise HTTPException(status_code=404, detail="Chapter not found")

    try:
        live = fetch_live_verse_text(chapter.book_id, chapter.chapter_number, verse.verse_number)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Official NWT verse text unavailable: {exc}") from exc

    return VerseTextOut(
        verse_id=verse.id,
        reference=verse.source_reference or f"Vers {verse.id}",
        text=live.text,
        source_url=live.source_url,
    )


@app.get("/api/cross-references", response_model=list[CrossReferenceOut])
def list_cross_references(
    verse_id: int | None = None,
    native_category: str | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    db: Session = Depends(get_db),
) -> list[CrossReference]:
    statement = select(CrossReference).order_by(CrossReference.id).limit(limit)
    if verse_id is not None:
        statement = statement.where(
            or_(
                CrossReference.source_verse_id == verse_id,
                CrossReference.target_start_verse_id == verse_id,
                CrossReference.target_end_verse_id == verse_id,
            )
        )
    if native_category:
        statement = statement.where(CrossReference.native_category == native_category)
    return list(db.scalars(statement).all())


@app.get(
    "/api/verses/{verse_id}/cross-references",
    response_model=list[CrossReferenceInspectorOut],
)
def inspect_verse_cross_references(
    verse_id: int,
    direction: str = Query(default="all", pattern="^(all|outgoing|incoming)$"),
    db: Session = Depends(get_db),
) -> list[CrossReferenceInspectorOut]:
    focus = db.get(BibleVerse, verse_id)
    if focus is None:
        raise HTTPException(status_code=404, detail="Verse not found")

    statement = select(CrossReference).order_by(CrossReference.id)
    if direction == "outgoing":
        statement = statement.where(CrossReference.source_verse_id == verse_id)
    elif direction == "incoming":
        statement = statement.where(
            or_(
                CrossReference.target_start_verse_id == verse_id,
                CrossReference.target_end_verse_id == verse_id,
            )
        )
    else:
        statement = statement.where(
            or_(
                CrossReference.source_verse_id == verse_id,
                CrossReference.target_start_verse_id == verse_id,
                CrossReference.target_end_verse_id == verse_id,
            )
        )

    rows = list(db.scalars(statement).all())
    result: list[CrossReferenceInspectorOut] = []
    for row in rows:
        source = db.get(BibleVerse, row.source_verse_id)
        target_start = db.get(BibleVerse, row.target_start_verse_id)
        target_end = db.get(BibleVerse, row.target_end_verse_id) if row.target_end_verse_id else None
        if source is None or target_start is None:
            continue
        result.append(
            CrossReferenceInspectorOut(
                id=row.id,
                source=verse_ref(source),
                target_start=verse_ref(target_start),
                target_end=verse_ref(target_end) if target_end else None,
                native_category=row.native_category,
                relation_type=row.relation_type,
                provenance_level=row.provenance_level,
                confidence=row.confidence,
                source_url=row.source_url,
            )
        )
    return result


@app.get("/api/graph/verse/{verse_id}", response_model=VerseGraphOut)
def get_verse_graph(
    verse_id: int,
    db: Session = Depends(get_db),
) -> VerseGraphOut:
    focus = db.get(BibleVerse, verse_id)
    if focus is None:
        raise HTTPException(status_code=404, detail="Verse not found")

    incident_rows = list(
        db.scalars(
            select(CrossReference)
            .where(
                or_(
                    CrossReference.source_verse_id == verse_id,
                    CrossReference.target_start_verse_id == verse_id,
                    CrossReference.target_end_verse_id == verse_id,
                )
            )
            .order_by(CrossReference.id)
        ).all()
    )

    visible_ids: set[int] = {verse_id}
    for row in incident_rows:
        visible_ids.add(row.source_verse_id)
        visible_ids.add(row.target_start_verse_id)

    neighborhood_rows = list(
        db.scalars(
            select(CrossReference)
            .where(
                CrossReference.source_verse_id.in_(visible_ids),
                CrossReference.target_start_verse_id.in_(visible_ids),
            )
            .order_by(CrossReference.id)
        ).all()
    )

    nodes_by_id: dict[int, GraphNodeOut] = {}
    for visible_id in sorted(visible_ids):
        verse = db.get(BibleVerse, visible_id)
        if verse is None:
            continue
        nodes_by_id[verse.id] = GraphNodeOut(
            id=f"verse:{verse.id}",
            verse_id=verse.id,
            label=verse.source_reference or f"Vers {verse.id}",
            role="focus" if verse.id == verse_id else "connected",
        )

    grouped: dict[tuple[int, int], list[CrossReference]] = {}
    for row in neighborhood_rows:
        pair = tuple(sorted((row.source_verse_id, row.target_start_verse_id)))
        grouped.setdefault(pair, []).append(row)

    edges: list[GraphEdgeOut] = []
    for (left_id, right_id), evidence in grouped.items():
        first = evidence[0]
        directions = {(row.source_verse_id, row.target_start_verse_id) for row in evidence}
        bidirectional = (left_id, right_id) in directions and (right_id, left_id) in directions
        categories = {row.native_category for row in evidence}
        relation_types = sorted({row.relation_type for row in evidence if row.relation_type is not None})
        has_direct_reference = any(
            row.relation_type is None and row.provenance_level == "VERIFIED"
            for row in evidence
        )

        source_id = first.source_verse_id
        target_id = first.target_start_verse_id

        edges.append(
            GraphEdgeOut(
                id=f"xpair:{left_id}:{right_id}",
                source=f"verse:{source_id}",
                target=f"verse:{target_id}",
                cross_reference_id=first.id,
                cross_reference_ids=[row.id for row in evidence],
                native_category=next(iter(categories)) if len(categories) == 1 else "MULTIPLE",
                relation_type=relation_types[0] if len(relation_types) == 1 else None,
                relation_types=relation_types,
                has_direct_reference=has_direct_reference,
                provenance_level=(
                    "VERIFIED"
                    if all(row.provenance_level == "VERIFIED" for row in evidence)
                    else "MIXED"
                    if len({row.provenance_level for row in evidence}) > 1
                    else first.provenance_level
                ),
                confidence=max(row.confidence for row in evidence),
                evidence_count=len(evidence),
                bidirectional=bidirectional,
            )
        )

    return VerseGraphOut(
        focus=verse_ref(focus),
        nodes=list(nodes_by_id.values()),
        edges=edges,
    )
