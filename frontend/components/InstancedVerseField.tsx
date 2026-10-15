"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending,
  Color,
  Group,
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

const REGION_COLORS = [
  "#F6C85F",
  "#B86CFF",
  "#4FA8FF",
  "#55D8D6",
  "#FF7096",
  "#FF625F",
  "#79E38B",
  "#8B7CFF",
] as const;

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
  const groupRef = useRef<Group>(null);
  const lastHover = useRef<number | null>(null);
  const frameCounter = useRef(0);
  const { camera, gl } = useThree();

  void colors;

  const selectedIndex = useMemo(() => {
    if (!selectedVerseId) return -1;
    for (let i = 0; i < data.count; i++) {
      if (data.verseIds[i] === selectedVerseId) return i;
    }
    return -1;
  }, [data, selectedVerseId]);

  const selectedPosition = useMemo<[number, number, number] | null>(() => {
    if (selectedIndex < 0) return null;
    return [
      data.positions[selectedIndex * 3],
      data.positions[selectedIndex * 3 + 1],
      data.positions[selectedIndex * 3 + 2],
    ];
  }, [data, selectedIndex]);

  const regionIndices = useMemo(() => {
    const buckets = Array.from({ length: REGION_COLORS.length }, () => [] as number[]);
    for (let i = 0; i < data.count; i++) {
      buckets[data.regions[i] % REGION_COLORS.length].push(i);
    }
    return buckets;
  }, [data]);

  const regionMeshes = useMemo(() => {
    return regionIndices.flatMap((indices, regionId) => {
      const color = new Color(REGION_COLORS[regionId]);
      const coreGeometry = new SphereGeometry(1, 8, 6);
      const haloGeometry = new SphereGeometry(1, 6, 4);
      const coreMaterial = new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.96,
        toneMapped: false,
        depthWrite: true,
      });
      const haloMaterial = new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.095,
        toneMapped: false,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      const core = new InstancedMesh(coreGeometry, coreMaterial, Math.max(1, indices.length));
      const halo = new InstancedMesh(haloGeometry, haloMaterial, Math.max(1, indices.length));
      core.frustumCulled = false;
      halo.frustumCulled = false;
      core.userData.verseIndices = indices;
      halo.userData.verseIndices = indices;
      core.userData.layer = "core";
      halo.userData.layer = "halo";
      return [core, halo];
    });
  }, [regionIndices]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    regionMeshes.forEach((mesh) => group.add(mesh));
    return () => regionMeshes.forEach((mesh) => group.remove(mesh));
  }, [regionMeshes]);

  useEffect(() => {
    for (let regionId = 0; regionId < REGION_COLORS.length; regionId++) {
      const indices = regionIndices[regionId];
      const core = regionMeshes[regionId * 2];
      const halo = regionMeshes[regionId * 2 + 1];

      for (let localIndex = 0; localIndex < indices.length; localIndex++) {
        const verseIndex = indices[localIndex];
        const degreeBoost = Math.min(data.degrees[verseIndex], 12) * 0.006;
        const selected = verseIndex === selectedIndex;
        const baseSize = 0.052 + degreeBoost;

        dummy.position.set(
          data.positions[verseIndex * 3],
          data.positions[verseIndex * 3 + 1],
          data.positions[verseIndex * 3 + 2],
        );
        dummy.scale.setScalar(selected ? 0.12 : baseSize);
        dummy.updateMatrix();
        core.setMatrixAt(localIndex, dummy.matrix);

        dummy.scale.setScalar(selected ? 0.34 : baseSize * 2.25);
        dummy.updateMatrix();
        halo.setMatrixAt(localIndex, dummy.matrix);
      }

      core.count = indices.length;
      halo.count = indices.length;
      core.instanceMatrix.needsUpdate = true;
      halo.instanceMatrix.needsUpdate = true;
      core.computeBoundingSphere();
      halo.computeBoundingSphere();
    }
  }, [regionMeshes, regionIndices, data, selectedIndex]);

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
    let bestDistance = 16 * 16;
    let bestIndex: number | null = null;
    let bestX = mouseX;
    let bestY = mouseY;

    for (let i = 0; i < data.count; i++) {
      projected
        .set(
          data.positions[i * 3],
          data.positions[i * 3 + 1],
          data.positions[i * 3 + 2],
        )
        .project(camera);
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
      regionMeshes.forEach((mesh) => {
        mesh.geometry.dispose();
        (mesh.material as MeshBasicMaterial).dispose();
      });
    };
  }, [regionMeshes]);

  return (
    <>
      <group ref={groupRef} />
      {selectedPosition ? (
        <group position={selectedPosition}>
          <mesh>
            <sphereGeometry args={[0.12, 18, 12]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.42, 18, 12]} />
            <meshBasicMaterial
              color="#9fd8ff"
              transparent
              opacity={0.16}
              depthWrite={false}
              toneMapped={false}
              blending={AdditiveBlending}
            />
          </mesh>
        </group>
      ) : null}
    </>
  );
}
