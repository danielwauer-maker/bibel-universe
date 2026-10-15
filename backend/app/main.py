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
    CrossReferenceOut,
    StatsOut,
    VerseOut,
)
from .seed_data import seed_bible_skeleton


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        seed_bible_skeleton(session)
    yield


app = FastAPI(
    title="Bible Universe API",
    version="0.3.0",
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
