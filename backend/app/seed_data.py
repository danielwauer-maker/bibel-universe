from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import BibleBook, BibleChapter

BOOKS = [
    (1, "1-mose", "1. Mose", "1Mo", "HEBREW", 50),
    (2, "2-mose", "2. Mose", "2Mo", "HEBREW", 40),
    (3, "3-mose", "3. Mose", "3Mo", "HEBREW", 27),
    (4, "4-mose", "4. Mose", "4Mo", "HEBREW", 36),
    (5, "5-mose", "5. Mose", "5Mo", "HEBREW", 34),
    (6, "josua", "Josua", "Jos", "HEBREW", 24),
    (7, "richter", "Richter", "Ri", "HEBREW", 21),
    (8, "ruth", "Ruth", "Ru", "HEBREW", 4),
    (9, "1-samuel", "1. Samuel", "1Sa", "HEBREW", 31),
    (10, "2-samuel", "2. Samuel", "2Sa", "HEBREW", 24),
    (11, "1-koenige", "1. Könige", "1Kö", "HEBREW", 22),
    (12, "2-koenige", "2. Könige", "2Kö", "HEBREW", 25),
    (13, "1-chronika", "1. Chronika", "1Ch", "HEBREW", 29),
    (14, "2-chronika", "2. Chronika", "2Ch", "HEBREW", 36),
    (15, "esra", "Esra", "Esr", "HEBREW", 10),
    (16, "nehemia", "Nehemia", "Ne", "HEBREW", 13),
    (17, "esther", "Esther", "Est", "HEBREW", 10),
    (18, "hiob", "Hiob", "Hi", "HEBREW", 42),
    (19, "psalmen", "Psalmen", "Ps", "HEBREW", 150),
    (20, "sprueche", "Sprüche", "Spr", "HEBREW", 31),
    (21, "prediger", "Prediger", "Pr", "HEBREW", 12),
    (22, "hohes-lied", "Hohes Lied", "Hoh", "HEBREW", 8),
    (23, "jesaja", "Jesaja", "Jes", "HEBREW", 66),
    (24, "jeremia", "Jeremia", "Jer", "HEBREW", 52),
    (25, "klagelieder", "Klagelieder", "Klg", "HEBREW", 5),
    (26, "hesekiel", "Hesekiel", "Hes", "HEBREW", 48),
    (27, "daniel", "Daniel", "Da", "HEBREW", 12),
    (28, "hosea", "Hosea", "Hos", "HEBREW", 14),
    (29, "joel", "Joel", "Joel", "HEBREW", 3),
    (30, "amos", "Amos", "Am", "HEBREW", 9),
    (31, "obadja", "Obadja", "Ob", "HEBREW", 1),
    (32, "jona", "Jona", "Jon", "HEBREW", 4),
    (33, "micha", "Micha", "Mi", "HEBREW", 7),
    (34, "nahum", "Nahum", "Nah", "HEBREW", 3),
    (35, "habakuk", "Habakuk", "Hab", "HEBREW", 3),
    (36, "zephanja", "Zephanja", "Ze", "HEBREW", 3),
    (37, "haggai", "Haggai", "Hag", "HEBREW", 2),
    (38, "sacharja", "Sacharja", "Sach", "HEBREW", 14),
    (39, "maleachi", "Maleachi", "Mal", "HEBREW", 4),
    (40, "matthaeus", "Matthäus", "Mat", "GREEK", 28),
    (41, "markus", "Markus", "Mar", "GREEK", 16),
    (42, "lukas", "Lukas", "Luk", "GREEK", 24),
    (43, "johannes", "Johannes", "Joh", "GREEK", 21),
    (44, "apostelgeschichte", "Apostelgeschichte", "Apg", "GREEK", 28),
    (45, "roemer", "Römer", "Röm", "GREEK", 16),
    (46, "1-korinther", "1. Korinther", "1Ko", "GREEK", 16),
    (47, "2-korinther", "2. Korinther", "2Ko", "GREEK", 13),
    (48, "galater", "Galater", "Gal", "GREEK", 6),
    (49, "epheser", "Epheser", "Eph", "GREEK", 6),
    (50, "philipper", "Philipper", "Php", "GREEK", 4),
    (51, "kolosser", "Kolosser", "Kol", "GREEK", 4),
    (52, "1-thessalonicher", "1. Thessalonicher", "1Th", "GREEK", 5),
    (53, "2-thessalonicher", "2. Thessalonicher", "2Th", "GREEK", 3),
    (54, "1-timotheus", "1. Timotheus", "1Ti", "GREEK", 6),
    (55, "2-timotheus", "2. Timotheus", "2Ti", "GREEK", 4),
    (56, "titus", "Titus", "Tit", "GREEK", 3),
    (57, "philemon", "Philemon", "Phm", "GREEK", 1),
    (58, "hebraeer", "Hebräer", "Heb", "GREEK", 13),
    (59, "jakobus", "Jakobus", "Jak", "GREEK", 5),
    (60, "1-petrus", "1. Petrus", "1Pe", "GREEK", 5),
    (61, "2-petrus", "2. Petrus", "2Pe", "GREEK", 3),
    (62, "1-johannes", "1. Johannes", "1Jo", "GREEK", 5),
    (63, "2-johannes", "2. Johannes", "2Jo", "GREEK", 1),
    (64, "3-johannes", "3. Johannes", "3Jo", "GREEK", 1),
    (65, "judas", "Judas", "Jud", "GREEK", 1),
    (66, "offenbarung", "Offenbarung", "Off", "GREEK", 22),
]

EXPECTED_BOOK_COUNT = 66
EXPECTED_CHAPTER_COUNT = 1189


def seed_bible_skeleton(session: Session) -> None:
    existing_books = session.scalar(select(func.count(BibleBook.id))) or 0
    if existing_books:
        return

    chapter_global_order = 1
    for book_id, slug, name_de, abbreviation, scripture_part, chapter_count in BOOKS:
        book = BibleBook(
            id=book_id,
            canonical_order=book_id,
            slug=slug,
            name_de=name_de,
            abbreviation=abbreviation,
            scripture_part=scripture_part,
            chapter_count=chapter_count,
        )
        session.add(book)

        for chapter_number in range(1, chapter_count + 1):
            session.add(
                BibleChapter(
                    id=chapter_global_order,
                    global_order=chapter_global_order,
                    book_id=book_id,
                    chapter_number=chapter_number,
                )
            )
            chapter_global_order += 1

    if len(BOOKS) != EXPECTED_BOOK_COUNT or chapter_global_order - 1 != EXPECTED_CHAPTER_COUNT:
        raise RuntimeError("Bible skeleton seed data failed canonical count validation")

    session.commit()
