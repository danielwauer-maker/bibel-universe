"use client";

import { OrbitControls, Sparkles, Stars, Text } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";

type GalaxyStats = {
  books: number;
  chapters: number;
  verses: number;
  cross_references: number;
};

type GalaxyRegion = {
  id: string;
  label: string;
  color: string;
  glow: string;
  position: [number, number, number];
  scale: [number, number, number];
  description: string;
};

const REGIONS: GalaxyRegion[] = [
  {
    id: "god",
    label: "Gott & Göttlichkeit",
    color: "#F4C86A",
    glow: "#FFD98A",
    position: [0.3, 2.4, -1.2],
    scale: [4.8, 2.8, 2.4],
    description: "Aussagen über Jehova, seine Eigenschaften, seinen Namen und seine Herrschaft.",
  },
  {
    id: "wisdom",
    label: "Weisheit & Poesie",
    color: "#B56CFF",
    glow: "#D6A8FF",
    position: [-3.6, 2.7, -1.6],
    scale: [4.3, 2.8, 2.2],
    description: "Weisheit, poetische Bilder, Gebet, Lobpreis und Lebensgrundsätze.",
  },
  {
    id: "law",
    label: "Gesetz & Bund",
    color: "#4EA1FF",
    glow: "#9DCCFF",
    position: [4.3, 1.4, -1.4],
    scale: [4.3, 2.7, 2.2],
    description: "Gesetz, Bündnisse, Gebote, göttliche Maßstäbe und spätere Anwendungen.",
  },
  {
    id: "history",
    label: "Geschichte & Königreiche",
    color: "#54D5D8",
    glow: "#9AFFFF",
    position: [-4.5, -0.5, -0.6],
    scale: [5.0, 3.0, 2.5],
    description: "Historische Ereignisse, Könige, Völker, Reisen, Exil und Rückkehr.",
  },
  {
    id: "jesus",
    label: "Jesus & Evangelien",
    color: "#FF6F91",
    glow: "#FFA6BD",
    position: [-2.1, -3.0, -0.2],
    scale: [5.2, 3.1, 2.4],
    description: "Leben Jesu, Evangelienberichte, Wunder, Lehren, Tod und Auferstehung.",
  },
  {
    id: "prophecy",
    label: "Prophezeiung & Gericht",
    color: "#FF5E5E",
    glow: "#FF9B92",
    position: [4.3, -0.9, -0.4],
    scale: [4.8, 2.9, 2.5],
    description: "Prophezeiungen, Erfüllungen, Gerichtsbotschaften und Zukunftsaussagen.",
  },
  {
    id: "faith",
    label: "Glaube & Praxis",
    color: "#7EDC87",
    glow: "#B9F4BF",
    position: [3.1, -3.0, -0.1],
    scale: [4.6, 2.8, 2.2],
    description: "Glaube, christliche Lebensführung, Liebe, Hoffnung und praktische Anwendung.",
  },
  {
    id: "congregation",
    label: "Versammlung & Mission",
    color: "#8A78FF",
    glow: "#BEB2FF",
    position: [0.3, -4.3, 0.3],
    scale: [4.6, 2.4, 2.3],
    description: "Versammlung, Predigtdienst, Mission, Organisation und Zusammenarbeit.",
  },
];

function GalaxyCloud({ region, selected }: { region: GalaxyRegion; selected: boolean }) {
  const count = selected ? 430 : 280;
  const labelOffset = region.id === "congregation" ? -1.35 : 1.55;

  return (
    <group position={region.position}>
      <Sparkles
        count={count}
        speed={0.12}
        opacity={selected ? 1 : 0.82}
        scale={region.scale}
        size={selected ? 4.2 : 3.1}
        noise={1.25}
        color={region.color}
      />
      <mesh scale={selected ? 1.35 : 1}>
        <sphereGeometry args={[0.16, 24, 24]} />
        <meshBasicMaterial color={region.glow} transparent opacity={0.95} />
      </mesh>
      <pointLight color={region.color} intensity={selected ? 3.2 : 1.55} distance={5.8} />

      <Text
        position={[0, labelOffset, 0.35]}
        fontSize={selected ? 0.28 : 0.23}
        color={region.glow}
        anchorX="center"
        anchorY="middle"
        textAlign="center"
        outlineWidth={0.012}
        outlineColor="#03050b"
        fillOpacity={selected ? 1 : 0.92}
        maxWidth={4.6}
      >
        {region.label.toUpperCase()}
      </Text>
    </group>
  );
}

export default function GalaxyView({ stats }: { stats: GalaxyStats | null }) {
  const [selectedId, setSelectedId] = useState("jesus");
  const selected = useMemo(
    () => REGIONS.find((region) => region.id === selectedId) ?? REGIONS[0],
    [selectedId],
  );

  return (
    <div className="galaxyWorkspace">
      <aside className="galaxyRail">
        <div className="galaxyBrandMark">✦</div>
        <div className="galaxyTotals">
          <strong>{stats?.books ?? 66}</strong><span>Bücher</span>
          <strong>{stats?.chapters?.toLocaleString("de-DE") ?? "1.189"}</strong><span>Kapitel</span>
          <strong>{stats?.verses?.toLocaleString("de-DE") ?? "31.102"}</strong><span>Verse</span>
        </div>
        <nav className="galaxySideNav" aria-label="Bible Universe Ansichten">
          <button type="button" className="active"><span>◎</span><div><b>Galaxy View</b><small>Die Bibel als semantische Galaxie</small></div></button>
          <button type="button"><span>⌘</span><div><b>Knowledge Graph</b><small>Personen, Orte, Themen und Beziehungen</small></div></button>
          <button type="button"><span>◷</span><div><b>Zeitlinie</b><small>Biblische Geschichte im Kontext</small></div></button>
          <button type="button"><span>⌖</span><div><b>Karten</b><small>Orte und Reisen erkunden</small></div></button>
        </nav>
      </aside>

      <section className="galaxyStage">
        <Canvas camera={{ position: [0, 0, 13.5], fov: 48 }} dpr={[1, 1.5]}>
          <color attach="background" args={["#02040a"]} />
          <fog attach="fog" args={["#02040a", 11, 28]} />
          <ambientLight intensity={0.18} />
          <Stars radius={52} depth={30} count={2200} factor={2.1} saturation={0.75} fade speed={0.15} />
          {REGIONS.map((region) => (
            <GalaxyCloud key={region.id} region={region} selected={region.id === selectedId} />
          ))}
          <OrbitControls enableDamping dampingFactor={0.065} minDistance={7} maxDistance={24} autoRotate autoRotateSpeed={0.08} />
        </Canvas>

        <div className="galaxyLegend">
          <strong>Semantische Regionen</strong>
          {REGIONS.map((region) => (
            <button
              key={region.id}
              type="button"
              className={selectedId === region.id ? "active" : ""}
              onClick={() => setSelectedId(region.id)}
            >
              <span style={{ background: region.color }} />{region.label}
            </button>
          ))}
        </div>

        <div className="galaxyControls"><span>✦ Orbit</span><span>✋ Pan</span><span>⌕ Zoom</span><span>↻ Reset</span><b>3D⌄</b></div>
        <div className="galaxyPrototypeBadge">Strukturvorschau · semantische Klassifizierung wird schrittweise aufgebaut</div>
      </section>

      <aside className="galaxyInspectorPanel">
        <div className="galaxyTabs"><button className="active">Erkunden</button><button>Suche</button><button>Filter</button></div>
        <div className="galaxySearch">⌕ Verse, Themen, Personen, Orte …</div>

        <div className="galaxySelectedCard">
          <span className="galaxySelectedEyebrow">Ausgewählte Region</span>
          <div className="galaxySelectedTitle"><i style={{ background: selected.color }} />{selected.label}</div>
          <p>{selected.description}</p>
          <div className="galaxyTags"><span>Themen</span><span>Verse</span><span>Ereignisse</span></div>
        </div>

        <div className="galaxyInfoCard">
          <h4>Über die Galaxy View</h4>
          <p>
            Die komplette Bibel wird später als räumliche semantische Landschaft aufgebaut. Von weit außen erscheinen Regionen und Cluster; beim Hineinzoomen werden Bücher, Kapitel und schließlich einzelne Verse sichtbar.
          </p>
        </div>

        <div className="galaxyInfoCard compact">
          <h4>Aktuelle Datenbasis</h4>
          <dl>
            <div><dt>Vers-Knoten</dt><dd>{stats?.verses?.toLocaleString("de-DE") ?? "31.102"}</dd></div>
            <div><dt>Beziehungen</dt><dd>{stats?.cross_references?.toLocaleString("de-DE") ?? "–"}</dd></div>
            <div><dt>LOD</dt><dd>Region → Cluster → Vers</dd></div>
          </dl>
        </div>
      </aside>
    </div>
  );
}
