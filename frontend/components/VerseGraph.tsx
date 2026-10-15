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
  focus: { id: number; reference: string };
  nodes: GraphNode[];
  edges: GraphEdge[];
};

type PositionedNode = GraphNode & { position: [number, number, number] };

type VerseTextData = {
  verse_id: number;
  reference: string;
  text: string;
  source_url: string;
  source_label: string;
  storage_mode: string;
};

type JourneyPoint = {
  verse_id: number;
  reference: string;
  position: [number, number, number];
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

  return (
    <group ref={groupRef} position={node.position}>
      <mesh
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          onSelect(node);
        }}
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
    const shimmer = active
      ? 0.11 + Math.sin(clock.elapsedTime * 5 + phase * 6) * 0.025
      : 0.055;
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
  journeyKey: number;
  controlsRef: React.MutableRefObject<ControlsHandle | null>;
}) {
  const { camera } = useThree();
  const progress = useRef(1);
  const startCamera = useRef(new Vector3());
  const startTarget = useRef(new Vector3());
  const destination = useMemo(() => new Vector3(...target), [target]);
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
    progress.current = Math.min(1, progress.current + delta / 1.45);
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

export default function VerseGraph({
  data,
  onFocusChange,
}: {
  data: VerseGraphData;
  onFocusChange?: (reference: string, edgeCount: number) => void;
}) {
  const [graphData, setGraphData] = useState<VerseGraphData>(() => data);
  const [focusAnchor, setFocusAnchor] = useState<[number, number, number]>([0, 0, 0]);
  const [selectedId, setSelectedId] = useState(() => `verse:${data.focus.id}`);
  const [verseText, setVerseText] = useState<VerseTextData | null>(null);
  const [textStatus, setTextStatus] = useState<"loading" | "ready" | "error">("loading");
  const [journeyStatus, setJourneyStatus] = useState<"idle" | "travelling" | "error">("idle");
  const [journeyTarget, setJourneyTarget] = useState<[number, number, number] | null>(null);
  const [journeySequence, setJourneySequence] = useState(0);
  const [history, setHistory] = useState<JourneyPoint[]>([
    { verse_id: data.focus.id, reference: data.focus.reference, position: [0, 0, 0] },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const controlsRef = useRef<ControlsHandle | null>(null);
  const journeyRequest = useRef(0);
  const graphCache = useRef(new Map<number, VerseGraphData>([[data.focus.id, data]]));
  const onFocusChangeRef = useRef(onFocusChange);

  useEffect(() => {
    onFocusChangeRef.current = onFocusChange;
  }, [onFocusChange]);

  useEffect(() => {
    onFocusChangeRef.current?.(graphData.focus.reference, graphData.edges.length);
  }, [graphData.focus.reference, graphData.edges.length]);

  const positionedNodes = useMemo<PositionedNode[]>(() => {
    const focusNode = graphData.nodes.find((node) => node.verse_id === graphData.focus.id)
      ?? graphData.nodes.find((node) => node.role === "focus");
    const connected = graphData.nodes.filter((node) => node.verse_id !== graphData.focus.id);
    const result: PositionedNode[] = [];

    if (focusNode) {
      result.push({ ...focusNode, role: "focus", position: focusAnchor });
    }

    const radius = connected.length <= 4 ? 4.2 : connected.length <= 10 ? 5.2 : 6.2;
    connected.forEach((node, index) => {
      const angle = (index / Math.max(connected.length, 1)) * Math.PI * 2;
      const layer = index % 3;
      const y = Math.sin(angle * 1.7) * (1.35 + layer * 0.55);
      const z = Math.cos(angle * 0.8) * (1.15 + layer * 0.38);
      const localRadius = radius + (layer - 1) * 0.75;
      result.push({
        ...node,
        role: "connected",
        position: [
          focusAnchor[0] + Math.cos(angle) * localRadius,
          focusAnchor[1] + y,
          focusAnchor[2] + Math.sin(angle) * localRadius + z,
        ],
      });
    });

    return result;
  }, [graphData, focusAnchor]);

  const nodeMap = useMemo(
    () => new Map(positionedNodes.map((node) => [node.id, node])),
    [positionedNodes],
  );

  const canonicalFocusId = `verse:${graphData.focus.id}`;
  const selectedNode = nodeMap.get(selectedId) ?? nodeMap.get(canonicalFocusId) ?? positionedNodes[0];

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
    (edge) => edge.source === canonicalFocusId || edge.target === canonicalFocusId,
  );

  const loadGraph = async (verseId: number) => {
    const cached = graphCache.current.get(verseId);
    if (cached) return cached;

    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8010";
    const response = await fetch(`${apiBase}/api/graph/verse/${verseId}`);
    if (!response.ok) throw new Error(`Graph API responded with ${response.status}`);

    const payload = (await response.json()) as VerseGraphData;
    graphCache.current.set(verseId, payload);
    return payload;
  };

  const activateGraph = (
    payload: VerseGraphData,
    anchor: [number, number, number],
  ) => {
    setGraphData(payload);
    setFocusAnchor(anchor);
    setSelectedId(`verse:${payload.focus.id}`);
    setJourneyTarget(null);
    setJourneyStatus("idle");
  };

  const travelToNode = async (next: PositionedNode) => {
    if (journeyStatus === "travelling") return;

    if (next.verse_id === graphData.focus.id) {
      setSelectedId(canonicalFocusId);
      return;
    }

    const targetPosition: [number, number, number] = [...next.position];
    setSelectedId(next.id);
    setJourneyTarget(targetPosition);
    setJourneySequence((current) => current + 1);
    setJourneyStatus("travelling");

    const requestId = ++journeyRequest.current;

    try {
      const [payload] = await Promise.all([
        loadGraph(next.verse_id),
        wait(1450),
      ]);
      if (requestId !== journeyRequest.current) return;

      graphCache.current.set(payload.focus.id, payload);
      activateGraph(payload, targetPosition);

      const nextPoint: JourneyPoint = {
        verse_id: payload.focus.id,
        reference: payload.focus.reference,
        position: targetPosition,
      };

      setHistory((current) => {
        const base = current.slice(0, historyIndex + 1);
        return [...base, nextPoint];
      });
      setHistoryIndex((current) => current + 1);
    } catch {
      if (requestId !== journeyRequest.current) return;
      setSelectedId(canonicalFocusId);
      setJourneyTarget(null);
      setJourneyStatus("error");
    }
  };

  const jumpToHistory = async (index: number) => {
    if (journeyStatus === "travelling" || index === historyIndex) return;

    const point = history[index];
    if (!point) return;

    const requestId = ++journeyRequest.current;
    setJourneyTarget(point.position);
    setJourneySequence((current) => current + 1);
    setJourneyStatus("travelling");

    try {
      const [payload] = await Promise.all([
        loadGraph(point.verse_id),
        wait(900),
      ]);
      if (requestId !== journeyRequest.current) return;

      activateGraph(payload, point.position);
      setHistoryIndex(index);
    } catch {
      if (requestId !== journeyRequest.current) return;
      setJourneyTarget(null);
      setJourneyStatus("error");
    }
  };

  const goBack = () => {
    if (historyIndex > 0) void jumpToHistory(historyIndex - 1);
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

            // The active light pulse always radiates from the true current focus.
            // While travelling, the selected target glows, but the edge direction
            // stays focus -> destination. Once the graph switches, the destination
            // becomes the new canonical focus and pulses outwards from there.
            const active = edge.source === canonicalFocusId || edge.target === canonicalFocusId;
            const focusIsTarget = active && edge.target === canonicalFocusId;
            const pulseSource = focusIsTarget ? targetNode.position : source.position;
            const pulseTarget = focusIsTarget ? source.position : targetNode.position;
            const strongerEvidence = (edge.evidence_count ?? 1) > 1;

            return (
              <group key={`${graphData.focus.id}:${edge.id}`}>
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
              key={`${graphData.focus.id}:${node.id}`}
              node={node}
              selected={node.id === selectedId}
              onSelect={travelToNode}
            />
          ))}

          {journeyStatus === "travelling" && journeyTarget ? (
            <CameraJourney
              target={journeyTarget}
              journeyKey={journeySequence}
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
              ? `Fokus bleibt: ${graphData.focus.reference}`
              : `Fokus: ${graphData.focus.reference}`}
        </div>
        <div className="graphHint">
          Knoten anklicken · Kamera reist zum Ziel · Ziel bleibt an seiner Position und wird neuer Fokus
        </div>
      </div>

      <aside className="graphInspector">
        <p className="eyebrow">Live Graph Inspector</p>
        <h3>{selectedNode?.label ?? graphData.focus.reference}</h3>

        <div className="verseTextBlock">
          <span className="verseTextLabel">Neue-Welt-Übersetzung · live von JW.org / WOL</span>
          {textStatus === "loading" ? <p className="verseTextState">Vers wird geladen …</p> : null}
          {textStatus === "error" ? (
            <p className="verseTextState error">Vers konnte gerade nicht geladen werden.</p>
          ) : null}
          {verseText ? <p className="verseText">{verseText.text}</p> : null}
          {verseText ? (
            <a className="sourceLink" href={verseText.source_url} target="_blank" rel="noreferrer">
              Quelle öffnen ↗
            </a>
          ) : null}
        </div>

        <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(116,155,220,.2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span className="verseTextLabel">Journey History</span>
            <button
              type="button"
              onClick={goBack}
              disabled={historyIndex === 0 || journeyStatus === "travelling"}
              style={{
                border: "1px solid rgba(120,170,255,.35)",
                background: "rgba(9,20,40,.7)",
                color: historyIndex === 0 ? "#52627c" : "#b9d8ff",
                borderRadius: 999,
                padding: "6px 10px",
                cursor: historyIndex === 0 ? "default" : "pointer",
              }}
            >
              ← Zurück
            </button>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {history.map((point, index) => (
              <button
                key={`${point.verse_id}:${index}`}
                type="button"
                onClick={() => void jumpToHistory(index)}
                disabled={journeyStatus === "travelling"}
                title={`Zu ${point.reference} zurückspringen`}
                style={{
                  border: index === historyIndex ? "1px solid #79b6ff" : "1px solid rgba(120,170,255,.22)",
                  background: index === historyIndex ? "rgba(49,107,181,.28)" : "rgba(8,15,29,.72)",
                  color: index === historyIndex ? "#d8ebff" : "#8fa9ca",
                  borderRadius: 999,
                  padding: "6px 9px",
                  cursor: journeyStatus === "travelling" ? "default" : "pointer",
                  fontSize: 12,
                }}
              >
                {index > 0 ? "→ " : ""}{point.reference}
              </button>
            ))}
          </div>
        </div>

        <dl>
          <div><dt>Vers-ID</dt><dd>{selectedNode?.verse_id ?? graphData.focus.id}</dd></div>
          <div><dt>Aktueller Fokus</dt><dd>{graphData.focus.reference}</dd></div>
          <div><dt>Direkte sichtbare Kanten</dt><dd>{selectedEdges.length}</dd></div>
          <div><dt>Graph-Knoten</dt><dd>{graphData.nodes.length}</dd></div>
          <div><dt>Graph-Kanten</dt><dd>{graphData.edges.length}</dd></div>
          <div><dt>Quelle</dt><dd>NWT Studienausgabe / JW.org + WOL</dd></div>
        </dl>

        <p className="inspectorNote">
          Der Fokus bleibt jetzt räumlich am angeklickten Ziel. Nach dem Graph-Wechsel strahlen die Lichtimpulse dauerhaft vom neuen Fokus nach außen.
        </p>
      </aside>
    </div>
  );
}
