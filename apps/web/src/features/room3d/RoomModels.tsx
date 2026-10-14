import { useEffect, useMemo } from 'react';
import { BoxGeometry, DoubleSide, EdgesGeometry, Shape, ShapeGeometry, Vector2 } from 'three';
import type { Palette3D } from './palette';
import type { Column3D, Object3D, Scene3D } from './scene';
import { floorGridTexture } from './textures';

const WALL_H_M = 0.32;
const WALL_T_M = 0.06;
const DESK_TOP_M = 0.04;
const LEG_M = 0.05;

/** Crisp ink edges keep boxes readable in flat light, in keeping with the 2D drawing. */
export function Edges({ size, color, opacity = 0.55 }: { size: [number, number, number]; color: string; opacity?: number }) {
  const geometry = useMemo(() => {
    const box = new BoxGeometry(...size);
    const edges = new EdgesGeometry(box);
    box.dispose();
    return edges;
  }, [size]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} transparent opacity={opacity} />
    </lineSegments>
  );
}

export function Floor({ scene, palette }: { scene: Scene3D; palette: Palette3D }) {
  const geometry = useMemo(() => {
    const shapes = scene.floor.map(([outer, ...holes]) => {
      const shape = new Shape(outer!.map(([x, y]) => new Vector2(x, y)));
      shape.holes = holes.map((h) => new Shape(h.map(([x, y]) => new Vector2(x, y))));
      return shape;
    });
    return new ShapeGeometry(shapes);
  }, [scene.floor]);
  // R3F disposes what it creates, not geometries passed in as props.
  useEffect(() => () => geometry.dispose(), [geometry]);
  const grid = useMemo(() => floorGridTexture(palette.floor), [palette.floor]);
  useEffect(() => () => grid.dispose(), [grid]);
  return (
    // Plan y maps to world z: rotating the XY shape +90° about X lays it on the floor the right way round.
    <mesh geometry={geometry} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
      <meshStandardMaterial map={grid} side={DoubleSide} roughness={0.9} />
    </mesh>
  );
}

/** Low walls along the Footprint: enough to read the room's shape without hiding the racks. */
export function Walls({ scene, palette }: { scene: Scene3D; palette: Palette3D }) {
  const segments = scene.floor.flatMap((poly) =>
    poly.flatMap((ring) =>
      ring.slice(0, -1).map(([x1, y1], i) => {
        const [x2, y2] = ring[i + 1]!;
        return { cx: (x1 + x2) / 2, cz: (y1 + y2) / 2, len: Math.hypot(x2 - x1, y2 - y1), yaw: -Math.atan2(y2 - y1, x2 - x1) };
      }),
    ),
  );
  return (
    <group>
      {segments.map((s, i) => (
        <mesh key={i} position={[s.cx, WALL_H_M / 2, s.cz]} rotation={[0, s.yaw, 0]} castShadow receiveShadow>
          <boxGeometry args={[s.len + WALL_T_M, WALL_H_M, WALL_T_M]} />
          <meshStandardMaterial color={palette.wallFill} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

export function Column({ column, palette }: { column: Column3D; palette: Palette3D }) {
  return (
    <group position={column.position}>
      <mesh castShadow>
        <boxGeometry args={column.size} />
        <meshStandardMaterial color={palette.column} roughness={0.85} />
      </mesh>
      <Edges size={column.size} color={palette.wall} />
    </group>
  );
}

function Desk({ size, color, edge }: { size: [number, number, number]; color: string; edge: string }) {
  const [w, h, d] = size;
  const legs: [number, number][] = [
    [-w / 2 + LEG_M, -d / 2 + LEG_M],
    [w / 2 - LEG_M, -d / 2 + LEG_M],
    [-w / 2 + LEG_M, d / 2 - LEG_M],
    [w / 2 - LEG_M, d / 2 - LEG_M],
  ];
  return (
    <group>
      <mesh position={[0, h / 2 - DESK_TOP_M / 2, 0]} castShadow>
        <boxGeometry args={[w, DESK_TOP_M, d]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      {legs.map(([x, z], i) => (
        <mesh key={i} position={[x, -DESK_TOP_M / 2, z]} castShadow>
          <boxGeometry args={[LEG_M, h - DESK_TOP_M, LEG_M]} />
          <meshStandardMaterial color={edge} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

function Door({ size, color, wall }: { size: [number, number, number]; color: string; wall: string }) {
  const [w, h, d] = size;
  const leafT = 0.04;
  // Shown open at 70° towards the room, with its swing on the floor, as on a drawing.
  const swing = (70 * Math.PI) / 180;
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * w) / 2, 0, 0]}>
          <boxGeometry args={[0.05, h, d + 0.04]} />
          <meshStandardMaterial color={wall} roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, h / 2 - 0.025, 0]}>
        <boxGeometry args={[w + 0.05, 0.05, d + 0.04]} />
        <meshStandardMaterial color={wall} roughness={0.7} />
      </mesh>
      <group position={[-w / 2, 0, d / 2]} rotation={[0, -swing, 0]}>
        <mesh position={[w / 2, 0, leafT / 2]} castShadow>
          <boxGeometry args={[w - 0.02, h - 0.06, leafT]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
      </group>
      <mesh position={[-w / 2, -h / 2 + 0.004, d / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[w - 0.012, w, 32, 1, -swing, swing]} />
        <meshBasicMaterial color={wall} transparent opacity={0.5} side={DoubleSide} />
      </mesh>
    </group>
  );
}

function Mcb({ size, color, wall }: { size: [number, number, number]; color: string; wall: string }) {
  const [w, h, d] = size;
  // Wall-mounted: the cabinet hangs at eye height rather than standing on the floor.
  const cabinetH = Math.min(0.8, h);
  return (
    <group position={[0, h / 2 - cabinetH / 2, 0]}>
      <mesh castShadow>
        <boxGeometry args={[w, cabinetH, d]} />
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0, d / 2 + 0.002]}>
        <planeGeometry args={[w * 0.8, cabinetH * 0.7]} />
        <meshStandardMaterial color="#e8edf1" roughness={0.4} />
      </mesh>
      <Edges size={[w, cabinetH, d]} color={wall} />
    </group>
  );
}

/** Wall plugs and sockets: a faceplate at outlet height (the object's height is its top). */
function Faceplate({ size, color, wall, round }: { size: [number, number, number]; color: string; wall: string; round: boolean }) {
  const [w, h, d] = size;
  const plateH = Math.min(w, 0.16);
  return (
    <group position={[0, h / 2 - plateH / 2, 0]}>
      <mesh castShadow>
        <boxGeometry args={[w, plateH, d]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      {round ? (
        <mesh position={[0, 0, d / 2 + 0.002]}>
          <circleGeometry args={[plateH * 0.38, 24]} />
          <meshStandardMaterial color="#1f2c3a" />
        </mesh>
      ) : (
        <mesh position={[0, 0, d / 2 + 0.002]}>
          <planeGeometry args={[w * 0.55, plateH * 0.45]} />
          <meshStandardMaterial color="#c9cfd5" />
        </mesh>
      )}
      <Edges size={[w, plateH, d]} color={wall} />
    </group>
  );
}

function FloorBoxLid({ size, color, wall }: { size: [number, number, number]; color: string; wall: string }) {
  const [w, h, d] = size;
  return (
    <group>
      <mesh receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} roughness={0.6} metalness={0.4} />
      </mesh>
      <Edges size={size} color={wall} opacity={0.7} />
    </group>
  );
}

/** Standing UPS or PDU: a cabinet with a front panel and a small status display. */
function Cabinet({ size, color, wall, accent }: { size: [number, number, number]; color: string; wall: string; accent: string }) {
  const [w, h, d] = size;
  return (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.6} metalness={0.25} />
      </mesh>
      <mesh position={[0, h * 0.22, d / 2 + 0.002]}>
        <planeGeometry args={[w * 0.45, h * 0.08]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0, -h * 0.1, d / 2 + 0.002]}>
        <planeGeometry args={[w * 0.8, h * 0.5]} />
        <meshStandardMaterial color="#1b2128" roughness={0.8} />
      </mesh>
      <Edges size={size} color={wall} />
    </group>
  );
}

export function ObjectModel({ object, palette }: { object: Object3D; palette: Palette3D }) {
  const color = palette.object[object.type];
  let body;
  if (object.type === 'furniture') body = <Desk size={object.size} color={color} edge={palette.slotEmpty} />;
  else if (object.type === 'door') body = <Door size={object.size} color={color} wall={palette.wall} />;
  else if (object.type === 'wall_plug' || object.type === 'industrial_socket') body = <Faceplate size={object.size} color={color} wall={palette.wall} round={object.type === 'industrial_socket'} />;
  else if (object.type === 'floor_box') body = <FloorBoxLid size={object.size} color={color} wall={palette.wall} />;
  else if (object.type === 'ups' || object.type === 'pdu') body = <Cabinet size={object.size} color={color} wall={palette.wall} accent={object.type === 'ups' ? '#4cd17a' : '#7fa2e8'} />;
  else body = <Mcb size={object.size} color={color} wall={palette.wall} />;
  return (
    <group position={object.position} rotation={[0, object.yaw, 0]}>
      {body}
    </group>
  );
}
