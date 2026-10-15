from pydantic import BaseModel, ConfigDict


class ChapterOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    global_order: int
    book_id: int
    chapter_number: int


class VerseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    chapter_id: int
    verse_number: int
    source_reference: str | None


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


class CrossReferenceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_verse_id: int
    target_start_verse_id: int
    target_end_verse_id: int | None
    native_category: str
    relation_type: str | None
    provenance_level: str
    confidence: float
    source_url: str | None


class VerseRefOut(BaseModel):
    id: int
    reference: str


class CrossReferenceInspectorOut(BaseModel):
    id: int
    source: VerseRefOut
    target_start: VerseRefOut
    target_end: VerseRefOut | None
    native_category: str
    relation_type: str | None
    provenance_level: str
    confidence: float
    source_url: str | None


class GraphNodeOut(BaseModel):
    id: str
    verse_id: int
    label: str
    role: str


class GraphEdgeOut(BaseModel):
    id: str
    source: str
    target: str
    cross_reference_id: int
    native_category: str
    relation_type: str | None
    provenance_level: str
    confidence: float


class VerseGraphOut(BaseModel):
    focus: VerseRefOut
    nodes: list[GraphNodeOut]
    edges: list[GraphEdgeOut]


class StatsOut(BaseModel):
    books: int
    chapters: int
    verses: int
    cross_references: int
    hebrew_books: int
    greek_books: int
    verse_structure_ready: bool
    jw_source_ready: bool
