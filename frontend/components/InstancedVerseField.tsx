"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";

export type VerseFieldData = {
  count: number;
  positions: Float32Array;
  verseIds: Uint32Array;
  bookIds: Uint16Array;
  chapters: Uint16Array;
  verses: Uint16Array;
  degrees: Uint16Array;
  regions: Uint8Array;
};

type Props = {
  data: VerseFieldData;
  colors: Float32Array;
  selectedVerseId?: number | null;
  onHover?: (index: number | null, screen?: { x: number; y: number }) => void;
  onClick?: (index: number) => void;
};

const dummy = new Object3D();
const projected = new Vector3();
const pointer = new Vector2(99, 99);

export default function InstancedVerseField({
  data,
  colors,
  selectedVerseId,
  onHover,
  onClick,
}: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<InstancedMesh | null>(null);
  const lastHover = useRef<number | null>(null);
  const frameCounter = useRef(0);
  const { camera, gl } = useThree();

  const selectedIndex = useMemo(() => {
    if (!selectedVerseId) return -1;
    for (let i = 0; i < data.count; i++) {
      if (data.verseIds[i] === selectedVerseId) return i;
    }
    return -1;
  }, [data, selectedVerseId]);

  const mesh = useMemo(() => {
    const geometry = new SphereGeometry(1, 6, 4);
    const material = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.96 });
    const next = new InstancedMesh(geometry, material, data.count);
    next.frustumCulled = false;
    next.instanceColor = new InstancedBufferAttribute(new Float32Array(data.count * 3), 3);
    meshRef.current = next;
    return next;
  }, [data.count]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.add(mesh);
    return () => group.remove(mesh);
  }, [mesh]);

  useEffect(() => {
    const colorBuffer = mesh.instanceColor?.array as Float32Array;
    const tempColor = new Color();

    for (let i = 0; i < data.count; i++) {
      const degreeBoost = Math.min(data.degrees[i], 10) * 0.018;
      const selected = i === selectedIndex;
      dummy.position.set(
        data.positions[i * 3],
        data.positions[i * 3 + 1],
        data.positions[i * 3 + 2],
      );
      dummy.scale.setScalar(selected ? 0.19 : 0.055 + degreeBoost);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      tempColor.setRGB(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
      if (selected) tempColor.offsetHSL(0, 0.12, 0.28);
      colorBuffer[i * 3] = tempColor.r;
      colorBuffer[i * 3 + 1] = tempColor.g;
      colorBuffer[i * 3 + 2] = tempColor.b;
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [mesh, data, colors, selectedIndex]);

  useEffect(() => {
    const canvas = gl.domElement;

    const updatePointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const handleLeave = () => {
      pointer.set(99, 99);
      lastHover.current = null;
      onHover?.(null);
    };

    const handleClick = () => {
      if (lastHover.current !== null) onClick?.(lastHover.current);
    };

    canvas.addEventListener("pointermove", updatePointer);
    canvas.addEventListener("pointerleave", handleLeave);
    canvas.addEventListener("click", handleClick);
    return () => {
      canvas.removeEventListener("pointermove", updatePointer);
      canvas.removeEventListener("pointerleave", handleLeave);
      canvas.removeEventListener("click", handleClick);
    };
  }, [gl, onClick, onHover]);

  useFrame(() => {
    frameCounter.current += 1;
    if (frameCounter.current % 6 !== 0 || !onHover) return;
    if (pointer.x > 2 || pointer.y > 2) return;

    const rect = gl.domElement.getBoundingClientRect();
    const mouseX = ((pointer.x + 1) / 2) * rect.width;
    const mouseY = ((1 - pointer.y) / 2) * rect.height;
    let bestDistance = 18 * 18;
    let bestIndex: number | null = null;
    let bestX = mouseX;
    let bestY = mouseY;

    for (let i = 0; i < data.count; i++) {
      projected.set(
        data.positions[i * 3],
        data.positions[i * 3 + 1],
        data.positions[i * 3 + 2],
      ).project(camera);
      if (projected.z < -1 || projected.z > 1) continue;
      const x = ((projected.x + 1) / 2) * rect.width;
      const y = ((1 - projected.y) / 2) * rect.height;
      const dx = x - mouseX;
      const dy = y - mouseY;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
        bestX = x;
        bestY = y;
      }
    }

    if (bestIndex !== lastHover.current) {
      lastHover.current = bestIndex;
      onHover(bestIndex, bestIndex === null ? undefined : { x: bestX, y: bestY });
    } else if (bestIndex !== null) {
      onHover(bestIndex, { x: bestX, y: bestY });
    }
  });

  useEffect(() => {
    return () => {
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
    };
  }, [mesh]);

  return <group ref={groupRef} />;
}
