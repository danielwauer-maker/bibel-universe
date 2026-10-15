"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { VerseGraphData } from "../components/VerseGraph";

const VerseGraph = dynamic(() => import("../components/VerseGraph"), {
  ssr: false,
  loading: () => <div className="graphLoading">3D-Engine wird geladen …</div>,
});

const GalaxyView = dynamic(() => import("../components/GalaxyView"), {
  ssr: false,
  loading: () => <div className="graphLoading">Galaxy View wird geladen …</div>,
});

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

type ExplorerView = "galaxy" | "graph";

const NAV_ITEMS = [
  { id: "galaxy", label: "Galaxy View", enabled: true },
  { id: "graph", label: "Knowledge Graph", enabled: true },
  { id: "words", label: "Wortstudium", enabled: false },
  { id: "crossrefs", label: "Querverweise", enabled: false },
  { id: "timeline", label: "Zeitleiste", enabled: false },
  { id: "maps", label: "Karten", enabled: false },
  { id: "research", label: "Recherche", enabled: false },
  { id: "notes", label: "Notizen", enabled: false },
] as const;

export default function HomePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [graph, setGraph] = useState<VerseGraphData | null>(null);
  const [graphFocus, setGraphFocus] = useState("Mat 17:1");
  const [visibleEdgeCount, setVisibleEdgeCount] = useState(0);
  const [explorerView, setExplorerView] = useState<ExplorerView>("galaxy");
  const [apiReady, setApiReady] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8010";
    const controller = new AbortController();

    fetch(`${apiBase}/api/stats`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Stats API ${response.status}`);
        return response.json() as Promise<Stats>;
      })
      .then((payload) => {
        setStats(payload);
        setApiReady(payload.verse_structure_ready && payload.jw_source_ready);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") console.error(error);
      });

    fetch(`${apiBase}/api/graph/verse/23702`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Graph API ${response.status}`);
        return response.json() as Promise<VerseGraphData>;
      })
      .then((payload) => {
        setGraph(payload);
        setGraphFocus(payload.focus.reference);
        setVisibleEdgeCount(payload.edges.length);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") console.error(error);
      });

    return () => controller.abort();
  }, []);

  const activate = (id: string) => {
    if (id === "galaxy" || id === "graph") {
      setExplorerView(id);
      setMobileNavOpen(false);
    }
  };

  return (
    <main className="hermApp">
      <header className="hermTopbar">
        <button className="hermBrand" type="button" onClick={() => setExplorerView("galaxy")}> 
          <span className="hermBrandIcon">✦</span>
          <span>Bible Universe</span>
          <small>BETA</small>
        </button>

        <nav className="hermDesktopNav" aria-label="Bible Universe Navigation">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={!item.enabled}
              onClick={() => activate(item.id)}
              className={(item.id === explorerView ? "active " : "") + (!item.enabled ? "preview" : "")}
              title={!item.enabled ? "Wird schrittweise integriert" : undefined}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <button className="hermMobileMenu" type="button" onClick={() => setMobileNavOpen((value) => !value)}>
          {explorerView === "galaxy" ? "Galaxy" : "Graph"} ▾
        </button>

        <div className="hermTopActions">
          <span className={apiReady ? "hermLive ok" : "hermLive"}>● {apiReady ? "NWT live" : "API"}</span>
          <button type="button" title="Suche wird als nächster Explorer-Baustein integriert">⌕ Suche</button>
          <button type="button" title="Filter werden aus der Hermeneutica-Engine übernommen">☷ Filter</button>
        </div>
      </header>

      {mobileNavOpen ? (
        <nav className="hermMobileNav">
          {NAV_ITEMS.map((item) => (
            <button key={item.id} type="button" disabled={!item.enabled} onClick={() => activate(item.id)}>
              {item.label}{!item.enabled ? " · bald" : ""}
            </button>
          ))}
        </nav>
      ) : null}

      <section className="hermWorkspace">
        <div className="hermSceneHeader">
          <div>
            <span className="hermEyebrow">INTERAKTIVER BIBEL-EXPLORER</span>
            <h1>{explorerView === "galaxy" ? "Die Bibel als semantische Galaxie" : graphFocus}</h1>
          </div>
          <div className="hermSceneStats">
            <span><strong>{stats?.books ?? 66}</strong> Bücher</span>
            <span><strong>{stats?.chapters?.toLocaleString("de-DE") ?? "1.189"}</strong> Kapitel</span>
            <span><strong>{stats?.verses?.toLocaleString("de-DE") ?? "31.102"}</strong> Verse</span>
            <span><strong>{stats?.cross_references?.toLocaleString("de-DE") ?? "–"}</strong> Beziehungen</span>
          </div>
        </div>

        <div className="hermSceneFrame">
          {explorerView === "galaxy" ? (
            <GalaxyView stats={stats} />
          ) : graph ? (
            <div className="hermGraphWrap">
              <div className="hermGraphMeta">{visibleEdgeCount} sichtbare Beziehungen</div>
              <VerseGraph
                data={graph}
                onFocusChange={(reference, edgeCount) => {
                  setGraphFocus(reference);
                  setVisibleEdgeCount(edgeCount);
                }}
              />
            </div>
          ) : (
            <div className="graphLoading">Knowledge Graph wird geladen …</div>
          )}
        </div>
      </section>

      <footer className="hermStatusbar">
        <span>Bible Universe · Deutsche Oberfläche · NWT über JW.org/WOL</span>
        <span>Visualisierungsarchitektur adaptiert aus Hermeneutica (MIT)</span>
      </footer>
    </main>
  );
}
