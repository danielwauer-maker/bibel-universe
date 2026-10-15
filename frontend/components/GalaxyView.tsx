"use client";

import { Line, OrbitControls, Stars, Text } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useState } from "react";
import InstancedVerseField, { type VerseFieldData } from "./InstancedVerseField";

type GalaxyStats = {
  books: number;
  chapters: number;
  verses: number;
  cross_references: number;
};

type Book = {
  id: number;
  abbreviation: string;
  name_de: string;
};

type VerseText = {
  verse_id: number;
  reference: string;
  text: string;
  source_url: string;
};

type GraphNode = {
  id: string;
  verse_id: number;
  label: string;
  role: string;
};

type GraphEdge = {
  id: string;
  source: string;
  target: string;
  relation_type: string | null;
  relation_types?: string[];
  has_direct_reference?: boolean;
  evidence_count?: number;
};

type VerseGraph = {
  focus: { id: number; reference: string };
  nodes: GraphNode[];
  edges: GraphEdge[];
};

type HoverState = {
  index: number;
  x: number;
  y: number;
};

const REGION_META = [
  { label: "Gott & Göttlichkeit", color: "#F6C85F", glow: "#FFE4A0" },
  { label: "Weisheit & Poesie", color: "#B86CFF", glow: "#E0B8FF" },
  { label: "Gesetz & Bund", color: "#4FA8FF", glow: "#A6D7FF" },
  { label: "Geschichte & Königreiche", color: "#55D8D6", glow: "#A4FFFF" },
  { label: "Jesus & Evangelien", color: "#FF7096", glow: "#FFB2C7" },
  { label: "Prophezeiung & Gericht", color: "#FF625F", glow: "#FFAAA4" },
  { label: "Glaube & Praxis", color: "#79E38B", glow: "#B9F8C3" },
  { label: "Versammlung & Mission", color: "#8B7CFF", glow: "#C4BAFF" },
] as const;

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function parseGalaxyBinary(buffer: ArrayBuffer): VerseFieldData {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
  if (magic !== "BUG1") throw new Error(`Unbekanntes Galaxy-Format: ${magic}`);
  const recordFloats = view.getUint32(8, true);
  const count = view.getUint32(12, true);
  if (recordFloats !== 9) throw new Error(`Unerwartete Datensatzbreite: ${recordFloats}`);

  const positions = new Float32Array(count * 3);
  const verseIds = new Uint32Array(count);
  const bookIds = new Uint16Array(count);
  const chapters = new Uint16Array(count);
  const verses = new Uint16Array(count);
  const degrees = new Uint16Array(count);
  const regions = new Uint8Array(count);
  let offset = 16;

  for (let i = 0; i < count; i++) {
    positions[i * 3] = view.getFloat32(offset, true);
    positions[i * 3 + 1] = view.getFloat32(offset + 4, true);
    positions[i * 3 + 2] = view.getFloat32(offset + 8, true);
    verseIds[i] = Math.round(view.getFloat32(offset + 12, true));
    bookIds[i] = Math.round(view.getFloat32(offset + 16, true));
    chapters[i] = Math.round(view.getFloat32(offset + 20, true));
    verses[i] = Math.round(view.getFloat32(offset + 24, true));
    degrees[i] = Math.round(view.getFloat32(offset + 28, true));
    regions[i] = Math.round(view.getFloat32(offset + 32, true));
    offset += 36;
  }

  return { count, positions, verseIds, bookIds, chapters, verses, degrees, regions };
}

function edgeKind(edge: GraphEdge): "direct" | "same" | "parallel" | "semantic" {
  const types = edge.relation_types ?? (edge.relation_type ? [edge.relation_type] : []);
  if (edge.has_direct_reference) return "direct";
  if (types.includes("PARALLEL_ACCOUNT")) return "parallel";
  if (types.includes("SAME_EVENT")) return "same";
  return "semantic";
}

const EDGE_META = {
  direct: { label: "Direkte Querverweise", color: "#69B7FF" },
  same: { label: "Gleiches Ereignis", color: "#59E4DC" },
  parallel: { label: "Parallelberichte", color: "#C080FF" },
  semantic: { label: "Weitere semantische Beziehungen", color: "#F3C969" },
};

function VerseArcs({ data, graph, selectedVerseId }: { data: VerseFieldData; graph: VerseGraph | null; selectedVerseId: number | null }) {
  const positionMap = useMemo(() => {
    const map = new Map<number, [number, number, number]>();
    for (let i = 0; i < data.count; i++) {
      map.set(data.verseIds[i], [data.positions[i * 3], data.positions[i * 3 + 1], data.positions[i * 3 + 2]]);
    }
    return map;
  }, [data]);

  if (!graph || !selectedVerseId) return null;
  const start = positionMap.get(selectedVerseId);
  if (!start) return null;

  return (
    <>
      {graph.edges.map((edge, index) => {
        const sourceId = Number(edge.source.replace("verse:", ""));
        const targetId = Number(edge.target.replace("verse:", ""));
        const neighborId = sourceId === selectedVerseId ? targetId : targetId === selectedVerseId ? sourceId : null;
        if (!neighborId) return null;
        const end = positionMap.get(neighborId);
        if (!end) return null;
        const kind = edgeKind(edge);
        const color = EDGE_META[kind].color;
        const middle: [number, number, number] = [
          (start[0] + end[0]) / 2,
          (start[1] + end[1]) / 2 + 0.6 + (index % 3) * 0.18,
          (start[2] + end[2]) / 2 + 0.35,
        ];
        return (
          <Line
            key={edge.id}
            points={[start, middle, end]}
            color={color}
            lineWidth={kind === "direct" ? 1.6 : 1.25}
            transparent
            opacity={0.78}
          />
        );
      })}
    </>
  );
}

export default function GalaxyView({ stats }: { stats: GalaxyStats | null }) {
  const [field, setField] = useState<VerseFieldData | null>(null);
  const [books, setBooks] = useState<Map<number, Book>>(new Map());
  const [hover, setHover] = useState<HoverState | null>(null);
  const [selectedVerseId, setSelectedVerseId] = useState<number | null>(23702);
  const [verseText, setVerseText] = useState<VerseText | null>(null);
  const [graph, setGraph] = useState<VerseGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8010";

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch(`${apiBase}/api/galaxy/verses.bin`, { signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error(`Galaxy API ${response.status}`);
        return parseGalaxyBinary(await response.arrayBuffer());
      }),
      fetch(`${apiBase}/api/books`, { signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error(`Books API ${response.status}`);
        return response.json() as Promise<Book[]>;
      }),
    ])
      .then(([galaxy, bookRows]) => {
        setField(galaxy);
        setBooks(new Map(bookRows.map((book) => [book.id, book])));
        setLoading(false);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setLoadError(error.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [apiBase]);

  useEffect(() => {
    if (!selectedVerseId) return;
    const controller = new AbortController();
    setVerseText(null);
    setGraph(null);
    Promise.all([
      fetch(`${apiBase}/api/verses/${selectedVerseId}/text`, { signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error(`Verse API ${response.status}`);
        return response.json() as Promise<VerseText>;
      }),
      fetch(`${apiBase}/api/graph/verse/${selectedVerseId}`, { signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error(`Graph API ${response.status}`);
        return response.json() as Promise<VerseGraph>;
      }),
    ])
      .then(([text, graphPayload]) => {
        setVerseText(text);
        setGraph(graphPayload);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") console.error(error);
      });
    return () => controller.abort();
  }, [apiBase, selectedVerseId]);

  const colors = useMemo(() => {
    if (!field) return new Float32Array(0);
    const next = new Float32Array(field.count * 3);
    const palette = REGION_META.map((item) => hexToRgb(item.color));
    for (let i = 0; i < field.count; i++) {
      const rgb = palette[field.regions[i] % palette.length];
      const degreeGlow = Math.min(field.degrees[i], 12) / 12;
      next[i * 3] = Math.min(1, rgb[0] + degreeGlow * 0.12);
      next[i * 3 + 1] = Math.min(1, rgb[1] + degreeGlow * 0.12);
      next[i * 3 + 2] = Math.min(1, rgb[2] + degreeGlow * 0.12);
    }
    return next;
  }, [field]);

  const verseIndex = useMemo(() => {
    if (!field) return new Map<number, number>();
    const map = new Map<number, number>();
    for (let i = 0; i < field.count; i++) map.set(field.verseIds[i], i);
    return map;
  }, [field]);

  const regionCenters = useMemo(() => {
    if (!field) return [] as { id: number; position: [number, number, number] }[];
    const sums = REGION_META.map(() => ({ x: 0, y: 0, z: 0, n: 0 }));
    for (let i = 0; i < field.count; i++) {
      const region = field.regions[i] % REGION_META.length;
      sums[region].x += field.positions[i * 3];
      sums[region].y += field.positions[i * 3 + 1];
      sums[region].z += field.positions[i * 3 + 2];
      sums[region].n += 1;
    }
    return sums.map((sum, id) => ({
      id,
      position: [sum.x / Math.max(1, sum.n), sum.y / Math.max(1, sum.n) + 1.25, sum.z / Math.max(1, sum.n)] as [number, number, number],
    }));
  }, [field]);

  const referenceForIndex = useCallback((index: number) => {
    if (!field) return "";
    const book = books.get(field.bookIds[index]);
    return `${book?.abbreviation ?? field.bookIds[index]} ${field.chapters[index]}:${field.verses[index]}`;
  }, [books, field]);

  const handleHover = useCallback((index: number | null, screen?: { x: number; y: number }) => {
    if (index === null || !screen) {
      setHover(null);
      return;
    }
    setHover({ index, x: screen.x, y: screen.y });
  }, []);

  const handleClick = useCallback((index: number) => {
    if (!field) return;
    setSelectedVerseId(field.verseIds[index]);
  }, [field]);

  const groupedConnections = useMemo(() => {
    const groups: Record<keyof typeof EDGE_META, string[]> = { direct: [], same: [], parallel: [], semantic: [] };
    if (!graph || !selectedVerseId) return groups;
    const labels = new Map(graph.nodes.map((node) => [node.id, node.label]));
    for (const edge of graph.edges) {
      const sourceId = Number(edge.source.replace("verse:", ""));
      const targetId = Number(edge.target.replace("verse:", ""));
      const neighborKey = sourceId === selectedVerseId ? edge.target : targetId === selectedVerseId ? edge.source : null;
      if (!neighborKey) continue;
      const label = labels.get(neighborKey);
      if (!label) continue;
      const types = edge.relation_types ?? (edge.relation_type ? [edge.relation_type] : []);
      if (edge.has_direct_reference) groups.direct.push(label);
      if (types.includes("SAME_EVENT")) groups.same.push(label);
      if (types.includes("PARALLEL_ACCOUNT")) groups.parallel.push(label);
      if (!edge.has_direct_reference && !types.includes("SAME_EVENT") && !types.includes("PARALLEL_ACCOUNT")) groups.semantic.push(label);
    }
    for (const key of Object.keys(groups) as (keyof typeof groups)[]) groups[key] = [...new Set(groups[key])];
    return groups;
  }, [graph, selectedVerseId]);

  const selectedIndex = selectedVerseId ? verseIndex.get(selectedVerseId) : undefined;
  const selectedRegion = selectedIndex === undefined || !field ? null : REGION_META[field.regions[selectedIndex] % REGION_META.length];

  return (
    <div className="galaxyWorkspace galaxyEngineWorkspace">
      <aside className="galaxyRail">
        <div className="galaxyBrandMark">✦</div>
        <div className="galaxyTotals">
          <strong>{stats?.books ?? 66}</strong><span>Bücher</span>
          <strong>{stats?.chapters?.toLocaleString("de-DE") ?? "1.189"}</strong><span>Kapitel</span>
          <strong>{field?.count.toLocaleString("de-DE") ?? "31.102"}</strong><span>Verspunkte</span>
        </div>
        <nav className="galaxySideNav" aria-label="Bible Universe Ansichten">
          <button type="button" className="active"><span>◎</span><div><b>Galaxy View</b><small>31.102 Verse räumlich erkunden</small></div></button>
          <button type="button"><span>⌘</span><div><b>Knowledge Graph</b><small>Beziehungen im lokalen Netz</small></div></button>
          <button type="button"><span>◷</span><div><b>Zeitlinie</b><small>Biblische Geschichte im Kontext</small></div></button>
          <button type="button"><span>⌖</span><div><b>Karten</b><small>Orte und Reisen erkunden</small></div></button>
        </nav>
      </aside>

      <section className="galaxyStage galaxyEngineStage">
        {loading ? <div className="galaxyEngineLoading">31.102 Verspunkte werden auf die GPU geladen …</div> : null}
        {loadError ? <div className="galaxyEngineLoading error">Galaxy konnte nicht geladen werden: {loadError}</div> : null}
        {field ? (
          <Canvas camera={{ position: [0, 0, 22], fov: 48 }} dpr={[1, 1.5]}>
            <color attach="background" args={["#02040a"]} />
            <fog attach="fog" args={["#02040a", 20, 42]} />
            <ambientLight intensity={0.22} />
            <Stars radius={60} depth={36} count={2600} factor={1.75} saturation={0.72} fade speed={0.08} />
            <InstancedVerseField
              data={field}
              colors={colors}
              selectedVerseId={selectedVerseId}
              onHover={handleHover}
              onClick={handleClick}
            />
            <VerseArcs data={field} graph={graph} selectedVerseId={selectedVerseId} />
            {regionCenters.map(({ id, position }) => (
              <Text
                key={id}
                position={position}
                fontSize={0.42}
                color={REGION_META[id].glow}
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.018}
                outlineColor="#02040a"
                maxWidth={6}
              >
                {REGION_META[id].label.toUpperCase()}
              </Text>
            ))}
            <OrbitControls enableDamping dampingFactor={0.06} minDistance={6} maxDistance={44} />
          </Canvas>
        ) : null}

        {hover && field ? (
          <div className="galaxyVerseHover" style={{ left: hover.x + 9, top: hover.y + 9 }}>
            <strong>{referenceForIndex(hover.index)}</strong>
            <span>{field.degrees[hover.index]} bekannte Beziehungen</span>
          </div>
        ) : null}

        <div className="galaxyLegend galaxyEngineLegend">
          <strong>Visuelle Regionen</strong>
          {REGION_META.map((region) => (
            <div key={region.label}><span style={{ background: region.color }} />{region.label}</div>
          ))}
        </div>
        <div className="galaxyControls"><span>✦ Orbit</span><span>✋ Pan</span><span>⌕ Zoom</span><b>3D</b></div>
        <div className="galaxyPrototypeBadge">GPU Engine V1 · 31.102 echte Vers-Knoten · UMAP folgt als semantisches Layout</div>
      </section>

      <aside className="galaxyInspectorPanel galaxyVerseInspector">
        <div className="galaxyTabs"><button className="active">Vers</button><button>Beziehungen</button><button>Notizen</button></div>
        <div className="galaxySearch">⌕ Verse, Themen, Personen, Orte …</div>

        <div className="galaxySelectedCard verseSelectionCard">
          <span className="galaxySelectedEyebrow">Ausgewählter Vers</span>
          <div className="galaxySelectedTitle">
            <i style={{ background: selectedRegion?.color ?? "#79b6ff" }} />
            {verseText?.reference ?? graph?.focus.reference ?? "Vers auswählen"}
          </div>
          {verseText ? <p className="galaxyVerseText">{verseText.text}</p> : <p>Wähle einen Lichtpunkt in der Galaxie aus.</p>}
          {verseText ? <a className="sourceLink" href={verseText.source_url} target="_blank" rel="noreferrer">Quelle auf JW.org / WOL öffnen ↗</a> : null}
        </div>

        <div className="galaxyInfoCard relationshipOverview">
          <h4>Alle sichtbaren Verbindungen</h4>
          {(Object.keys(EDGE_META) as (keyof typeof EDGE_META)[]).map((kind) => {
            const items = groupedConnections[kind];
            if (!items.length) return null;
            return (
              <section className="relationshipGroup" key={kind}>
                <div className="relationshipGroupTitle">
                  <i style={{ background: EDGE_META[kind].color }} />
                  <strong>{EDGE_META[kind].label}</strong>
                  <span>{items.length}</span>
                </div>
                <div className="relationshipChips">
                  {items.map((label) => {
                    const node = graph?.nodes.find((candidate) => candidate.label === label);
                    return (
                      <button key={`${kind}:${label}`} type="button" onClick={() => node && setSelectedVerseId(node.verse_id)}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {graph && graph.edges.length === 0 ? <p className="emptyRelationship">Für diesen Vers sind aktuell noch keine Beziehungen importiert.</p> : null}
        </div>

        <div className="galaxyInfoCard compact">
          <h4>Galaxy Engine</h4>
          <dl>
            <div><dt>Verspunkte</dt><dd>{field?.count.toLocaleString("de-DE") ?? "–"}</dd></div>
            <div><dt>Rendering</dt><dd>GPU Instancing</dd></div>
            <div><dt>Hover</dt><dd>Screen-Space</dd></div>
            <div><dt>Layout</dt><dd>stabiler V1-Fallback → UMAP</dd></div>
          </dl>
        </div>
      </aside>
    </div>
  );
}
