from __future__ import annotations

import re
from dataclasses import dataclass

from bs4 import BeautifulSoup, NavigableString, Tag

from .jw_crossrefs import _http_get


@dataclass(frozen=True)
class LiveVerseText:
    text: str
    source_url: str


def _wol_url(book_id: int, chapter_number: int) -> str:
    return f"https://wol.jw.org/de/wol/b/r10/lp-x/nwtsty/{book_id}/{chapter_number}"


def _is_numeric_marker(tag: Tag) -> bool:
    if tag.name not in {"a", "span", "sup"}:
        return False
    text = tag.get_text(" ", strip=True).replace("\xa0", " ").strip()
    if not re.fullmatch(r"\d{1,3}", text):
        return False

    attrs = " ".join(
        [
            str(tag.get("id", "")),
            " ".join(tag.get("class", [])),
            str(tag.get("href", "")),
            str(tag.get("data-pid", "")),
        ]
    ).lower()
    return any(token in attrs for token in ("verse", "v", "chapter", "#v", "data-pid")) or tag.name == "a"


def _scripture_heading(soup: BeautifulSoup, chapter_number: int) -> Tag | None:
    """Find the chapter heading that precedes the rendered Bible text.

    Older logic only handled headings beginning with "Nach" plus Psalms/Proverbs,
    which broke for letters such as 2. Peter. WOL chapter headings vary by book,
    so prefer a generic heading ending in the requested chapter number while
    excluding per-verse study headings such as "2. Petrus 1:16".
    """
    headings = soup.find_all(["h1", "h2", "h3"])
    chapter_suffix = re.compile(rf"(?:^|\s){chapter_number}\s*$")

    candidates: list[Tag] = []
    for heading in headings:
        text = heading.get_text(" ", strip=True).replace("\xa0", " ").strip()
        if not text or ":" in text or len(text) > 100:
            continue
        if chapter_suffix.search(text):
            candidates.append(heading)

    if candidates:
        return candidates[0]

    # Backward-compatible fallback for markup variants seen in Gospel/Psalm pages.
    for heading in headings:
        text = heading.get_text(" ", strip=True)
        if text.startswith("Nach ") or text.startswith("Psalm") or text.startswith("Sprüche"):
            return heading
    return None


def _clean_text(parts: list[str]) -> str:
    text = " ".join(part for part in parts if part)
    text = text.replace("\xa0", " ")
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = text.replace(" + ", " ").replace(" * ", " ")
    text = re.sub(r"^[+*\s]+|[+*\s]+$", "", text)
    return text


def parse_verse_text(html: str, chapter_number: int, verse_number: int) -> str | None:
    soup = BeautifulSoup(html, "html.parser")
    heading = _scripture_heading(soup, chapter_number)
    if heading is None:
        return None

    markers: list[Tag] = []
    for tag in heading.find_all_next(["a", "span", "sup"]):
        if _is_numeric_marker(tag):
            markers.append(tag)

    if not markers:
        return None

    start_marker: Tag | None = None
    if verse_number == 1:
        for marker in markers:
            if marker.get_text(" ", strip=True).strip() == str(chapter_number):
                start_marker = marker
                break
    else:
        for marker in markers:
            if marker.get_text(" ", strip=True).strip() == str(verse_number):
                start_marker = marker
                break

    if start_marker is None:
        return None

    start_index = markers.index(start_marker)
    next_marker = markers[start_index + 1] if start_index + 1 < len(markers) else None

    parts: list[str] = []
    for element in start_marker.next_elements:
        if next_marker is not None and element is next_marker:
            break
        if isinstance(element, Tag):
            if element.name in {"script", "style", "input", "button"}:
                continue
            element_text = element.get_text(" ", strip=True)
            if verse_number > 1 and element.name in {"h1", "h2", "h3", "h4"} and element_text:
                break
            continue
        if not isinstance(element, NavigableString):
            continue
        parent = element.parent
        if parent and parent.name in {"script", "style", "input", "button"}:
            continue
        value = str(element).strip()
        if not value or value in {"+", "*"}:
            continue
        parts.append(value)

    text = _clean_text(parts)
    if not text:
        return None
    return text[:2400]


def fetch_live_verse_text(book_id: int, chapter_number: int, verse_number: int) -> LiveVerseText:
    source_url = _wol_url(book_id, chapter_number)
    html = _http_get(source_url)
    text = parse_verse_text(html, chapter_number, verse_number)
    if not text:
        raise RuntimeError("Verse text could not be identified in the official WOL chapter page")
    return LiveVerseText(text=text, source_url=source_url)
