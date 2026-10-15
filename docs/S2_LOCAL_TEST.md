# S2 – NWT Cross-Reference Foundation · Local Test

## Ziel

S2 erweitert das kanonische Grundgerüst um:

- 31.102 deterministische Vers-Knoten (Koordinaten/Nummerierung, noch kein NWT-Volltext)
- Quellenkatalog für die deutsche Neue-Welt-Übersetzung (Studienausgabe)
- Datenmodell für verifizierte Querverweise
- Parser/Importer für einzelne JW.org-Kapitel
- Provenienz- und Klassifizierungsfelder für die spätere 20-Typen-Taxonomie

## 1. Branch wechseln

```powershell
git fetch --all
git switch feat/s2-nwt-crossrefs
git pull
```

## 2. Stack neu bauen

Die Backend-Abhängigkeiten wurden erweitert. Deshalb bitte neu bauen:

```powershell
docker compose down
docker compose up --build
```

Beim ersten S2-Start werden zusätzlich die 31.102 Vers-Knoten in PostgreSQL angelegt.

## 3. Basis prüfen

- http://localhost:3000
- http://localhost:8010/api/stats
- http://localhost:8010/api/books/40/chapters/17/verses

Erwartung für `/api/stats` vor dem ersten JW-Import:

```json
{
  "books": 66,
  "chapters": 1189,
  "verses": 31102,
  "cross_references": 0,
  "hebrew_books": 39,
  "greek_books": 27,
  "verse_structure_ready": true,
  "jw_source_ready": true
}
```

## 4. JW.org Parser als Dry Run testen

Pilotkapitel: Matthäus 17.

```powershell
docker compose exec api python -m app.import_jw_crossrefs "https://www.jw.org/de/bibliothek/bibel/studienbibel/buecher/matth%C3%A4us/17/"
```

Ohne `--commit` wird nichts gespeichert. Die Ausgabe soll `parsed` und `would_import` größer als 0 zeigen.

## 5. Pilotdaten speichern

Erst wenn der Dry Run plausibel aussieht:

```powershell
docker compose exec api python -m app.import_jw_crossrefs "https://www.jw.org/de/bibliothek/bibel/studienbibel/buecher/matth%C3%A4us/17/" --commit
```

Danach erneut prüfen:

- http://localhost:8010/api/stats
- http://localhost:8010/api/cross-references?limit=100

`cross_references` sollte jetzt größer als 0 sein.

## Datenprinzip

S2 kopiert bewusst **nicht** den vollständigen Text der NWT in das Repository. Gespeichert werden zunächst:

- Verskoordinaten
- Querverweis-Kanten
- Quellkategorie (z. B. Parallelbericht, Zitat, Allgemein)
- Provenienz (`VERIFIED`)
- JW.org-Quell-URL
- spätere Zuordnung zu einem unserer 20 Beziehungstypen

Damit können wir den Knowledge Graph quellenklar aufbauen, ohne die Bibeltexte unnötig zu duplizieren.
