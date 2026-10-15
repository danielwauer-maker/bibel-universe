from pydantic import BaseModel, ConfigDict


class ChapterOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    global_order: int
    book_id: int
    chapter_number: int


class BookOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    canonical_order: int
    slug: str
    name_de: str
    abbreviation: str
    scripture_part: str
    chapter_count: int


class BookDetailOut(BookOut):
    chapters: list[ChapterOut]


class StatsOut(BaseModel):
    books: int
    chapters: int
    verses: int
    hebrew_books: int
    greek_books: int
    verse_structure_ready: bool
