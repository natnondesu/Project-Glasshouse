import { currentRevision, equipmentStateOf, powerPath, racksOf, rackPower, type RoomLocation } from '@glasshouse/domain';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { SearchBox } from '../search/SearchBox';
import type { SearchHit } from '../search/search';
import { defaultCamera, type OrbitCamera } from './camera';
import { readPalette } from './palette';
import { usePersistentState } from '../../ui/usePersistentState';
import { hasWebGL, Room3DCanvas, type Focus3D } from './Room3DCanvas';
import { buildScene } from './scene';
import { initialLabelKinds, type LabelKind } from './labels';
import { LabelMenu } from './LabelMenu';
import { ObjectCard } from './ObjectCard';
import { PowerPathToggle } from './PowerPathToggle';
import { entrance, standAt, standHere, type WalkCamera } from './walk';
import { IconClose } from '../../ui/icons';
import { PanelManager } from '../plan/PanelManager';
import { usePlanCommit } from '../../store/hooks';
import './room3d.css';
import { useT } from '../../i18n';

const FOCUS_HEIGHT_M = 0.8;
const FOCUS_DISTANCE_M = 6;

/** The pre-kinds label switch, read once so an "on hover" choice carries over. */
function legacyLabelChoice(): string | null {
  try {
    return localStorage.getItem('glasshouse:3d-labels');
  } catch {
    return null;
  }
}

export default function Room3DView({ location, readOnly = false }: { location: RoomLocation; readOnly?: boolean }) {
  const navigate = useNavigate();
  const content = currentRevision(location.room.plan).content;
  const plan = location.room.plan;
  const scene = useMemo(() => buildScene(content, (id) => equipmentStateOf(plan, id)), [content, plan]);
  const palette = useMemo(() => readPalette(), []);
  const home = useMemo(() => defaultCamera(content.survey.width, content.survey.length), [content.survey.width, content.survey.length]);
  const [camera, setCamera] = useState<OrbitCamera>(home);
  const [webgl] = useState(hasWebGL);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const m = useT();
  const [labelKinds, setLabelKinds] = usePersistentState<LabelKind[]>('glasshouse:3d-label-kinds', initialLabelKinds(legacyLabelChoice()));
  const commit = usePlanCommit(location.room.id);
  const [managedId, setManagedId] = useState<string | null>(null);
  const [pathFor, setPathFor] = useState<string | null>(null);
  const path = useMemo(() => (pathFor ? powerPath(content, pathFor) : null), [content, pathFor]);
  const pathName = content.objects.find((o) => o.id === pathFor)?.name ?? null;
  const pathToggle = (id: string, name: string) => (
    <PowerPathToggle content={content} objectId={id} name={name} active={pathFor === id} onToggle={(on) => setPathFor(on ? id : null)} />
  );
  const managed = content.objects.find((o) => o.id === managedId && o.type === 'mcb') ?? null;
  // Clicking selects only; an MCB's ways open from its card's Manage ways button.
  const select = (id: string | null): void => setSelectedId(id);
  const [showFeeds, setShowFeeds] = usePersistentState('glasshouse:3d-feeds', true);
  const [focus, setFocus] = useState<Focus3D | null>(null);
  // Walking: standing in the room at eye height instead of looking down on it.
  const [walkCam, setWalkCam] = useState<WalkCamera | null>(null);
  const [glide, setGlide] = useState<{ x: number; z: number } | null>(null);
  const standAtId = (id: string): void => {
    const target = scene.racks.find((r) => r.id === id) ?? scene.others.find((o) => o.id === id);
    if (target) setWalkCam(standAt(scene, target));
  };
  // Walk starts like Street View: first choose where to stand (or the door), then you're in.
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState(false);
  const dropAt = (x: number, z: number): void => {
    const spot = standHere(scene, x, z);
    if (!spot) return setPlaceError(true);
    setPlaceError(false);
    setPlacing(false);
    setWalkCam(spot);
  };
  const startAtDoor = (): void => {
    setPlacing(false);
    setPlaceError(false);
    setWalkCam(entrance(scene));
  };
  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setPlacing(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placing]);
  const pickHit = (hit: SearchHit): void => {
    const target = scene.racks.find((r) => r.id === hit.objectId) ?? scene.others.find((o) => o.id === hit.objectId);
    if (!target) return;
    setSelectedId(hit.objectId);
    if (walkCam) return standAtId(hit.objectId);
    const [x, , z] = target.position;
    // Swing to the hit without zooming out; come closer if the camera is far away.
    setCamera((prev) => ({ ...prev, target: [x, FOCUS_HEIGHT_M, z], distance: Math.min(prev.distance, FOCUS_DISTANCE_M) }));
    setFocus({ position: [x, 0, z], radius: Math.hypot(target.size[0], target.size[2]) / 2 + 0.15, n: Date.now() });
  };
  const racks = [...scene.racks].sort((a, b) => a.name.localeCompare(b.name));
  const selected = racksOf(content).find((r) => r.id === selectedId) ?? null;
  const selectedObject = selected ? null : (content.objects.find((o) => o.id === selectedId) ?? null);
  const power = selected ? rackPower(selected) : null;
  const openElevation = (id: string): void => void navigate(`/rooms/${location.room.id}/elevation?sel=${id}`);

  return (
    <section className="room3d" aria-label={m.room3d.region}>
      {webgl ? (
        <Room3DCanvas
          scene={scene}
          palette={palette}
          camera={camera}
          onCamera={setCamera}
          selectedId={selectedId}
          onSelect={select}
          labelKinds={labelKinds}
          focus={focus}
          showFeeds={showFeeds}
          path={path}
          walk={walkCam ? { camera: walkCam, onCommit: setWalkCam, glide, onFloor: (x, z) => setGlide({ x, z }), onExit: () => setWalkCam(null) } : null}
          placing={placing && !walkCam ? { onPick: dropAt } : null}
        />
      ) : (
        <p className="room3d__fallback" role="status">
          {m.room3d.noWebgl}
        </p>
      )}
      <SearchBox
        className="room3d__search"
        content={content}
        roomName={location.room.name}
        plan={location.room.plan}
        onPick={pickHit}
        action={(hit) =>
          hit.elementId ? (
            <Link to={`/rooms/${location.room.id}/elevation?sel=${hit.elementId}`} aria-label={m.plan.openInElevation(hit.name)} onMouseDown={(e) => e.stopPropagation()}>
              {m.plan.elevation}
            </Link>
          ) : null
        }
      />
      <aside className="room3d__panel glass" aria-label={m.room3d.racksHere}>
        <h2>{m.room3d.racks}</h2>
        {walkCam ? <p className="room3d__note">{m.room3d.walkRacks}</p> : null}
        {racks.length === 0 ? <p className="room3d__note">{m.room3d.noRacks}</p> : null}
        <ul>
          {racks.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="room3d__rack"
                aria-pressed={r.id === selectedId}
                onClick={() => {
                  // Walking, a rack in the list is somewhere to go: stand in front of it.
                  if (walkCam) {
                    setSelectedId(r.id);
                    return standAtId(r.id);
                  }
                  setSelectedId(r.id === selectedId ? null : r.id);
                }}
              >
                <span className="mono">{r.name}</span>
                <span className="room3d__rack-sub">{r.owner === 'customer' ? m.room3d.customer : `${r.usedU}/${r.capacityU}U`}</span>
              </button>
            </li>
          ))}
        </ul>
        {selected && power ? (
          <section className="room3d__card" aria-label={m.inspector.details(selected.name)}>
            <dl>
              <dt>{m.room3d.owner}</dt>
              <dd>{m.inspector.ownerName[selected.owner]}</dd>
              <dt>{m.room3d.space}</dt>
              <dd className="mono">{`${scene.racks.find((r) => r.id === selected.id)?.usedU ?? 0}/${selected.capacityU}U`}</dd>
              <dt>{m.room3d.devices}</dt>
              <dd className="mono">{selected.devices.length}</dd>
              <dt>{m.room3d.demand}</dt>
              <dd className="mono">{`${(power.devices.knownW + power.reserved.knownW).toLocaleString('en-US')} W${power.devices.unknownCount + power.reserved.unknownCount ? m.room3d.unknownSuffix : ''}`}</dd>
            </dl>
            <button type="button" className="btn btn--sm btn--ink" aria-label={m.room3d.openElevationOf(selected.name)} onClick={() => openElevation(selected.id)}>
              {m.room3d.openElevation}
            </button>
            {pathToggle(selected.id, selected.name)}
          </section>
        ) : selectedObject ? (
          <ObjectCard object={selectedObject} readOnly={readOnly} onManageWays={() => setManagedId(selectedObject.id)}>
            {pathToggle(selectedObject.id, selectedObject.name)}
          </ObjectCard>
        ) : (
          <p className="room3d__note">{m.room3d.pickRack}</p>
        )}
      </aside>
      {managed ? <PanelManager panel={managed} content={content} commit={commit} onClose={() => setManagedId(null)} readOnly={readOnly} /> : null}
      <div className="room3d__controls glass">
        {placing ? (
          <>
            <button type="button" className="btn btn--sm btn--ink" onClick={startAtDoor}>
              {m.room3d.startAtDoor}
            </button>
            <button type="button" className="btn btn--sm btn--quiet" onClick={() => setPlacing(false)}>
              {m.common.cancel}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--sm room3d__walk" aria-pressed={walkCam !== null} onClick={() => (walkCam ? setWalkCam(null) : setPlacing(true))}>
            {walkCam ? m.room3d.walkExit : m.room3d.walk}
          </button>
        )}
        {walkCam ? (
          <span className="mono room3d__zoom">{m.room3d.eyeHeight}</span>
        ) : (
          <>
            <span className="mono room3d__zoom" aria-live="polite">{`${camera.distance.toFixed(1)} m`}</span>
            <button type="button" className="btn btn--sm" onClick={() => setCamera(home)}>
              {m.room3d.reset}
            </button>
          </>
        )}
        <LabelMenu shown={labelKinds} onChange={setLabelKinds} />
        {pathName ? (
          <button type="button" className="btn btn--sm power-path__chip" aria-label={m.room3d.clearPath(pathName)} onClick={() => setPathFor(null)}>
            {m.room3d.pathChip(pathName)}
            <span aria-hidden="true" className="power-path__x">
              <IconClose />
            </span>
          </button>
        ) : null}
        <button type="button" className="btn btn--sm room3d__feeds" aria-pressed={showFeeds} onClick={() => setShowFeeds(!showFeeds)}>
          {showFeeds ? m.room3d.hideFeeds : m.room3d.showFeeds}
        </button>
        <span className="room3d__hint" role={placing ? 'status' : undefined}>
          {placing ? (placeError ? m.room3d.placeNoRoom : m.room3d.placeHint) : walkCam ? m.room3d.walkHint : m.room3d.hint}
        </span>
      </div>
    </section>
  );
}
