import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { MeshBasicMaterial, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { wheelZoomFactor } from '../../viewport/math';
import { cameraPosition, dollyToward, orbit, panGround, type OrbitCamera } from './camera';
import type { Palette3D } from './palette';
import { feedColor } from '../plan/feeds';
import { FeedModel } from './FeedModel';
import { LINE_PICK_THRESHOLD_M, NO_PICK } from './picking';
import { RackModel } from './RackModel';
import { labelKindOf, type LabelKind } from './labels';
import { PickableObject } from './PickableObject';
import { Column, Floor, Walls } from './RoomModels';
import type { Rack3D, Scene3D } from './scene';
import { useT } from '../../i18n';

export const FOV_DEG = 45;

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
  const { camera: three, gl, size, raycaster } = useThree();
  useEffect(() => {
    raycaster.params.Line = { ...raycaster.params.Line, threshold: LINE_PICK_THRESHOLD_M };
  }, [raycaster]);

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

interface Room3DCanvasProps {
  scene: Scene3D;
  palette: Palette3D;
  camera: OrbitCamera;
  onCamera: CameraUpdate;
  /** A rack or any other room object. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Kinds that are always labelled; the rest are labelled on hover and selection. */
  labelKinds: LabelKind[];
  /** A search hit to mark with a ring on the floor. */
  focus?: Focus3D | null;
  showFeeds?: boolean;
}

export interface Focus3D {
  position: [number, number, number];
  radius: number;
  n: number;
}

const FOCUS_RING_MS = 1800;
const CLICK_SLOP_PX = 4;

/** A fading ring on the floor around a search hit. */
function FocusRing({ focus, color }: { focus: Focus3D; color: string }) {
  const mat = useRef<MeshBasicMaterial>(null);
  const started = useRef(performance.now());
  useEffect(() => {
    started.current = performance.now();
  }, [focus.n]);
  useFrame(() => {
    const t = (performance.now() - started.current) / FOCUS_RING_MS;
    if (mat.current) mat.current.opacity = Math.max(0, 1 - t);
  });
  return (
    <mesh position={[focus.position[0], 0.006, focus.position[2]]} rotation={[-Math.PI / 2, 0, 0]} raycast={NO_PICK}>
      <ringGeometry args={[focus.radius, focus.radius + 0.06, 48]} />
      <meshBasicMaterial ref={mat} color={color} transparent depthWrite={false} />
    </mesh>
  );
}

export function Room3DCanvas({ scene, palette, camera, onCamera, selectedId, onSelect, labelKinds, focus = null, showFeeds = true }: Room3DCanvasProps) {
  const m = useT();
  const existing = scene.others.filter((o) => o.type === 'existing_rack');
  const blockClick = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    if (e.delta <= CLICK_SLOP_PX) onSelect(null);
  };
  const blockHover = (e: ThreeEvent<PointerEvent>): void => {
    e.stopPropagation();
    document.body.style.cursor = '';
  };
  const others = scene.others.filter((o) => o.type !== 'existing_rack');
  return (
    <Canvas
      className="room3d__canvas"
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ fov: FOV_DEG, near: 0.05, far: 300, position: cameraPosition(camera) }}
      aria-label={m.room3d.canvas}
      onPointerMissed={(e) => {
        // A click on empty floor clears the highlight; a drag to orbit doesn't.
        if (e.type === 'click') onSelect(null);
      }}
    >
      <color attach="background" args={[palette.sky]} />
      <ambientLight intensity={0.75} />
      <hemisphereLight args={['#ffffff', '#b8c4cf', 0.55]} />
      <directionalLight
        position={[scene.width * 0.2 - 2, 9, scene.length * 1.3 + 2]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-Math.max(scene.width, scene.length)}
        shadow-camera-right={Math.max(scene.width, scene.length)}
        shadow-camera-top={Math.max(scene.width, scene.length)}
        shadow-camera-bottom={-Math.max(scene.width, scene.length)}
      />
      <CameraController camera={camera} onChange={onCamera} />
      {focus ? <FocusRing key={focus.n} focus={focus} color={palette.front} /> : null}
      {/* Room geometry takes clicks too, so a wall or column in front of a rack blocks it. */}
      <group onClick={blockClick} onPointerOver={blockHover}>
        <Floor scene={scene} palette={palette} />
        <Walls scene={scene} palette={palette} />
        {scene.columns.map((c) => (
          <Column key={c.id} column={c} palette={palette} />
        ))}
        {(showFeeds ? scene.feeds : []).map((f) => (
          <FeedModel key={f.feed.id} feed={f} color={feedColor(f.feed, { feeds: scene.feeds.map((x) => x.feed) })} />
        ))}
      </group>
      {others.map((o) => (
        <PickableObject key={o.id} object={o} palette={palette} selected={o.id === selectedId} labelled={labelKinds.includes(labelKindOf(o.type))} onSelect={onSelect} />
      ))}
      {scene.racks.map((r, i) => (
        <RackModel key={r.id} rack={r} palette={palette} selected={r.id === selectedId} onSelect={onSelect} stagger={i % 2 === 1} labels={labelKinds.includes('rack') ? 'always' : 'hover'} />
      ))}
      {existing.map((o) => {
        const asRack: Rack3D = { ...o, owner: 'oxygenai', faces: [], slots: [], reserved: [], capacityU: 42, usedU: 0 };
        return <RackModel key={o.id} rack={asRack} palette={palette} selected={o.id === selectedId} onSelect={onSelect} existing labels={labelKinds.includes('existing') ? 'always' : 'hover'} />;
      })}
    </Canvas>
  );
}
