"use client";

import { useEffect, useState } from "react";

type Health = {
  status: string;
  service: string;
};

type Stats = {
  books: number;
  chapters: number;
  verses: number;
  hebrew_books: number;
  greek_books: number;
  verse_structure_ready: boolean;
};

type Book = {
  id: number;
  canonical_order: number;
  slug: string;
  name_de: string;
  abbreviation: string;
  scripture_part: "HEBREW" | "GREEK";
  chapter_count: number;
};

export default function HomePage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8010";

    Promise.all([
      fetch(`${apiBase}/health`),
      fetch(`${apiBase}/api/stats`),
      fetch(`${apiBase}/api/books`),
    ])
      .then(async ([healthResponse, statsResponse, booksResponse]) => {
        for (const response of [healthResponse, statsResponse, booksResponse]) {
          if (!response.ok) {
            throw new Error(`API responded with ${response.status}`);
          }
        }

        const [healthData, statsData, booksData] = await Promise.all([
          healthResponse.json(),
          statsResponse.json(),
          booksResponse.json(),
        ]);

        setHealth(healthData);
        setStats(statsData);
        setBooks(booksData);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">S1 · Bible Skeleton</p>
        <h1>Bible Universe</h1>
        <p className="lead">
          Das kanonische Grundgerüst für Galaxy View, Knowledge Graph und die spätere Reise durch echte biblische Verbindungen.
        </p>

        <div className="statusCard">
          <span className={`dot ${health && stats ? "ok" : error ? "error" : "pending"}`} />
          <div>
            <strong>Lokaler Stack</strong>
            <p>
              {health && stats
                ? `${health.service}: ${health.status} · Bible Skeleton geladen`
                : error
                  ? `Nicht erreichbar: ${error}`
                  : "API und Bibelstruktur werden geprüft …"}
            </p>
          </div>
        </div>

        <div className="statsGrid">
          <div className="metric">
            <strong>{stats?.books ?? "–"}</strong>
            <span>Bücher</span>
          </div>
          <div className="metric">
            <strong>{stats?.chapters?.toLocaleString("de-DE") ?? "–"}</strong>
            <span>Kapitel</span>
          </div>
          <div className="metric">
            <strong>{stats?.hebrew_books ?? "–"}</strong>
            <span>Hebräisch-Aramäisch</span>
          </div>
          <div className="metric">
            <strong>{stats?.greek_books ?? "–"}</strong>
            <span>Christlich-Griechisch</span>
          </div>
        </div>

        <div className="grid">
          <article>
            <span>01</span>
            <h2>Galaxy View</h2>
            <p>Die gesamte Bibel als räumliche semantische Landschaft erkunden.</p>
          </article>
          <article>
            <span>02</span>
            <h2>Knowledge Graph</h2>
            <p>Verse, Personen, Orte, Ereignisse, Themen und Beziehungen präzise untersuchen.</p>
          </article>
          <article>
            <span>03</span>
            <h2>Journey Mode</h2>
            <p>Entlang echter Verbindungen von Knoten zu Knoten durch den Graph gleiten.</p>
          </article>
        </div>

        <section className="bookSection">
          <div className="sectionHeading">
            <div>
              <p className="eyebrow">Live aus PostgreSQL</p>
              <h2>66 Bücher als erstes echtes Graph-Fundament</h2>
            </div>
            <span className="dataBadge">{stats?.chapters ?? "–"} Kapitel geladen</span>
          </div>

          <div className="bookGrid">
            {books.map((book) => (
              <div className="bookChip" key={book.id}>
                <span>{book.canonical_order.toString().padStart(2, "0")}</span>
                <strong>{book.name_de}</strong>
                <small>{book.chapter_count} Kap.</small>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
