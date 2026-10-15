"use client";

import { useEffect, useState } from "react";

type Health = {
  status: string;
  service: string;
};

export default function HomePage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

    fetch(`${apiBase}/health`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`API responded with ${response.status}`);
        }
        return response.json();
      })
      .then(setHealth)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">S0 · Local Foundation</p>
        <h1>Bible Universe</h1>
        <p className="lead">
          Interactive Scripture Knowledge Graph with Galaxy View, Knowledge Graph View and cinematic journeys through biblical connections.
        </p>

        <div className="statusCard">
          <span className={`dot ${health ? "ok" : error ? "error" : "pending"}`} />
          <div>
            <strong>Local API</strong>
            <p>
              {health
                ? `${health.service}: ${health.status}`
                : error
                  ? `Nicht erreichbar: ${error}`
                  : "Verbindung wird geprüft …"}
            </p>
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
      </section>
    </main>
  );
}
