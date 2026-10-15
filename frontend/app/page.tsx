"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { VerseGraphData } from "../components/VerseGraph";

const VerseGraph = dynamic(() => import("../components/VerseGraph"), {
  ssr: false,
  loading: () => <div className="graphLoading">3D-Engine wird geladen …</div>,
});

type Health = {
  status: string;
  service: string;
};

type Stats = {
  books: number;
  chapters: number;
  verses: number;
  cross_references: number;
  hebrew_books: number;
  greek_books: number;
  verse_structure_ready: boolean;
  jw_source_ready: boolean;
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

function defer(callback: () => void) {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    const id = window.requestIdleCallback(callback, { timeout: 900 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(callback, 250);
  return () => window.clearTimeout(id);
}

export default function HomePage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [graph, setGraph] = useState<VerseGraphData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8010";
    const controller = new AbortController();

    // Critical above-the-fold data first. The page can become useful without
    // waiting for the 3D engine, book list or graph payload.
    Promise.all([
      fetch(`${apiBase}/health`, { signal: controller.signal }),
      fetch(`${apiBase}/api/stats`, { signal: controller.signal }),
    ])
      .then(async ([healthResponse, statsResponse]) => {
        if (!healthResponse.ok || !statsResponse.ok) {
          throw new Error(`API responded with ${!healthResponse.ok ? healthResponse.status : statsResponse.status}`);
        }
        const [healthData, statsData] = await Promise.all([
          healthResponse.json() as Promise<Health>,
          statsResponse.json() as Promise<Stats>,
        ]);
        setHealth(healthData);
        setStats(statsData);
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError(err.message);
      });

    // Non-critical homepage content is intentionally deferred until the browser
    // has painted the initial shell and status metrics.
    const cancelDeferred = defer(() => {
      fetch(`${apiBase}/api/graph/verse/23702`, { signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error(`Graph API responded with ${response.status}`);
          return response.json() as Promise<VerseGraphData>;
        })
        .then(setGraph)
        .catch((err: Error) => {
          if (err.name !== "AbortError") console.error(err);
        });

      fetch(`${apiBase}/api/books`, { signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error(`Books API responded with ${response.status}`);
          return response.json() as Promise<Book[]>;
        })
        .then(setBooks)
        .catch((err: Error) => {
          if (err.name !== "AbortError") console.error(err);
        });
    });

    return () => {
      controller.abort();
      cancelDeferred();
    };
  }, []);

  const ready = health && stats?.verse_structure_ready && stats?.jw_source_ready;

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">S2 · NWT Cross-Reference Foundation</p>
        <h1>Bible Universe</h1>
        <p className="lead">
          31.102 adressierbare Vers-Knoten als Basis für echte, quellenbelegte Verbindungen aus der Neue-Welt-Übersetzung (Studienausgabe).
        </p>

        <div className="statusCard">
          <span className={`dot ${ready ? "ok" : error ? "error" : "pending"}`} />
          <div>
            <strong>Lokaler Stack</strong>
            <p>
              {ready
                ? `${health?.service}: ${health?.status} · Versstruktur + JW.org-Quelle bereit`
                : error
                  ? `Nicht erreichbar: ${error}`
                  : "Versstruktur und Quellenkatalog werden geprüft …"}
            </p>
          </div>
        </div>

        <div className="statsGrid">
          <div className="metric"><strong>{stats?.books ?? "–"}</strong><span>Bücher</span></div>
          <div className="metric"><strong>{stats?.chapters?.toLocaleString("de-DE") ?? "–"}</strong><span>Kapitel</span></div>
          <div className="metric accentMetric"><strong>{stats?.verses?.toLocaleString("de-DE") ?? "–"}</strong><span>Vers-Knoten</span></div>
          <div className="metric"><strong>{stats?.cross_references?.toLocaleString("de-DE") ?? "–"}</strong><span>importierte Querverweise</span></div>
          <div className="metric"><strong>{stats?.hebrew_books ?? "–"}</strong><span>Hebräisch-Aramäisch</span></div>
          <div className="metric"><strong>{stats?.greek_books ?? "–"}</strong><span>Christlich-Griechisch</span></div>
        </div>

        <section className="graphSection">
          <div className="sectionHeading">
            <div>
              <p className="eyebrow">Erster echter 3D Knowledge Graph</p>
              <h2>Matthäus 17:1 als interaktiver Fokus-Knoten</h2>
            </div>
            <span className="dataBadge">{graph?.edges.length ?? 0} verifizierte Kanten sichtbar</span>
          </div>

          {graph ? (
            <VerseGraph data={graph} />
          ) : (
            <div className="graphLoading">Graph-Daten werden nachgeladen …</div>
          )}
        </section>

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
              <h2>66 Bücher · 1.189 Kapitel · 31.102 Vers-Knoten</h2>
            </div>
            <span className="dataBadge">
              {stats?.jw_source_ready ? "JW.org Quelle registriert" : "Quelle wird vorbereitet"}
            </span>
          </div>

          <div className="sourceNote">
            <strong>S2 Datenprinzip</strong>
            <p>
              Wir speichern zunächst Verskoordinaten, Querverweis-Beziehungen, Kategorien und Quellen-URLs. Der vollständige NWT-Text wird in dieser Phase nicht in unser Repository kopiert.
            </p>
          </div>

          {books.length ? (
            <div className="bookGrid">
              {books.map((book) => (
                <div className="bookChip" key={book.id}>
                  <span>{book.canonical_order.toString().padStart(2, "0")}</span>
                  <strong>{book.name_de}</strong>
                  <small>{book.chapter_count} Kap.</small>
                </div>
              ))}
            </div>
          ) : (
            <div className="graphLoading">Bücher werden im Hintergrund geladen …</div>
          )}
        </section>
      </section>
    </main>
  );
}
