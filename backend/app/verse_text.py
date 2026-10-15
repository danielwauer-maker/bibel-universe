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


def _wol_url(book_id: int, chapter_number: int) -> str:
    return f"https://wol.jw.org/de/wol/b/r10/lp-x/nwtsty/{book_id}/{chapter_number}"


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
    """Parse a verse from the public JW.org Study Bible chapter page."""
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


def _wol_scripture_heading(soup: BeautifulSoup, chapter_number: int) -> Tag | None:
    headings = soup.find_all(["h1", "h2", "h3"])
    chapter_suffix = re.compile(rf"(?:^|\s){chapter_number}\s*$")
    for heading in headings:
        text = heading.get_text(" ", strip=True).replace("\xa0", " ").strip()
        if not text or ":" in text or len(text) > 100:
            continue
        if chapter_suffix.search(text):
            return heading
    for heading in headings:
        text = heading.get_text(" ", strip=True)
        if text.startswith("Nach ") or text.startswith("Psalm") or text.startswith("Sprüche"):
            return heading
    return None


def _wol_numeric_marker(tag: Tag) -> bool:
    if tag.name not in {"a", "span", "sup"}:
        return False
    text = _marker_text(tag)
    if not re.fullmatch(r"\d{1,3}", text):
        return False
    attrs = " ".join([
        str(tag.get("id", "")),
        " ".join(tag.get("class", [])),
        str(tag.get("href", "")),
        str(tag.get("data-pid", "")),
    ]).lower()
    return any(token in attrs for token in ("verse", "#v", "data-pid")) or tag.name == "a"


def parse_wol_verse_text(html: str, chapter_number: int, verse_number: int) -> str | None:
    """Fallback parser for WOL.

    WOL represents verse 1 differently on some chapters: the chapter number itself
    acts as the first marker. This is why Mat 17:1 could fail on the JW.org parser
    while later verses such as 2Pe 1:16 succeeded.
    """
    soup = BeautifulSoup(html, "html.parser")
    heading = _wol_scripture_heading(soup, chapter_number)
    if heading is None:
        return None

    markers = [tag for tag in heading.find_all_next(["a", "span", "sup"]) if _wol_numeric_marker(tag)]
    if not markers:
        return None

    wanted = chapter_number if verse_number == 1 else verse_number
    start_marker = next((m for m in markers if _marker_text(m) == str(wanted)), None)
    if start_marker is None:
        return None

    start_index = markers.index(start_marker)
    next_marker = markers[start_index + 1] if start_index + 1 < len(markers) else None
    parts: list[str] = []
    for element in start_marker.next_elements:
        if next_marker is not None and element is next_marker:
            break
        if isinstance(element, Tag):
            if element.name in {"script", "style", "input", "button", "svg"}:
                continue
            if element.name in {"h1", "h2", "h3", "h4"} and parts:
                break
            continue
        if not isinstance(element, NavigableString):
            continue
        parent = element.parent if isinstance(element.parent, Tag) else None
        if parent is None or parent.name in {"script", "style", "input", "button", "svg"}:
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
    # Primary source: JW.org Study Bible. This works reliably for the normal
    # numbered verse markers used by most verses.
    jw_url = _jw_url(book_id, chapter_number)
    jw_html = _http_get(jw_url)
    text = parse_verse_text(jw_html, chapter_number, verse_number)
    if text:
        return LiveVerseText(text=text, source_url=jw_url)

    # Official WOL mirrors the same NWT Study Bible and is a robust fallback for
    # markup variants, especially verse 1 where the chapter number can be the
    # visible first marker.
    wol_url = _wol_url(book_id, chapter_number)
    wol_html = _http_get(wol_url)
    text = parse_wol_verse_text(wol_html, chapter_number, verse_number)
    if text:
        return LiveVerseText(text=text, source_url=wol_url)

    raise RuntimeError("Verse text could not be identified on JW.org or WOL")
