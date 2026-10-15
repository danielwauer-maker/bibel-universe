# Bible Universe / Scripture Knowledge Graph

Interactive 3D Bible knowledge graph focused on the New World Translation and verifiable source relationships.

## Goal

Build a local-first application with two primary visual modes:

- **Galaxy View** — explore the Bible as a semantic 3D universe.
- **Knowledge Graph View** — inspect explicit relationships between verses, people, places, events, themes and other entities.

A later milestone adds a cinematic **Journey Mode** that lets the camera travel along relationships from one node to another.

## Core relationship taxonomy

The project tracks 20 relationship types:

1. Parallel accounts
2. Direct quotations
3. Prophecy → fulfillment
4. Same person
5. Same place
6. Same event / retrospective reference
7. Same thought / principle
8. Similar wording
9. Law → later application
10. Type / antitype / pattern
11. Covenant relationships
12. Genealogical relationships
13. Chronological relationships
14. Cause → effect
15. Question → answer / statement → explanation
16. Promise → fulfillment
17. Command → example of implementation
18. Contrast
19. Motif / theme
20. Key terms / recurring expressions

## Local-first development

Deployment is intentionally deferred. The canonical development workflow is local Docker Desktop first.

### Prerequisites

- Docker Desktop
- Git

### Start the stack

```bash
git clone https://github.com/danielwauer-maker/bibel-universe.git
cd bibel-universe
docker compose up --build
```

After startup:

- Frontend: http://localhost:3000
- API: http://localhost:8000
- API health: http://localhost:8000/health
- PostgreSQL: localhost:5432

### Stop the stack

```bash
docker compose down
```

To also remove the local database volume:

```bash
docker compose down -v
```

## Planned stack

- Frontend: Next.js + TypeScript
- 3D: Three.js / React Three Fiber
- Backend: FastAPI + Python
- Database: PostgreSQL
- Local orchestration: Docker Compose

## Current stage

**S0 — Foundation / local development bootstrap**

The first goal is a reliable local stack before Bible data ingestion or deployment work begins.
