# S1 — Bible Skeleton

## Ziel

Das kanonische Grundgerüst der Bibel wird als lokale, relationale Basis für den späteren Knowledge Graph bereitgestellt.

## Enthalten

- 66 Bücher in kanonischer Reihenfolge
- 1.189 Kapitel
- 39 Bücher der Hebräisch-Aramäischen Schriften / 929 Kapitel
- 27 Bücher der Christlichen Griechischen Schriften / 260 Kapitel
- vorbereitete Tabelle für Verse
- stabile Buch-IDs 1–66
- stabile globale Kapitel-IDs 1–1.189
- deutsche Buchnamen und gebräuchliche NWT-Abkürzungen

## API

- `GET /health`
- `GET /api/stats`
- `GET /api/books`
- `GET /api/books?scripture_part=HEBREW`
- `GET /api/books?scripture_part=GREEK`
- `GET /api/books/{book_id}`
- `GET /api/books/{book_id}/chapters`
- `GET /api/books/{book_id}/chapters/{chapter_number}`

## Lokaler Test

```powershell
git switch feat/s1-bible-skeleton
git pull
docker compose down
docker compose up --build
```

Danach:

- Web: http://localhost:3000
- API Health: http://localhost:8010/health
- Stats: http://localhost:8010/api/stats
- Bücher: http://localhost:8010/api/books
- 1. Mose: http://localhost:8010/api/books/1

Erwartete Stats für S1:

```json
{
  "books": 66,
  "chapters": 1189,
  "verses": 0,
  "hebrew_books": 39,
  "greek_books": 27,
  "verse_structure_ready": true
}
```

Verse werden in einem folgenden Daten-Sprint aus einer sauber definierten Quelle geladen. S1 legt dafür bereits das Schema an, ohne Bibeltext zu duplizieren.
