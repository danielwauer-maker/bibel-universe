from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup, Tag
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import BibleBook, BibleChapter, BibleVerse, CrossReference, SourceCatalog

ALLOWED_HOSTS = {"jw.org", "www.jw.org"}

CATEGORY_LABELS = {
    "parallelbericht": "PARALLEL_ACCOUNT",
    "zitat": "QUOTE",
    "allgemein": "GENERAL",
}

CANONICAL_RELATION_MAP = {
    "PARALLEL_ACCOUNT": "PARALLEL_ACCOUNT",
    "QUOTE": "DIRECT_QUOTE",
}

# A few aliases differ between display contexts. Values are normalized aliases
# used by JW.org/WOL and mapped to the abbreviations in our canonical book table.
EXTRA_ALIASES = {
    "1mo": "1Mo",
    "2mo": "2Mo",
    "3mo": "3Mo",
    "4mo": "4Mo",
    "5mo": "5Mo",
    "jos": "Jos",
    "ri": "Ri",
    "ru": "Ru",
    "1sa": "1Sa",
    "2sa": "2Sa",
    "1kö": "1Kö",
    "2kö": "2Kö",
    "1ch": "1Ch",
    "2ch": "2Ch",
    "esr": "Esr",
    "ne": "Ne",
    "est": "Est",
    "hi": "Hi",
    "ps": "Ps",
    "spr": "Spr",
    "pr": "Pr",
    "hoh": "Hoh",
    "jes": "Jes",
    "jer": "Jer",
    "klg": "Klg",
    "hes": "Hes",
    "da": "Da",
    "hos": "Hos",
    "joel": "Joel",
    "am": "Am",
    "ob": "Ob",
    "jon": "Jon",
    "mi": "Mi",
    "nah": "Nah",
    "hab": "Hab",
    "ze": "Ze",
    "hag": "Hag",
    "sach": "Sach",
    "mal": "Mal",
    "mat": "Mat",
    "mar": "Mar",
    "luk": "Luk",
    "joh": "Joh",
    "apg": "Apg",
    "röm": "Röm",
    "1ko": "1Ko",
    "2ko": "2Ko",
    "gal": "Gal",
    "eph": "Eph",
    "php": "Php",
    "kol": "Kol",
    "1th": "1Th",
    "2th": "2Th",
    "1ti": "1Ti",
    "2ti": "2Ti",
    "tit": "Tit",
    "phm": "Phm",
    "heb": "Heb",
    "jak": "Jak",
    "1pe": "1Pe",
    "2pe": "2Pe",
    "1jo": "1Jo",
    "2jo": "2Jo",
    "3jo": "3Jo",
    "jud": "Jud",
    "off": "Off",
    "offb": "Off",
}

SOURCE_LINE_RE = re.compile(
    r"^(?P<book>[1-3]?[A-Za-zÄÖÜäöüß.]+)\s+(?P<chapter>\d+):(?P<verse>\d+)\s+(?P<targets>.+)$"
)
TARGET_WITH_BOOK_RE = re.compile(
    r"^(?P<book>[1-3]?[A-Za-zÄÖÜäöüß.]+)\s+(?P<chapter>\d+):(?P<verses>.+)$"
)
TARGET_SAME_BOOK_RE = re.compile(r"^(?P<chapter>\d+):(?P<verses>.+)$")
VERSE_RANGE_RE = re.compile(r"^(?P<start>\d+)(?:[-–](?P<end>\d+))?$")


@dataclass(frozen=True)
class ParsedTarget:
    book_abbreviation: str
    chapter: int
    verse_start: int
    verse_end: int


@dataclass(frozen=True)
class ParsedCrossReference:
    source_book_abbreviation: str
    source_chapter: int
    source_verse: int
    native_category: str
    target: ParsedTarget


def _normalize_token(value: str) -> str:
    return value.strip().replace(".", "").lower()


def _canonical_abbreviation(value: str) -> str:
    normalized = _normalize_token(value)
    return EXTRA_ALIASES.get(normalized, value.replace(".", "").strip())


def _parse_verse_spec(book: str, chapter: int, value: str) -> list[ParsedTarget]:
    targets: list[ParsedTarget] = []
    for raw_piece in value.split(","):
        piece = raw_piece.strip()
        match = VERSE_RANGE_RE.match(piece)
        if not match:
            continue
        start = int(match.group("start"))
        end = int(match.group("end") or start)
        targets.append(
            ParsedTarget(
                book_abbreviation=book,
                chapter=chapter,
                verse_start=start,
                verse_end=end,
            )
        )
    return targets


def parse_target_list(value: str) -> list[ParsedTarget]:
    results: list[ParsedTarget] = []
    current_book: str | None = None

    for raw_segment in value.split(";"):
        segment = raw_segment.strip().lstrip("+")
        if not segment:
            continue

        match = TARGET_WITH_BOOK_RE.match(segment)
        if match:
            current_book = _canonical_abbreviation(match.group("book"))
            chapter = int(match.group("chapter"))
            results.extend(_parse_verse_spec(current_book, chapter, match.group("verses")))
            continue

        same_book = TARGET_SAME_BOOK_RE.match(segment)
        if same_book and current_book:
            chapter = int(same_book.group("chapter"))
            results.extend(_parse_verse_spec(current_book, chapter, same_book.group("verses")))

    return results


def _heading_level(tag: Tag) -> int:
    return int(tag.name[1])


def _section_text(heading: Tag) -> list[str]:
    level = _heading_level(heading)
    lines: list[str] = []
    sibling = heading.next_sibling

    while sibling is not None:
        if isinstance(sibling, Tag) and re.fullmatch(r"h[1-6]", sibling.name or ""):
            if _heading_level(sibling) <= level:
                break
        if isinstance(sibling, Tag):
            text = sibling.get_text("\n", strip=True)
            if text:
                lines.extend(line.strip() for line in text.splitlines() if line.strip())
        sibling = sibling.next_sibling

    return lines


def parse_cross_references(html: str) -> list[ParsedCrossReference]:
    soup = BeautifulSoup(html, "html.parser")
    parsed: list[ParsedCrossReference] = []
    seen: set[tuple[str, int, int, str, str, int, int, int]] = set()

    for heading in soup.find_all(re.compile(r"^h[1-6]$")):
        label = _normalize_token(heading.get_text(" ", strip=True))
        native_category = CATEGORY_LABELS.get(label)
        if not native_category:
            continue

        for line in _section_text(heading):
            source_match = SOURCE_LINE_RE.match(line)
            if not source_match:
                continue

            source_book = _canonical_abbreviation(source_match.group("book"))
            source_chapter = int(source_match.group("chapter"))
            source_verse = int(source_match.group("verse"))

            for target in parse_target_list(source_match.group("targets")):
                key = (
                    source_book,
                    source_chapter,
                    source_verse,
                    native_category,
                    target.book_abbreviation,
                    target.chapter,
                    target.verse_start,
                    target.verse_end,
                )
                if key in seen:
                    continue
                seen.add(key)
                parsed.append(
                    ParsedCrossReference(
                        source_book_abbreviation=source_book,
                        source_chapter=source_chapter,
                        source_verse=source_verse,
                        native_category=native_category,
                        target=target,
                    )
                )

    return parsed


def fetch_jw_page(url: str) -> str:
    parsed_url = urlparse(url)
    if parsed_url.scheme != "https" or parsed_url.hostname not in ALLOWED_HOSTS:
        raise ValueError("Only HTTPS pages on jw.org are allowed")

    headers = {
        "User-Agent": "BibleUniverseLocalResearch/0.1 (+local educational project)",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.5",
    }
    with httpx.Client(timeout=30.0, follow_redirects=True, headers=headers) as client:
        response = client.get(url)
        response.raise_for_status()
        return response.text


def _book_map(session: Session) -> dict[str, BibleBook]:
    books = list(session.scalars(select(BibleBook)).all())
    result: dict[str, BibleBook] = {}
    for book in books:
        result[_normalize_token(book.abbreviation)] = book
    for alias, canonical in EXTRA_ALIASES.items():
        canonical_book = result.get(_normalize_token(canonical))
        if canonical_book:
            result[alias] = canonical_book
    return result


def _verse_lookup(
    session: Session,
    book_id: int,
    chapter_number: int,
    verse_number: int,
) -> BibleVerse | None:
    statement = (
        select(BibleVerse)
        .join(BibleChapter, BibleVerse.chapter_id == BibleChapter.id)
        .where(
            BibleChapter.book_id == book_id,
            BibleChapter.chapter_number == chapter_number,
            BibleVerse.verse_number == verse_number,
        )
    )
    return session.scalar(statement)


def import_cross_references(
    session: Session,
    url: str,
    *,
    commit: bool = False,
) -> dict[str, int]:
    html = fetch_jw_page(url)
    parsed_rows = parse_cross_references(html)
    books = _book_map(session)
    source_catalog = session.scalar(
        select(SourceCatalog).where(SourceCatalog.code == "JW_NWT_STUDY_DE")
    )
    if source_catalog is None:
        raise RuntimeError("JW_NWT_STUDY_DE source catalog entry is missing")

    imported = 0
    skipped = 0

    for parsed in parsed_rows:
        source_book = books.get(_normalize_token(parsed.source_book_abbreviation))
        target_book = books.get(_normalize_token(parsed.target.book_abbreviation))
        if source_book is None or target_book is None:
            skipped += 1
            continue

        source_verse = _verse_lookup(
            session, source_book.id, parsed.source_chapter, parsed.source_verse
        )
        target_start = _verse_lookup(
            session,
            target_book.id,
            parsed.target.chapter,
            parsed.target.verse_start,
        )
        target_end = _verse_lookup(
            session,
            target_book.id,
            parsed.target.chapter,
            parsed.target.verse_end,
        )

        if source_verse is None or target_start is None or target_end is None:
            skipped += 1
            continue

        target_end_id = target_end.id if target_end.id != target_start.id else None
        existing = session.scalar(
            select(CrossReference.id).where(
                CrossReference.source_verse_id == source_verse.id,
                CrossReference.target_start_verse_id == target_start.id,
                CrossReference.source_catalog_id == source_catalog.id,
                CrossReference.native_category == parsed.native_category,
            )
        )
        if existing is not None:
            skipped += 1
            continue

        session.add(
            CrossReference(
                source_verse_id=source_verse.id,
                target_start_verse_id=target_start.id,
                target_end_verse_id=target_end_id,
                source_catalog_id=source_catalog.id,
                native_category=parsed.native_category,
                relation_type=CANONICAL_RELATION_MAP.get(parsed.native_category),
                provenance_level="VERIFIED",
                confidence=1.0,
                source_url=url,
                source_anchor=f"{source_verse.source_reference}",
            )
        )
        imported += 1

    if commit:
        session.commit()
    else:
        session.rollback()

    return {
        "parsed": len(parsed_rows),
        "imported": imported if commit else 0,
        "would_import": imported,
        "skipped": skipped,
    }
