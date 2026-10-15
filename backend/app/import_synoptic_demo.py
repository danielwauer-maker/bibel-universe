from __future__ import annotations

import argparse

from .db import Base, SessionLocal, engine
from .jw_crossrefs import import_cross_references
from .seed_data import seed_bible_skeleton


CHAPTERS = [
    ("Matthäus 17", "https://www.jw.org/de/bibliothek/bibel/studienbibel/buecher/matth%C3%A4us/17/"),
    ("Markus 9", "https://www.jw.org/de/bibliothek/bibel/studienbibel/buecher/markus/9/"),
    ("Lukas 9", "https://www.jw.org/de/bibliothek/bibel/studienbibel/buecher/lukas/9/"),
]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import the three Synoptic demo chapters used by the local Bible Universe graph."
    )
    parser.add_argument(
        "--commit",
        action="store_true",
        help="Write parsed cross references to PostgreSQL. Without this flag all chapters are dry-run only.",
    )
    args = parser.parse_args()

    Base.metadata.create_all(bind=engine)
    totals = {"parsed": 0, "would_import": 0, "imported": 0, "skipped": 0, "unclassified": 0}

    with SessionLocal() as session:
        seed_bible_skeleton(session)
        for label, url in CHAPTERS:
            result = import_cross_references(session, url, commit=args.commit)
            for key in totals:
                totals[key] += int(result[key])
            mode = "COMMIT" if args.commit else "DRY RUN"
            print(
                f"[{mode}] {label}: parsed={result['parsed']} would_import={result['would_import']} "
                f"imported={result['imported']} skipped={result['skipped']} "
                f"unclassified={result['unclassified']}"
            )
            print(f"source_used={result['source_used']}")

    mode = "COMMIT" if args.commit else "DRY RUN"
    print(
        f"[{mode}] TOTAL: parsed={totals['parsed']} would_import={totals['would_import']} "
        f"imported={totals['imported']} skipped={totals['skipped']} "
        f"unclassified={totals['unclassified']}"
    )


if __name__ == "__main__":
    main()
