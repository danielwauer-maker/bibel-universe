from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from urllib.parse import unquote, urlparse

import httpx
from bs4 import BeautifulSoup, Tag
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import BibleBook, BibleChapter, BibleVerse, CrossReference, SourceCatalog

ALLOWED_HOSTS = {"jw.org", "www.jw.org", "wol.jw.org"}

CATEGORY_LABELS = {
    "parallelbericht": "PARALLEL_ACCOUNT",
    "zitat": "QUOTE",
    "allgemein": "GENERAL",
}

CANONICAL_RELATION_MAP = {
    "PARALLEL_ACCOUNT": "PARALLEL_ACCOUNT",
    "QUOTE": "DIRECT_QUOTE",
}

EXTRA_ALIASES = {
    "1mo": "1Mo", "2mo": "2Mo", "3mo": "3Mo", "4mo": "4Mo", "5mo": "5Mo",
    "jos": "Jos", "ri": "Ri", "ru": "Ru", "1sa": "1Sa", "2sa": "2Sa",
    "1kö": "1Kö", "2kö": "2Kö", "1ch": "1Ch", "2ch": "2Ch", "esr": "Esr",
    "ne": "Ne", "est": "Est", "hi": "Hi", "ps": "Ps", "spr": "Spr", "pr": "Pr",
    "hoh": "Hoh", "jes": "Jes", "jer": "Jer", "klg": "Klg", "hes": "Hes",
    "da": "Da", "hos": "Hos", "joel": "Joel", "am": "Am", "ob": "Ob", "jon": "Jon",
    "mi": "Mi", "nah": "Nah", "hab": "Hab", "ze": "Ze", "hag": "Hag", "sach": "Sach",
    "mal": "Mal", "mat": "Mat", "mar": "Mar", "luk": "Luk", "joh": "Joh", "apg": "Apg",
    "röm": "Röm", "1ko": "1Ko", "2ko": "2Ko", "gal": "Gal", "eph": "Eph", "php": "Php",
    "kol": "Kol", "1th": "1Th", "2th": "2Th", "1ti": "1Ti", "2ti": "2Ti", "tit": "Tit",
    "phm": "Phm", "heb": "Heb", "jak": "Jak", "1pe": "1Pe", "2pe": "2Pe", "1jo": "1Jo",
    "2jo": "2Jo", "3jo": "3Jo", "jud": "Jud", "off": "Off", "offb": "Off",
}

# JW.org's public Study Bible chapter pages are client-heavy. The official WOL mirror exposes
# the same Study Bible cross-reference tables in server-rendered HTML, which is much more stable
# for a local research importer. These aliases let us derive the official WOL URL from a JW.org URL.
JW_BOOK_SLUG_TO_NUMBER = {
    "1-mose": 1, "2-mose": 2, "3-mose": 3, "4-mose": 4, "5-mose": 5,
    "josua": 6, "richter": 7, "ruth": 8, "1-samuel": 9, "2-samuel": 10,
    "1-konige": 11, "2-konige": 12, "1-chronika": 13, "2-chronika": 14,
    "esra": 15, "nehemia": 16, "esther": 17, "hiob": 18, "psalmen": 19,
    "spruche": 20, "prediger": 21, "hohes-lied": 22, "jesaja": 23, "jeremia": 24,
    "klagelieder": 25, "hesekiel": 26, "daniel": 27, "hosea": 28, "joel": 29,
    "amos": 30, "obadja": 31, "jona": 32, "micha": 33, "nahum": 34, "habakuk": 35,
    "zephanja": 36, "haggai": 37, "sacharja": 38, "maleachi": 39, "matthaus": 40,
    "markus": 41, "lukas": 42, "johannes": 43, "apostelgeschichte": 44, "romer": 45,
    "1-korinther": 46, "2-korinther": 47, "galater": 48, "epheser": 49, "philipper": 50,
    "kolosser": 51, "1-thessalonicher": 52, "2-thessalonicher": 53, "1-timotheus": 54,
    "2-timotheus": 55, "titus": 56, "philemon": 57, "hebraer": 58, "jakobus": 59,
    "1-petrus": 60, "2-petrus": 61, "1-johannes": 62, "2-johannes": 63,
    "3-johannes": 64, "judas": 65, "offenbarung": 66,
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


def _ascii_slug(value: str) -> str:
    value = unquote(value).strip().lower().replace("_", "-")
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.replace("ä", "a").replace("ö", "o").replace("ü", "u").replace("ß", "ss")
    return re.sub(r"[^a-z0-9-]+", "", value)


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
        targets.append(ParsedTarget(book, chapter, start, end))
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


def _parse_section_lines(lines: list[str], native_category: str, parsed: list[ParsedCrossReference], seen: set) -> None:
    for line in lines:
        # WOL occasionally renders a reference marker letter between source and target (e.g. "Mat. 17:5 a ...").
        line = re.sub(r"^(\S+\s+\d+:\d+)\s+[a-z]\s+", r"\1 ", line, flags=re.IGNORECASE)
        source_match = SOURCE_LINE_RE.match(line)
        if not source_match:
            continue
        source_book = _canonical_abbreviation(source_match.group("book"))
        source_chapter = int(source_match.group("chapter"))
        source_verse = int(source_match.group("verse"))
        for target in parse_target_list(source_match.group("targets")):
            key = (source_book, source_chapter, source_verse, native_category,
                   target.book_abbreviation, target.chapter, target.verse_start, target.verse_end)
            if key in seen:
                continue
            seen.add(key)
            parsed.append(ParsedCrossReference(source_book, source_chapter, source_verse, native_category, target))


def parse_cross_references(html: str) -> list[ParsedCrossReference]:
    soup = BeautifulSoup(html, "html.parser")
    parsed: list[ParsedCrossReference] = []
    seen: set[tuple[str, int, int, str, str, int, int, int]] = set()

    for heading in soup.find_all(re.compile(r"^h[1-6]$")):
        label = _normalize_token(heading.get_text(" ", strip=True))
        native_category = CATEGORY_LABELS.get(label)
        if native_category:
            _parse_section_lines(_section_text(heading), native_category, parsed, seen)

    # Fallback for server-rendered pages where category headings and rows are not siblings.
    if not parsed:
        strings = [s.strip() for s in soup.stripped_strings if s.strip()]
        current_category: str | None = None
        collected: list[str] = []
        for text in strings:
            category = CATEGORY_LABELS.get(_normalize_token(text))
            if category:
                if current_category and collected:
                    _parse_section_lines(collected, current_category, parsed, seen)
                current_category = category
                collected = []
                continue
            if current_category:
                if _normalize_token(text) in {"fußnoten", "studienanmerkungen", "medien"}:
                    _parse_section_lines(collected, current_category, parsed, seen)
                    current_category = None
                    collected = []
                else:
                    collected.append(text)
        if current_category and collected:
            _parse_section_lines(collected, current_category, parsed, seen)

    return parsed


def _http_get(url: str) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; BibleUniverseLocalResearch/0.2)",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.5",
    }
    with httpx.Client(timeout=30.0, follow_redirects=True, headers=headers) as client:
        response = client.get(url)
        response.raise_for_status()
        return response.text


def _wol_url_from_jw_url(url: str) -> str | None:
    parsed = urlparse(url)
    parts = [unquote(p) for p in parsed.path.split("/") if p]
    try:
        book_index = parts.index("buecher") + 1
    except ValueError:
        return None
    if book_index + 1 >= len(parts):
        return None
    book_slug = _ascii_slug(parts[book_index])
    chapter_text = parts[book_index + 1]
    if not chapter_text.isdigit():
        return None
    book_number = JW_BOOK_SLUG_TO_NUMBER.get(book_slug)
    if not book_number:
        return None
    return f"https://wol.jw.org/de/wol/b/r10/lp-x/nwtsty/{book_number}/{int(chapter_text)}"


def fetch_reference_page(url: str) -> tuple[str, str]:
    parsed_url = urlparse(url)
    if parsed_url.scheme != "https" or parsed_url.hostname not in ALLOWED_HOSTS:
        raise ValueError("Only HTTPS pages on jw.org / wol.jw.org are allowed")

    html = _http_get(url)
    if parse_cross_references(html):
        return html, url

    if parsed_url.hostname in {"jw.org", "www.jw.org"}:
        wol_url = _wol_url_from_jw_url(url)
        if wol_url:
            wol_html = _http_get(wol_url)
            return wol_html, wol_url

    return html, url


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


def _verse_lookup(session: Session, book_id: int, chapter_number: int, verse_number: int) -> BibleVerse | None:
    statement = (
        select(BibleVerse)
        .join(BibleChapter, BibleVerse.chapter_id == BibleChapter.id)
        .where(BibleChapter.book_id == book_id,
               BibleChapter.chapter_number == chapter_number,
               BibleVerse.verse_number == verse_number)
    )
    return session.scalar(statement)


def import_cross_references(session: Session, url: str, *, commit: bool = False) -> dict[str, int | str]:
    html, effective_url = fetch_reference_page(url)
    parsed_rows = parse_cross_references(html)
    books = _book_map(session)
    source_catalog = session.scalar(select(SourceCatalog).where(SourceCatalog.code == "JW_NWT_STUDY_DE"))
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

        source_verse = _verse_lookup(session, source_book.id, parsed.source_chapter, parsed.source_verse)
        target_start = _verse_lookup(session, target_book.id, parsed.target.chapter, parsed.target.verse_start)
        target_end = _verse_lookup(session, target_book.id, parsed.target.chapter, parsed.target.verse_end)
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

        session.add(CrossReference(
            source_verse_id=source_verse.id,
            target_start_verse_id=target_start.id,
            target_end_verse_id=target_end_id,
            source_catalog_id=source_catalog.id,
            native_category=parsed.native_category,
            relation_type=CANONICAL_RELATION_MAP.get(parsed.native_category),
            provenance_level="VERIFIED",
            confidence=1.0,
            source_url=effective_url,
            source_anchor=source_verse.source_reference,
        ))
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
        "source_used": effective_url,
    }
