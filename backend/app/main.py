from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Bible Universe API",
    version="0.1.0",
    description="Local-first API for the Scripture Knowledge Graph.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "bible-universe-api"}


@app.get("/")
def root() -> dict[str, str]:
    return {
        "name": "Bible Universe API",
        "stage": "S0 Foundation",
        "message": "Local development stack is running.",
    }
