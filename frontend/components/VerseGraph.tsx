"use client";

import { Line, OrbitControls, Stars } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";

type GraphNode = {
  id: string;
  verse_id: number;
  label: string;
  role: "focus" | "connected";
};

type GraphEdge = {
  id: string;
  source: string;
  target: string;
  cross_reference_id: number;
  native_category: string;
  relation_type: string | null;
  provenance_level: string;
  confidence: number;
};

export type VerseGraphData = {
  focus: {
    id: number;
    reference: string;
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
};

type PositionedNode = GraphNode & {
  position: [number, number, number];
};

function GraphNodeMesh({
  node,
  selected,
  onSelect,
}: {
  node: PositionedNode;
  selected: boolean;
  onSelect: (node: PositionedNode) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const focus = node.role === "focus";
  const radius = focus ? 0.58 : 0.36;
  const emissiveIntensity = selected ? 2.7 : hovered ? 2.1 : focus ? 1.8 : 1.2;

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(node);
  };

  return (
    <group position={node.position}>
      <mesh
        onClick={handleClick}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "default";
        }}
      >
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial
          color={focus ? "#86b7ff" : "#b69cff"}
          emissive={focus ? "#3478f6" : "#7c3aed"}
          emissiveIntensity={emissiveIntensity}
          roughness={0.22}
          metalness={0.12}
        />
      </mesh>
      <pointLight
        intensity={focus ? 4.5 : 2.2}
        distance={focus ? 7 : 4.5}
        color={focus ? "#6aa7ff" : "#9f7aea"}
      />
    </group>
  );
}

export default function VerseGraph({ data }: { data: VerseGraphData }) {
  const [selectedId, setSelectedId] = useState(`verse:${data.focus.id}`);

  const positionedNodes = useMemo<PositionedNode[]>(() => {
    const focusNode = data.nodes.find((node) => node.role === "focus");
    const connected = data.nodes.filter((node) => node.role !== "focus");
    const result: PositionedNode[] = [];

    if (focusNode) {
      result.push({ ...focusNode, position: [0, 0, 0] });
    }

    const radius = connected.length <= 4 ? 4.2 : 5.2;
    connected.forEach((node, index) => {
      const angle = (index / Math.max(connected.length, 1)) * Math.PI * 2;
      const y = Math.sin(angle * 1.7) * 1.5;
      const z = Math.cos(angle * 0.8) * 1.25;
      result.push({
        ...node,
        position: [Math.cos(angle) * radius, y, Math.sin(angle) * radius + z],
      });
    });

    return result;
  }, [data]);

  const nodeMap = useMemo(
    () => new Map(positionedNodes.map((node) => [node.id, node])),
    [positionedNodes],
  );

  const selectedNode = nodeMap.get(selectedId) ?? positionedNodes[0];

  return (
    <div className="graphExperience">
      <div className="graphCanvasWrap">
        <Canvas camera={{ position: [0, 2.3, 10.5], fov: 48 }} dpr={[1, 1.75]}>
          <color attach="background" args={["#03050b"]} />
          <fog attach="fog" args={["#03050b", 12, 28]} />
          <ambientLight intensity={0.35} />
          <directionalLight position={[6, 8, 8]} intensity={1.1} color="#c8d8ff" />
          <Stars radius={35} depth={18} count={950} factor={2.2} saturation={0.45} fade speed={0.25} />

          {data.edges.map((edge) => {
            const source = nodeMap.get(edge.source);
            const target = nodeMap.get(edge.target);
            if (!source || !target) return null;
            return (
              <Line
                key={edge.id}
                points={[source.position, target.position]}
                color="#6f8fd6"
                lineWidth={1.35}
                transparent
                opacity={0.72}
              />
            );
          })}

          {positionedNodes.map((node) => (
            <GraphNodeMesh
              key={node.id}
              node={node}
              selected={node.id === selectedId}
              onSelect={(next) => setSelectedId(next.id)}
            />
          ))}

          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.075}
            minDistance={4.5}
            maxDistance={18}
            autoRotate
            autoRotateSpeed={0.32}
          />
        </Canvas>

        <div className="graphLabels" aria-hidden="true">
          {positionedNodes.map((node) => (
            <span
              key={node.id}
              className={`graphLabelStatic ${node.role === "focus" ? "focus" : ""} ${node.id === selectedId ? "selected" : ""}`}
            >
              {node.label}
            </span>
          ))}
        </div>

        <div className="graphHint">Ziehen zum Drehen · Mausrad zum Zoomen · Knoten anklicken</div>
      </div>

      <aside className="graphInspector">
        <p className="eyebrow">Live Graph Inspector</p>
        <h3>{selectedNode?.label ?? data.focus.reference}</h3>
        <dl>
          <div>
            <dt>Vers-ID</dt>
            <dd>{selectedNode?.verse_id ?? data.focus.id}</dd>
          </div>
          <div>
            <dt>Rolle</dt>
            <dd>{selectedNode?.role === "focus" ? "Fokus-Knoten" : "Verbundener Knoten"}</dd>
          </div>
          <div>
            <dt>Quelle</dt>
            <dd>NWT Studienausgabe / WOL</dd>
          </div>
          <div>
            <dt>Graph</dt>
            <dd>{data.edges.length} verifizierte Kanten</dd>
          </div>
        </dl>
        <p className="inspectorNote">
          Dies ist unser erster echter 3D-Ausschnitt des Knowledge Graph. Die Positionen sind vorerst bewusst lokal und deterministisch; später übernimmt die globale Galaxy-Layout-Engine.
        </p>
      </aside>
    </div>
  );
}
