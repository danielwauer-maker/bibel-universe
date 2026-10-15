from __future__ import annotations

from sqlalchemy import BigInteger, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class BibleBook(Base):
    __tablename__ = "bible_books"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    canonical_order: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name_de: Mapped[str] = mapped_column(String(80))
    abbreviation: Mapped[str] = mapped_column(String(16))
    scripture_part: Mapped[str] = mapped_column(String(16), index=True)
    chapter_count: Mapped[int] = mapped_column(Integer)

    chapters: Mapped[list["BibleChapter"]] = relationship(
        back_populates="book",
        cascade="all, delete-orphan",
        order_by="BibleChapter.chapter_number",
    )


class BibleChapter(Base):
    __tablename__ = "bible_chapters"
    __table_args__ = (
        UniqueConstraint("book_id", "chapter_number", name="uq_bible_chapter_book_number"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    global_order: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    book_id: Mapped[int] = mapped_column(ForeignKey("bible_books.id", ondelete="CASCADE"), index=True)
    chapter_number: Mapped[int] = mapped_column(Integer)

    book: Mapped[BibleBook] = relationship(back_populates="chapters")
    verses: Mapped[list["BibleVerse"]] = relationship(
        back_populates="chapter",
        cascade="all, delete-orphan",
        order_by="BibleVerse.verse_number",
    )


class BibleVerse(Base):
    __tablename__ = "bible_verses"
    __table_args__ = (
        UniqueConstraint("chapter_id", "verse_number", name="uq_bible_verse_chapter_number"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    chapter_id: Mapped[int] = mapped_column(ForeignKey("bible_chapters.id", ondelete="CASCADE"), index=True)
    verse_number: Mapped[int] = mapped_column(Integer)
    source_reference: Mapped[str | None] = mapped_column(String(160), nullable=True)
    text_content: Mapped[str | None] = mapped_column(Text, nullable=True)

    chapter: Mapped[BibleChapter] = relationship(back_populates="verses")
