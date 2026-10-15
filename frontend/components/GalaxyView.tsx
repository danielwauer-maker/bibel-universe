"use client";

import { Line, OrbitControls, Sparkles, Stars, Text } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import { AdditiveBlending } from "three";

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

type GalaxyLink = {
  source: string;
  target: string;
  strength: number;
};

type Subcluster = {
  id: string;
  label: string;
  position: [number, number, number];
  scale: [number, number, number];
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

const LINKS: GalaxyLink[] = [
  { source: "god", target: "law", strength: 1 },
  { source: "god", target: "wisdom", strength: 0.72 },
  { source: "god", target: "prophecy", strength: 0.82 },
  { source: "law", target: "history", strength: 0.76 },
  { source: "law", target: "jesus", strength: 0.72 },
  { source: "history", target: "prophecy", strength: 0.74 },
  { source: "history", target: "jesus", strength: 0.66 },
  { source: "prophecy", target: "jesus", strength: 1 },
  { source: "jesus", target: "faith", strength: 0.92 },
  { source: "jesus", target: "congregation", strength: 0.94 },
  { source: "faith", target: "congregation", strength: 0.82 },
  { source: "wisdom", target: "faith", strength: 0.55 },
];

const JESUS_SUBCLUSTERS: Subcluster[] = [
  { id: "birth", label: "Geburt & frühes Leben", position: [-1.45, 0.35, 0.4], scale: [1.45, 0.9, 0.85] },
  { id: "teachings", label: "Lehren", position: [-0.55, 0.95, -0.15], scale: [1.55, 0.95, 0.85] },
  { id: "miracles", label: "Wunder", position: [0.75, 0.55, 0.2], scale: [1.5, 0.9, 0.85] },
  { id: "transfiguration", label: "Umgestaltung", position: [1.15, -0.35, 0.5], scale: [1.35, 0.82, 0.8] },
  { id: "death", label: "Tod", position: [0.15, -0.95, 0.15], scale: [1.35, 0.85, 0.8] },
  { id: "resurrection", label: "Auferstehung", position: [-1.05, -0.7, -0.15], scale: [1.45, 0.86, 0.82] },
];

function GalaxyCloud({
  region,
  selected,
  onSelect,
}: {
  region: GalaxyRegion;
  selected: boolean;
  onSelect: () => void;
}) {
  const labelOffset = region.id === "congregation" ? -1.48 : 1.58;

  return (
    <group position={region.position}>
      <Sparkles
        count={selected ? 560 : 370}
        speed={0.07}
        opacity={selected ? 0.98 : 0.82}
        scale={region.scale}
        size={selected ? 4.7 : 3.25}
        noise={1.08}
        color={region.color}
      />
      <Sparkles
        count={selected ? 210 : 125}
        speed={0.025}
        opacity={selected ? 0.56 : 0.32}
        scale={[region.scale[0] * 1.34, region.scale[1] * 1.18, region.scale[2] * 1.48]}
        size={selected ? 2.9 : 2.05}
        noise={1.9}
        color={region.glow}
      />

      <mesh scale={selected ? 1.28 : 0.96} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
        <sphereGeometry args={[0.15, 24, 24]} />
        <meshBasicMaterial color={region.glow} transparent opacity={0.98} />
      </mesh>
      <mesh scale={selected ? 3.8 : 2.55} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
        <sphereGeometry args={[0.15, 20, 20]} />
        <meshBasicMaterial
          color={region.color}
          transparent
          opacity={selected ? 0.16 : 0.07}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
      <pointLight color={region.color} intensity={selected ? 5.2 : 2.0} distance={7.6} />

      <Text
        position={[0, labelOffset, 0.5]}
        fontSize={selected ? 0.31 : 0.245}
        color={region.glow}
        anchorX="center"
        anchorY="middle"
        textAlign="center"
        outlineWidth={0.018}
        outlineColor="#02040a"
        fillOpacity={selected ? 1 : 0.98}
        maxWidth={4.8}
      >
        {region.label.toUpperCase()}
      </Text>

      {selected && region.id === "jesus" ? (
        <group>
          {JESUS_SUBCLUSTERS.map((cluster) => (
            <group key={cluster.id} position={cluster.position}>
              <Sparkles
                count={72}
                speed={0.04}
                opacity={0.92}
                scale={cluster.scale}
                size={2.1}
                noise={1.05}
                color={region.glow}
              />
              <mesh>
                <sphereGeometry args={[0.055, 16, 16]} />
                <meshBasicMaterial color="#FFE1E9" transparent opacity={0.95} />
              </mesh>
              <pointLight color={region.color} intensity={0.8} distance={1.7} />
              <Text
                position={[0, 0.5, 0.28]}
                fontSize={0.115}
                color="#FFD6E2"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.009}
                outlineColor="#02040a"
              >
                {cluster.label}
              </Text>
            </group>
          ))}
        </group>
      ) : null}
    </group>
  );
}

function GalaxyConnections({ selectedId }: { selectedId: string }) {
  const regionMap = useMemo(() => new Map(REGIONS.map((region) => [region.id, region])), []);

  return (
    <>
      {LINKS.map((link, index) => {
        const source = regionMap.get(link.source);
        const target = regionMap.get(link.target);
        if (!source || !target) return null;

        const active = link.source === selectedId || link.target === selectedId;
        const midpoint: [number, number, number] = [
          (source.position[0] + target.position[0]) / 2,
          (source.position[1] + target.position[1]) / 2 + (index % 2 === 0 ? 0.26 : -0.22),
          (source.position[2] + target.position[2]) / 2 + (index % 3 - 1) * 0.35,
        ];

        return (
          <Line
            key={`${link.source}:${link.target}`}
            points={[source.position, midpoint, target.position]}
            color={active ? "#A9CFFF" : "#21385E"}
            lineWidth={active ? 1.05 + link.strength * 0.45 : 0.5 + link.strength * 0.25}
            transparent
            opacity={active ? 0.2 + link.strength * 0.17 : 0.055 + link.strength * 0.06}
          />
        );
      })}
    </>
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
          <ambientLight intensity={0.16} />
          <Stars radius={54} depth={32} count={2900} factor={2.12} saturation={0.84} fade speed={0.11} />
          <Stars radius={27} depth={19} count={1050} factor={1.12} saturation={0.48} fade speed={0.055} />

          <GalaxyConnections selectedId={selectedId} />
          {REGIONS.map((region) => (
            <GalaxyCloud
              key={region.id}
              region={region}
              selected={region.id === selectedId}
              onSelect={() => setSelectedId(region.id)}
            />
          ))}
          <OrbitControls enableDamping dampingFactor={0.065} minDistance={7} maxDistance={24} autoRotate autoRotateSpeed={0.052} />
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
