from collections.abc import Generator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from .db import Base, SessionLocal, engine
from .models import BibleBook, BibleChapter, BibleVerse
from .schemas import BookDetailOut, BookOut, ChapterOut, StatsOut
from .seed_data import seed_bible_skeleton


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        seed_bible_skeleton(session)
    yield


app = FastAPI(
    title="Bible Universe API",
    version="0.2.0",
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
        "stage": "S1 Bible Skeleton",
        "message": "Canonical Bible structure is available through /api endpoints.",
    }


@app.get("/api/stats", response_model=StatsOut)
def stats(db: Session = Depends(get_db)) -> StatsOut:
    book_count = db.scalar(select(func.count(BibleBook.id))) or 0
    chapter_count = db.scalar(select(func.count(BibleChapter.id))) or 0
    verse_count = db.scalar(select(func.count(BibleVerse.id))) or 0
    hebrew_count = db.scalar(
        select(func.count(BibleBook.id)).where(BibleBook.scripture_part == "HEBREW")
    ) or 0
    greek_count = db.scalar(
        select(func.count(BibleBook.id)).where(BibleBook.scripture_part == "GREEK")
    ) or 0

    return StatsOut(
        books=book_count,
        chapters=chapter_count,
        verses=verse_count,
        hebrew_books=hebrew_count,
        greek_books=greek_count,
        verse_structure_ready=True,
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
