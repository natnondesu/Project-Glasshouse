import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { BoxGeometry, DoubleSide, EdgesGeometry, Plane, Raycaster, Shape, ShapeGeometry, Vector2, Vector3 } from 'three';
import { wheelZoomFactor } from '../../viewport/math';
import { cameraPosition, dollyToward, orbit, panGround, type OrbitCamera } from './camera';
import type { Palette3D } from './palette';
import type { Object3D, Rack3D, Scene3D } from './scene';

export const FOV_DEG = 45;
const CLICK_SLOP_PX = 4;

export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    // Release the probe at once: browsers cap live WebGL contexts.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}

export type CameraUpdate = (update: (prev: OrbitCamera) => OrbitCamera) => void;

interface ControllerProps {
  camera: OrbitCamera;
  onChange: CameraUpdate;
}

/** Trackpad-first: drag orbits, two-finger scroll pans, pinch or ⌘/Ctrl+scroll zooms at the pointer; Shift- or right-drag also pans. */
function CameraController({ camera, onChange }: ControllerProps) {
  const { camera: three, gl, size } = useThree();

  useEffect(() => {
    const [x, y, z] = cameraPosition(camera);
    three.position.set(x, y, z);
    three.lookAt(...camera.target);
    three.updateProjectionMatrix();
  }, [camera, three]);

  useEffect(() => {
    const el = gl.domElement;
    const floor = new Plane(new Vector3(0, 1, 0), 0);
    const ray = new Raycaster();
    const floorPointAt = (clientX: number, clientY: number): [number, number, number] | null => {
      const rect = el.getBoundingClientRect();
      ray.setFromCamera(new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), three);
      const hit = ray.ray.intersectPlane(floor, new Vector3());
      return hit ? [hit.x, hit.y, hit.z] : null;
    };
    let drag: { x: number; y: number; pan: boolean } | null = null;
    const onDown = (e: PointerEvent): void => {
      drag = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 2 || e.button === 1 };
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent): void => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag = { ...drag, x: e.clientX, y: e.clientY };
      // Updaters, not snapshots: several events can arrive between renders and each must count.
      const pan = drag.pan;
      onChange((prev) => (pan ? panGround(prev, -dx, -dy, size.height, FOV_DEG) : orbit(prev, dx, dy)));
    };
    const onUp = (): void => {
      drag = null;
    };
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      // Same rule as the 2D plan: pinch, ⌘/Ctrl+scroll or a notched mouse wheel zooms; trackpad scroll pans.
      if (e.ctrlKey || e.metaKey || e.deltaMode !== 0) {
        const factor = 1 / wheelZoomFactor(e.deltaY, e.deltaMode);
        const anchor = floorPointAt(e.clientX, e.clientY);
        onChange((prev) => dollyToward(prev, factor, anchor));
        return;
      }
      const { deltaX, deltaY } = e;
      onChange((prev) => panGround(prev, deltaX, deltaY, size.height, FOV_DEG));
    };
    const noMenu = (e: Event): void => e.preventDefault();
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', noMenu);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', noMenu);
    };
  }, [gl, three, size.height, onChange]);

  return null;
}

function Floor({ scene, palette }: { scene: Scene3D; palette: Palette3D }) {
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
  const edges = useMemo(() => new Float32Array(scene.floor.flatMap((poly) => poly.flatMap((ring) => ring.slice(0, -1).flatMap(([x, y], i) => {
    const [nx, ny] = ring[i + 1]!;
    return [x, 0.004, y, nx, 0.004, ny];
  })))), [scene.floor]);
  return (
    <group>
      {/* Plan y maps to world z: rotating the XY shape +90° about X lays it on the floor the right way round. */}
      <mesh geometry={geometry} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <meshStandardMaterial color={palette.floor} side={DoubleSide} />
      </mesh>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[edges, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={palette.wall} />
      </lineSegments>
    </group>
  );
}

/** Crisp ink edges keep boxes readable in flat light, in keeping with the 2D drawing. */
function Edges({ size, color }: { size: [number, number, number]; color: string }) {
  const geometry = useMemo(() => {
    const box = new BoxGeometry(...size);
    const edges = new EdgesGeometry(box);
    box.dispose();
    return edges;
  }, [size]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} transparent opacity={0.55} />
    </lineSegments>
  );
}

function RackModel({ rack, palette, onOpen }: { rack: Rack3D; palette: Palette3D; onOpen: (id: string) => void }) {
  const [w, h, d] = rack.size;
  const click = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    if (e.delta <= CLICK_SLOP_PX) onOpen(rack.id);
  };
  return (
    <group position={rack.position} rotation={[0, rack.yaw, 0]} onClick={click} name={rack.name}>
      <mesh castShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={rack.owner === 'customer' ? palette.rackCustomer : palette.rack} roughness={0.7} />
      </mesh>
      <Edges size={rack.size} color={palette.wall} />
      {/* Front marker: a bright strip along the top front edge. */}
      <mesh position={[0, h / 2 + 0.006, d / 2 - 0.04]}>
        <boxGeometry args={[w, 0.012, 0.08]} />
        <meshStandardMaterial color={palette.front} />
      </mesh>
      {rack.faces.map((f) => (
        <mesh key={f.id} position={[0, f.y - h / 2, f.z]}>
          <planeGeometry args={[f.width, f.height]} />
          <meshStandardMaterial color={f.unknown ? palette.unknown : palette.category[f.category]} />
        </mesh>
      ))}
      {rack.slots.map((s) => (
        <mesh key={`${s.chassisId}-${s.slot}`} position={[s.x, s.y - h / 2, s.z]}>
          <planeGeometry args={[s.width, s.height]} />
          <meshStandardMaterial color={s.filled ? palette.category.compute : palette.slotEmpty} />
        </mesh>
      ))}
    </group>
  );
}

function ObjectModel({ object, palette }: { object: Object3D; palette: Palette3D }) {
  return (
    <group position={object.position} rotation={[0, object.yaw, 0]}>
      <mesh castShadow>
        <boxGeometry args={object.size} />
        <meshStandardMaterial color={palette.object[object.type]} transparent={object.type === 'door'} opacity={object.type === 'door' ? 0.55 : 1} />
      </mesh>
      <Edges size={object.size} color={palette.wall} />
    </group>
  );
}

function Column({ column, palette }: { column: Scene3D['columns'][number]; palette: Palette3D }) {
  return (
    <group position={column.position}>
      <mesh castShadow>
        <boxGeometry args={column.size} />
        <meshStandardMaterial color={palette.column} />
      </mesh>
      <Edges size={column.size} color={palette.wall} />
    </group>
  );
}

interface Room3DCanvasProps {
  scene: Scene3D;
  palette: Palette3D;
  camera: OrbitCamera;
  onCamera: CameraUpdate;
  onOpenRack: (id: string) => void;
}

export function Room3DCanvas({ scene, palette, camera, onCamera, onOpenRack }: Room3DCanvasProps) {
  return (
    <Canvas className="room3d__canvas" shadows="percentage" dpr={[1, 2]} camera={{ fov: FOV_DEG, near: 0.05, far: 300, position: cameraPosition(camera) }} aria-label="Room in 3D">
      <ambientLight intensity={0.9} />
      <directionalLight position={[scene.width * 0.3, 8, scene.length * 1.2]} intensity={1.4} castShadow />
      <hemisphereLight args={['#ffffff', '#b8c4cf', 0.5]} />
      <CameraController camera={camera} onChange={onCamera} />
      <Floor scene={scene} palette={palette} />
      {scene.racks.map((r) => (
        <RackModel key={r.id} rack={r} palette={palette} onOpen={onOpenRack} />
      ))}
      {scene.others.map((o) => (
        <ObjectModel key={o.id} object={o} palette={palette} />
      ))}
      {scene.columns.map((c) => (
        <Column key={c.id} column={c} palette={palette} />
      ))}
    </Canvas>
  );
}

