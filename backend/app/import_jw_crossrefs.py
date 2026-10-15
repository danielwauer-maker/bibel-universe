from __future__ import annotations

import argparse

from .db import Base, SessionLocal, engine
from .jw_crossrefs import import_cross_references
from .seed_data import seed_bible_skeleton


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import verified cross-reference metadata from one JW.org NWT Study Bible chapter."
    )
    parser.add_argument("url", help="Full https://www.jw.org/... chapter URL")
    parser.add_argument(
        "--commit",
        action="store_true",
        help="Write parsed cross references to PostgreSQL. Without this flag the run is dry-run only.",
    )
    args = parser.parse_args()

    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        seed_bible_skeleton(session)
        result = import_cross_references(session, args.url, commit=args.commit)

    mode = "COMMIT" if args.commit else "DRY RUN"
    print(
        f"[{mode}] parsed={result['parsed']} would_import={result['would_import']} "
        f"imported={result['imported']} skipped={result['skipped']} "
        f"unclassified={result['unclassified']}"
    )
    print(f"source_used={result['source_used']}")


if __name__ == "__main__":
    main()
