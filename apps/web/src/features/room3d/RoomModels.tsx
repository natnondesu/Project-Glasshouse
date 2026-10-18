import { useEffect, useMemo } from 'react';
import { BoxGeometry, DoubleSide, EdgesGeometry, Shape, ShapeGeometry, Vector2 } from 'three';
import { NO_PICK } from './picking';
import type { Palette3D } from './palette';
import type { Column3D, Object3D, Opening3D, Scene3D } from './scene';
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
    <lineSegments geometry={geometry} raycast={NO_PICK}>
      <lineBasicMaterial color={color} transparent opacity={opacity} />
    </lineSegments>
  );
}

/** A click this far from where the press began is a drag (looking around), not a pick. */
const FLOOR_CLICK_SLOP_PX = 4;

/** `onPick` (walk mode) gets the plan point a click lands on. */
export function Floor({ scene, palette, onPick, onHover }: { scene: Scene3D; palette: Palette3D; onPick?: (x: number, z: number) => void; onHover?: (at: [number, number] | null) => void }) {
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
    <mesh
      geometry={geometry}
      rotation={[Math.PI / 2, 0, 0]}
      receiveShadow
      onClick={
        onPick
          ? (e) => {
              if (e.delta > FLOOR_CLICK_SLOP_PX) return;
              e.stopPropagation();
              onPick(e.point.x, e.point.z);
            }
          : undefined
      }
      onPointerMove={onHover ? (e) => onHover([e.point.x, e.point.z]) : undefined}
      onPointerOut={onHover ? () => onHover(null) : undefined}
    >
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

const DOOR_LEAF_M = 0.04;
/** Sliding doors: the leaf runs this far off the wall face and laps the opening by this much when parked. */
const SLIDE_STANDOFF_M = 0.05;
const SLIDE_OVERLAP_M = 0.05;

function DoorFrame({ w, h, d, wall }: { w: number; h: number; d: number; wall: string }) {
  return (
    <>
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
    </>
  );
}

/** A sliding door, open: the leaf parked flat along the wall on its side, hanging from a top track. */
function SlidingDoor({ size, color, wall, side }: { size: [number, number, number]; color: string; wall: string; side: 1 | -1 }) {
  const [w, h, d] = size;
  const z = d / 2 + SLIDE_STANDOFF_M;
  return (
    <group>
      <DoorFrame w={w} h={h} d={d} wall={wall} />
      <mesh position={[side * (w / 2), h / 2 - 0.02, z]}>
        <boxGeometry args={[2 * w + 0.05, 0.03, 0.04]} />
        <meshStandardMaterial color={wall} roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[side * (w - SLIDE_OVERLAP_M), -0.03, z]} castShadow>
        <boxGeometry args={[w, h - 0.06, DOOR_LEAF_M]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
    </group>
  );
}

function Door({ size, color, wall, hinge = 'left', opening = 'swing' }: { size: [number, number, number]; color: string; wall: string; hinge?: 'left' | 'right'; opening?: 'swing' | 'slide' }) {
  const side = hinge === 'right' ? 1 : -1;
  if (opening === 'slide') return <SlidingDoor size={size} color={color} wall={wall} side={side} />;
  const [w, h, d] = size;
  const leafT = DOOR_LEAF_M;
  // Shown open at 70° towards the room, with its swing on the floor, as on a drawing.
  const swing = (70 * Math.PI) / 180;
  // Drawn hinged on the left; a right-hinged door is the mirror image (three.js flips the winding for negative scale).
  return (
    <group scale={[side === 1 ? -1 : 1, 1, 1]}>
      <DoorFrame w={w} h={h} d={d} wall={wall} />
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

/**
 * A third-party PDU: a power bar. Mounting ears, a red rocker switch, a row of sockets and a short
 * cord, laid along the object's longer side so an older, square PDU still reads as a bar.
 */
function PowerBar({ size, color, wall }: { size: [number, number, number]; color: string; wall: string }) {
  const [w, h, d] = size;
  const along = w >= d;
  const len = Math.max(w, d);
  const bar = Math.max(0.03, Math.min(0.06, Math.min(w, d)));
  const tall = Math.max(0.03, Math.min(0.05, h));
  const sockets = Math.max(3, Math.min(8, Math.round((len - 0.12) / 0.055)));
  const pitch = (len - 0.12) / sockets;
  const face = -h / 2 + tall;
  return (
    <group rotation={[0, along ? 0 : Math.PI / 2, 0]}>
      <group position={[0, -h / 2 + tall / 2, 0]}>
        <mesh castShadow>
          <boxGeometry args={[len - 0.04, tall, bar]} />
          <meshStandardMaterial color="#1b2027" roughness={0.55} metalness={0.3} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * (len / 2 - 0.012), 0, 0]}>
            <boxGeometry args={[0.024, tall * 0.25, bar + 0.02]} />
            <meshStandardMaterial color="#14191f" roughness={0.6} metalness={0.4} />
          </mesh>
        ))}
      </group>
      <mesh position={[-len / 2 + 0.05, face + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.03, bar * 0.6]} />
        <meshStandardMaterial color="#d6372b" emissive="#d6372b" emissiveIntensity={0.35} />
      </mesh>
      {Array.from({ length: sockets }, (_, i) => (
        <mesh key={i} position={[-len / 2 + 0.09 + pitch * (i + 0.5), face + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[pitch * 0.7, bar * 0.7]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[-len / 2 - 0.08, -h / 2 + 0.006, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.005, 0.005, 0.16, 8]} />
        <meshStandardMaterial color="#14191f" roughness={0.8} />
      </mesh>
      <Edges size={[len - 0.04, tall, bar]} color={wall} opacity={0.35} />
    </group>
  );
}

/** A partition: a full-height wall, with a doorway cut wherever a door stands in it and the wall carried on above. */
function Partition({ size, color, wall, openings }: { size: [number, number, number]; color: string; wall: string; openings: Opening3D[] }) {
  const [w, h, d] = size;
  const pieces: { x: number; len: number; y: number; high: number }[] = [];
  let from = -w / 2;
  for (const gap of openings) {
    if (gap.from > from) pieces.push({ x: (from + gap.from) / 2, len: gap.from - from, y: 0, high: h });
    // Above the doorway the wall carries on up to its top.
    if (gap.height < h) pieces.push({ x: (gap.from + gap.to) / 2, len: gap.to - gap.from, y: gap.height / 2, high: h - gap.height });
    from = gap.to;
  }
  if (from < w / 2) pieces.push({ x: (from + w / 2) / 2, len: w / 2 - from, y: 0, high: h });
  return (
    <group>
      {pieces.map((p, i) => (
        <group key={i} position={[p.x, p.y, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[p.len, p.high, d]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          <Edges size={[p.len, p.high, d]} color={wall} opacity={0.5} />
        </group>
      ))}
    </group>
  );
}

/** A wall-mounted split unit: a white case with a louvre slot low on its face and a status light. */
function WallSplitAc({ size, color, wall }: { size: [number, number, number]; color: string; wall: string }) {
  const [w, h, d] = size;
  return (
    <group>
      <mesh castShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.45} />
      </mesh>
      <mesh position={[0, -h * 0.28, d / 2 + 0.002]}>
        <planeGeometry args={[w * 0.86, h * 0.2]} />
        <meshStandardMaterial color="#59636d" roughness={0.7} />
      </mesh>
      <mesh position={[w * 0.4, h * 0.2, d / 2 + 0.002]}>
        <circleGeometry args={[0.012, 12]} />
        <meshStandardMaterial color="#4cd17a" emissive="#4cd17a" emissiveIntensity={0.6} />
      </mesh>
      <Edges size={size} color={wall} />
    </group>
  );
}

/** A floor-standing precision (computer room) unit: a tall cabinet, a display and an air grille on its front, and a plinth. */
function PrecisionAc({ size, color, wall }: { size: [number, number, number]; color: string; wall: string }) {
  const [w, h, d] = size;
  const slats = 6;
  return (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.15} />
      </mesh>
      <mesh position={[0, -h / 2 + 0.06, d / 2 + 0.002]}>
        <planeGeometry args={[w, 0.12]} />
        <meshStandardMaterial color="#2b333c" roughness={0.7} />
      </mesh>
      <mesh position={[0, h * 0.4, d / 2 + 0.002]}>
        <planeGeometry args={[w * 0.28, 0.07]} />
        <meshStandardMaterial color="#1b2128" emissive="#2f6fd1" emissiveIntensity={0.35} />
      </mesh>
      {Array.from({ length: slats }, (_, i) => (
        <mesh key={i} position={[0, h * 0.1 + (i - (slats - 1) / 2) * 0.09, d / 2 + 0.002]}>
          <planeGeometry args={[w * 0.72, 0.04]} />
          <meshStandardMaterial color="#59636d" roughness={0.7} />
        </mesh>
      ))}
      <Edges size={size} color={wall} />
    </group>
  );
}

const TILE_TARGET_M = 0.9;
const TILE_JOINT_M = 0.008;

/** A video wall: a dark bezel, the screen set into its face, and the joints between its tiles. */
function DisplayWall({ size, color, wall }: { size: [number, number, number]; color: string; wall: string }) {
  const [w, h, d] = size;
  const bezel = 0.03;
  const cols = Math.max(1, Math.round(w / TILE_TARGET_M));
  const rows = Math.max(1, Math.round(h / TILE_TARGET_M));
  const front = d / 2 + 0.002;
  return (
    <group>
      <mesh castShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0, front]}>
        <planeGeometry args={[w - bezel * 2, h - bezel * 2]} />
        <meshStandardMaterial color="#0c1a2e" emissive="#1f5fbf" emissiveIntensity={0.28} roughness={0.25} />
      </mesh>
      {Array.from({ length: cols - 1 }, (_, i) => (
        <mesh key={`c${i}`} position={[-w / 2 + bezel + ((w - bezel * 2) * (i + 1)) / cols, 0, front + 0.001]}>
          <planeGeometry args={[TILE_JOINT_M, h - bezel * 2]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}
      {Array.from({ length: rows - 1 }, (_, i) => (
        <mesh key={`r${i}`} position={[0, -h / 2 + bezel + ((h - bezel * 2) * (i + 1)) / rows, front + 0.001]}>
          <planeGeometry args={[w - bezel * 2, TILE_JOINT_M]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}
      <Edges size={size} color={wall} opacity={0.7} />
    </group>
  );
}

export function ObjectModel({ object, palette }: { object: Object3D; palette: Palette3D }) {
  const color = palette.object[object.type];
  let body;
  if (object.type === 'furniture') body = <Desk size={object.size} color={color} edge={palette.slotEmpty} />;
  else if (object.type === 'door') body = <Door size={object.size} color={color} wall={palette.wall} hinge={object.door?.hinge} opening={object.door?.opening} />;
  else if (object.type === 'wall_plug' || object.type === 'industrial_socket') body = <Faceplate size={object.size} color={color} wall={palette.wall} round={object.type === 'industrial_socket'} />;
  else if (object.type === 'floor_box') body = <FloorBoxLid size={object.size} color={color} wall={palette.wall} />;
  else if (object.type === 'pdu') body = <PowerBar size={object.size} color={color} wall={palette.wall} />;
  else if (object.type === 'partition') body = <Partition size={object.size} color={color} wall={palette.wall} openings={object.openings ?? []} />;
  else if (object.type === 'wall_split_ac') body = <WallSplitAc size={object.size} color={color} wall={palette.wall} />;
  else if (object.type === 'precision_ac') body = <PrecisionAc size={object.size} color={color} wall={palette.wall} />;
  else if (object.type === 'display_wall') body = <DisplayWall size={object.size} color={color} wall={palette.wall} />;
  else if (object.type === 'ups') body = <Cabinet size={object.size} color={color} wall={palette.wall} accent="#4cd17a" />;
  else body = <Mcb size={object.size} color={color} wall={palette.wall} />;
  return (
    <group position={object.position} rotation={[0, object.yaw, 0]}>
      {body}
    </group>
  );
}
