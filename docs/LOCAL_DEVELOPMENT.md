# Local Development

This project is developed and verified locally before any deployment work.

## Requirements

- Docker Desktop
- Git

## Initial checkout

```bash
git clone https://github.com/danielwauer-maker/bibel-universe.git
cd bibel-universe
git fetch --all
git switch feat/local-foundation
```

## Start

```bash
docker compose up --build
```

Expected services:

- Web: http://localhost:3000
- API: http://localhost:8000
- API health: http://localhost:8000/health
- PostgreSQL: localhost:5432

## Quick verification

Open `http://localhost:3000`. The start page checks the API automatically. The API status should become green and display:

```text
bible-universe-api: ok
```

You can also test directly:

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{"status":"ok","service":"bible-universe-api"}
```

## Stop

```bash
docker compose down
```

## Reset local database

Only use this when local database data may be deleted:

```bash
docker compose down -v
docker compose up --build
```

## Sync workflow

Before each local test cycle:

```bash
git fetch --all
git switch <working-branch>
git pull
```

After changes are reviewed and merged, switch back to `main` and update the local checkout:

```bash
git switch main
git pull
```

## Current branch

Foundation work is currently prepared on:

```text
feat/local-foundation
```
