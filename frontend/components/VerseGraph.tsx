"use client";

import { Line, OrbitControls, Stars } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { AdditiveBlending, Group, Mesh, Vector3 } from "three";

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
  cross_reference_ids?: number[];
  native_category: string;
  relation_type: string | null;
  provenance_level: string;
  confidence: number;
  evidence_count?: number;
  bidirectional?: boolean;
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

type VerseTextData = {
  verse_id: number;
  reference: string;
  text: string;
  source_url: string;
  source_label: string;
  storage_mode: string;
};

type ControlsHandle = {
  target: Vector3;
  update: () => void;
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
  const groupRef = useRef<Group>(null);
  const focus = node.role === "focus";
  const radius = focus ? 0.54 : 0.32;
  const emissiveIntensity = selected ? 3.2 : hovered ? 2.45 : focus ? 2.0 : 1.35;

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const pulse = selected
      ? 1 + Math.sin(clock.elapsedTime * 3.2) * 0.055
      : 1 + Math.sin(clock.elapsedTime * 1.8 + node.verse_id * 0.01) * 0.018;
    groupRef.current.scale.setScalar(pulse);
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(node);
  };

  return (
    <group ref={groupRef} position={node.position}>
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
        <sphereGeometry args={[radius, 36, 36]} />
        <meshStandardMaterial
          color={focus ? "#8fc5ff" : "#c197ff"}
          emissive={focus ? "#3478f6" : "#8b3cf6"}
          emissiveIntensity={emissiveIntensity}
          roughness={0.18}
          metalness={0.1}
        />
      </mesh>

      <mesh scale={selected ? 1.9 : focus ? 1.55 : 1.4}>
        <sphereGeometry args={[radius, 28, 28]} />
        <meshBasicMaterial
          color={focus ? "#5ea1ff" : "#aa66ff"}
          transparent
          opacity={selected ? 0.16 : 0.08}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>

      <pointLight
        intensity={selected ? 6.4 : focus ? 4.8 : 2.5}
        distance={selected ? 9 : focus ? 7 : 4.8}
        color={focus ? "#6aa7ff" : "#a970ff"}
      />
    </group>
  );
}

function AnimatedConnection({
  source,
  target,
  active,
  phase,
}: {
  source: [number, number, number];
  target: [number, number, number];
  active: boolean;
  phase: number;
}) {
  const orbRef = useRef<Mesh>(null);
  const start = useMemo(() => new Vector3(...source), [source]);
  const end = useMemo(() => new Vector3(...target), [target]);
  const current = useMemo(() => new Vector3(), []);

  useFrame(({ clock }) => {
    if (!orbRef.current) return;
    const speed = active ? 0.24 : 0.11;
    const t = (clock.elapsedTime * speed + phase) % 1;
    current.lerpVectors(start, end, t);
    orbRef.current.position.copy(current);
    const shimmer = active ? 0.11 + Math.sin(clock.elapsedTime * 5 + phase * 6) * 0.025 : 0.055;
    orbRef.current.scale.setScalar(Math.max(0.04, shimmer) / 0.08);
  });

  return (
    <mesh ref={orbRef}>
      <sphereGeometry args={[active ? 0.085 : 0.052, 16, 16]} />
      <meshBasicMaterial
        color={active ? "#d9ecff" : "#8ea9df"}
        transparent
        opacity={active ? 0.95 : 0.45}
        depthWrite={false}
        blending={AdditiveBlending}
      />
      {active ? <pointLight intensity={1.8} distance={2.4} color="#9fc8ff" /> : null}
    </mesh>
  );
}

function CameraJourney({
  target,
  journeyKey,
  controlsRef,
}: {
  target: [number, number, number];
  journeyKey: string;
  controlsRef: React.MutableRefObject<ControlsHandle | null>;
}) {
  const { camera } = useThree();
  const progress = useRef(1);
  const startCamera = useRef(new Vector3());
  const startTarget = useRef(new Vector3());
  const destination = useMemo(() => new Vector3(target[0], target[1], target[2]), [target]);
  const cameraDestination = useMemo(
    () => new Vector3(target[0] + 2.4, target[1] + 1.55, target[2] + 5.4),
    [target],
  );

  useEffect(() => {
    startCamera.current.copy(camera.position);
    startTarget.current.copy(controlsRef.current?.target ?? new Vector3());
    progress.current = 0;
  }, [camera, controlsRef, journeyKey]);

  useFrame((_, delta) => {
    if (progress.current >= 1) return;
    progress.current = Math.min(1, progress.current + delta / 1.65);
    const p = progress.current;
    const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

    camera.position.lerpVectors(startCamera.current, cameraDestination, eased);
    if (controlsRef.current) {
      controlsRef.current.target.lerpVectors(startTarget.current, destination, eased);
      controlsRef.current.update();
    }
  });

  return null;
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export default function VerseGraph({ data }: { data: VerseGraphData }) {
  const [graphData, setGraphData] = useState<VerseGraphData>(data);
  const [selectedId, setSelectedId] = useState(`verse:${data.focus.id}`);
  const [verseText, setVerseText] = useState<VerseTextData | null>(null);
  const [textStatus, setTextStatus] = useState<"loading" | "ready" | "error">("loading");
  const [journeyStatus, setJourneyStatus] = useState<"idle" | "travelling" | "error">("idle");
  const controlsRef = useRef<ControlsHandle | null>(null);
  const journeyRequest = useRef(0);

  useEffect(() => {
    setGraphData(data);
    setSelectedId(`verse:${data.focus.id}`);
  }, [data]);

  const positionedNodes = useMemo<PositionedNode[]>(() => {
    const focusNode = graphData.nodes.find((node) => node.role === "focus");
    const connected = graphData.nodes.filter((node) => node.role !== "focus");
    const result: PositionedNode[] = [];

    if (focusNode) result.push({ ...focusNode, position: [0, 0, 0] });

    const radius = connected.length <= 4 ? 4.2 : connected.length <= 10 ? 5.2 : 6.2;
    connected.forEach((node, index) => {
      const angle = (index / Math.max(connected.length, 1)) * Math.PI * 2;
      const layer = index % 3;
      const y = Math.sin(angle * 1.7) * (1.35 + layer * 0.55);
      const z = Math.cos(angle * 0.8) * (1.15 + layer * 0.38);
      const localRadius = radius + (layer - 1) * 0.75;
      result.push({
        ...node,
        position: [Math.cos(angle) * localRadius, y, Math.sin(angle) * localRadius + z],
      });
    });

    return result;
  }, [graphData]);

  const nodeMap = useMemo(
    () => new Map(positionedNodes.map((node) => [node.id, node])),
    [positionedNodes],
  );
  const selectedNode = nodeMap.get(selectedId) ?? positionedNodes[0];

  useEffect(() => {
    if (!selectedNode) return;
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8010";
    const controller = new AbortController();
    setVerseText(null);
    setTextStatus("loading");

    fetch(`${apiBase}/api/verses/${selectedNode.verse_id}/text`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Verse text API responded with ${response.status}`);
        return response.json() as Promise<VerseTextData>;
      })
      .then((payload) => {
        setVerseText(payload);
        setTextStatus("ready");
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setTextStatus("error");
      });

    return () => controller.abort();
  }, [selectedNode?.verse_id]);

  const selectedEdges = graphData.edges.filter(
    (edge) => edge.source === selectedId || edge.target === selectedId,
  );

  const travelToNode = async (next: PositionedNode) => {
    setSelectedId(next.id);

    if (next.verse_id === graphData.focus.id || journeyStatus === "travelling") return;

    const requestId = ++journeyRequest.current;
    setJourneyStatus("travelling");
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8010";

    try {
      const [response] = await Promise.all([
        fetch(`${apiBase}/api/graph/verse/${next.verse_id}`),
        wait(1450),
      ]);
      if (!response.ok) throw new Error(`Graph API responded with ${response.status}`);
      const payload = (await response.json()) as VerseGraphData;
      if (requestId !== journeyRequest.current) return;

      setGraphData(payload);
      setSelectedId(`verse:${payload.focus.id}`);
      setJourneyStatus("idle");
    } catch {
      if (requestId !== journeyRequest.current) return;
      setJourneyStatus("error");
    }
  };

  return (
    <div className="graphExperience">
      <div className="graphCanvasWrap">
        <Canvas camera={{ position: [0, 2.3, 10.5], fov: 48 }} dpr={[1, 1.75]}>
          <color attach="background" args={["#03050b"]} />
          <fog attach="fog" args={["#03050b", 13, 32]} />
          <ambientLight intensity={0.28} />
          <directionalLight position={[6, 8, 8]} intensity={1.05} color="#c8d8ff" />
          <Stars radius={45} depth={24} count={1600} factor={2.15} saturation={0.55} fade speed={0.2} />

          {graphData.edges.map((edge, index) => {
            const source = nodeMap.get(edge.source);
            const targetNode = nodeMap.get(edge.target);
            if (!source || !targetNode) return null;
            const active = edge.source === selectedId || edge.target === selectedId;
            const selectedIsTarget = active && edge.target === selectedId;
            const pulseSource = selectedIsTarget ? targetNode.position : source.position;
            const pulseTarget = selectedIsTarget ? source.position : targetNode.position;
            const strongerEvidence = (edge.evidence_count ?? 1) > 1;

            return (
              <group key={edge.id}>
                <Line
                  points={[source.position, targetNode.position]}
                  color={active ? "#9bc5ff" : strongerEvidence ? "#667fc0" : "#50638f"}
                  lineWidth={active ? 2.35 : strongerEvidence ? 1.45 : 1.1}
                  transparent
                  opacity={active ? 0.94 : strongerEvidence ? 0.58 : 0.42}
                />
                <AnimatedConnection
                  source={pulseSource}
                  target={pulseTarget}
                  active={active}
                  phase={(index * 0.31) % 1}
                />
              </group>
            );
          })}

          {positionedNodes.map((node) => (
            <GraphNodeMesh
              key={node.id}
              node={node}
              selected={node.id === selectedId}
              onSelect={travelToNode}
            />
          ))}

          {selectedNode ? (
            <CameraJourney
              target={selectedNode.position}
              journeyKey={`${graphData.focus.id}:${selectedNode.id}`}
              controlsRef={controlsRef}
            />
          ) : null}

          <OrbitControls
            ref={controlsRef}
            makeDefault
            enableDamping
            dampingFactor={0.075}
            minDistance={3.8}
            maxDistance={22}
            autoRotate={false}
          />
        </Canvas>

        <div className="graphJourneyBadge">
          {journeyStatus === "travelling"
            ? `Unterwegs zu ${selectedNode?.label ?? "Ziel"} …`
            : journeyStatus === "error"
              ? "Neue Verbindungen konnten nicht geladen werden"
              : `Fokus: ${graphData.focus.reference}`}
        </div>
        <div className="graphHint">Knoten anklicken · Kamera reist zum Ziel · Ziel wird neuer Fokus · neue Verbindungen werden geladen</div>
      </div>

      <aside className="graphInspector">
        <p className="eyebrow">Live Graph Inspector</p>
        <h3>{selectedNode?.label ?? graphData.focus.reference}</h3>

        <div className="verseTextBlock">
          <span className="verseTextLabel">Neue-Welt-Übersetzung · live von WOL</span>
          {textStatus === "loading" ? <p className="verseTextState">Vers wird geladen …</p> : null}
          {textStatus === "error" ? (
            <p className="verseTextState error">Vers konnte gerade nicht von WOL geladen werden.</p>
          ) : null}
          {verseText ? <p className="verseText">{verseText.text}</p> : null}
          {verseText ? (
            <a className="sourceLink" href={verseText.source_url} target="_blank" rel="noreferrer">
              Quelle auf WOL öffnen ↗
            </a>
          ) : null}
        </div>

        <dl>
          <div><dt>Vers-ID</dt><dd>{selectedNode?.verse_id ?? graphData.focus.id}</dd></div>
          <div><dt>Aktueller Fokus</dt><dd>{graphData.focus.reference}</dd></div>
          <div><dt>Direkte sichtbare Kanten</dt><dd>{selectedEdges.length}</dd></div>
          <div><dt>Graph-Knoten</dt><dd>{graphData.nodes.length}</dd></div>
          <div><dt>Graph-Kanten</dt><dd>{graphData.edges.length}</dd></div>
          <div><dt>Quelle</dt><dd>NWT Studienausgabe / WOL</dd></div>
        </dl>
        <p className="inspectorNote">
          Beim Klick auf einen verbundenen Vers fährt die Kamera zuerst zum Ziel. Danach wird dieser Vers zum neuen Fokus und sein eigener lokaler Knowledge Graph wird aus PostgreSQL geladen.
        </p>
      </aside>
    </div>
  );
}
