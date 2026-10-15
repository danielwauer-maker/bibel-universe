from __future__ import annotations

import re
from dataclasses import dataclass

from bs4 import BeautifulSoup, NavigableString, Tag

from .jw_crossrefs import _http_get
from .seed_data import BOOKS


@dataclass(frozen=True)
class LiveVerseText:
    text: str
    source_url: str


def _book_slug(book_id: int) -> str:
    if book_id < 1 or book_id > len(BOOKS):
        raise RuntimeError(f"Unknown Bible book id: {book_id}")
    return BOOKS[book_id - 1][1]


def _jw_url(book_id: int, chapter_number: int) -> str:
    slug = _book_slug(book_id)
    return f"https://www.jw.org/de/bibliothek/bibel/studienbibel/buecher/{slug}/{chapter_number}/"


def _clean_text(parts: list[str]) -> str:
    text = " ".join(part for part in parts if part)
    text = text.replace("\xa0", " ")
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = text.replace(" + ", " ").replace(" * ", " ")
    text = re.sub(r"^[+*^\s]+|[+*^\s]+$", "", text)
    return text


def _main_scripture_heading(soup: BeautifulSoup) -> Tag | None:
    for heading in soup.find_all("h1"):
        text = heading.get_text(" ", strip=True).replace("\xa0", " ")
        if re.search(r"\d+:\d+(?:[-–]\d+)?$", text):
            return heading
    return None


def _marker_text(tag: Tag) -> str:
    return tag.get_text(" ", strip=True).replace("\xa0", " ").strip()


def _looks_like_verse_marker(tag: Tag) -> bool:
    if tag.name not in {"a", "span", "sup"}:
        return False
    return bool(re.fullmatch(r"\d{1,3}", _marker_text(tag)))


def _inside_reference_markup(tag: Tag | None) -> bool:
    """Return True only for actual annotation/reference chrome.

    Do not treat generic `study*` containers as references: on JW.org the entire
    Study Bible text can live inside elements whose class name contains "study".
    Doing so silently discarded every verse body for books such as 2 Peter.
    """
    current = tag
    while current is not None:
        classes = " ".join(current.get("class", [])).lower()
        href = str(current.get("href", "")).lower()
        if any(token in classes for token in ("footnote", "xref", "crossref", "reference")):
            return True
        if href.startswith("#footnote") or "footnote" in href:
            return True
        current = current.parent if isinstance(current.parent, Tag) else None
    return False


def parse_verse_text(html: str, chapter_number: int, verse_number: int) -> str | None:
    soup = BeautifulSoup(html, "html.parser")
    heading = _main_scripture_heading(soup)
    if heading is None:
        return None

    markers: list[Tag] = []
    for tag in heading.find_all_next(["a", "span", "sup", "h2", "h3"]):
        if tag.name in {"h2", "h3"}:
            title = tag.get_text(" ", strip=True).lower()
            if title in {"fußnoten", "studienanmerkungen", "medien"}:
                break
        if _looks_like_verse_marker(tag):
            markers.append(tag)

    start_marker = next((m for m in markers if _marker_text(m) == str(verse_number)), None)
    if start_marker is None:
        return None

    next_marker: Tag | None = None
    for candidate in markers[markers.index(start_marker) + 1 :]:
        if _marker_text(candidate) == str(verse_number + 1):
            next_marker = candidate
            break

    parts: list[str] = []
    for element in start_marker.next_elements:
        if next_marker is not None and element is next_marker:
            break

        if isinstance(element, Tag):
            if element.name in {"script", "style", "input", "button", "svg"}:
                continue
            if element.name in {"h2", "h3"}:
                title = element.get_text(" ", strip=True).lower()
                if title in {"fußnoten", "studienanmerkungen", "medien"}:
                    break
            continue

        if not isinstance(element, NavigableString):
            continue
        parent = element.parent if isinstance(element.parent, Tag) else None
        if parent is None or parent.name in {"script", "style", "input", "button", "svg"}:
            continue
        if _inside_reference_markup(parent):
            continue

        value = str(element).replace("\xa0", " ").strip()
        if not value or value in {"+", "*", "^"}:
            continue
        parts.append(value)

    text = _clean_text(parts)
    if not text:
        return None

    text = re.sub(rf"^{verse_number}\s+", "", text).strip()
    return text[:2400]


def fetch_live_verse_text(book_id: int, chapter_number: int, verse_number: int) -> LiveVerseText:
    source_url = _jw_url(book_id, chapter_number)
    html = _http_get(source_url)
    text = parse_verse_text(html, chapter_number, verse_number)
    if not text:
        raise RuntimeError("Verse text could not be identified in the official JW.org chapter page")
    return LiveVerseText(text=text, source_url=source_url)
