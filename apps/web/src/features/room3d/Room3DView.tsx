import { currentRevision, equipmentStateOf, racksOf, rackPower, type RoomLocation } from '@glasshouse/domain';
import { useMemo, useState } from 'react';
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
  const managed = content.objects.find((o) => o.id === managedId && o.type === 'mcb') ?? null;
  // Clicking an MCB in the room opens its ways, as double-clicking it does on the plan.
  const select = (id: string | null): void => {
    setSelectedId(id);
    if (id && content.objects.some((o) => o.id === id && o.type === 'mcb')) setManagedId(id);
  };
  const [showFeeds, setShowFeeds] = usePersistentState('glasshouse:3d-feeds', true);
  const [focus, setFocus] = useState<Focus3D | null>(null);
  const pickHit = (hit: SearchHit): void => {
    const target = scene.racks.find((r) => r.id === hit.objectId) ?? scene.others.find((o) => o.id === hit.objectId);
    if (!target) return;
    setSelectedId(hit.objectId);
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
        <Room3DCanvas scene={scene} palette={palette} camera={camera} onCamera={setCamera} selectedId={selectedId} onSelect={select} labelKinds={labelKinds} focus={focus} showFeeds={showFeeds} />
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
        {racks.length === 0 ? <p className="room3d__note">{m.room3d.noRacks}</p> : null}
        <ul>
          {racks.map((r) => (
            <li key={r.id}>
              <button type="button" className="room3d__rack" aria-pressed={r.id === selectedId} onClick={() => setSelectedId(r.id === selectedId ? null : r.id)}>
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
          </section>
        ) : selectedObject ? (
          <ObjectCard object={selectedObject} onManageWays={() => setManagedId(selectedObject.id)} />
        ) : (
          <p className="room3d__note">{m.room3d.pickRack}</p>
        )}
      </aside>
      {managed ? <PanelManager panel={managed} content={content} commit={commit} onClose={() => setManagedId(null)} readOnly={readOnly} /> : null}
      <div className="room3d__controls glass">
        <span className="mono room3d__zoom" aria-live="polite">{`${camera.distance.toFixed(1)} m`}</span>
        <button type="button" className="btn btn--sm" onClick={() => setCamera(home)}>
          {m.room3d.reset}
        </button>
        <LabelMenu shown={labelKinds} onChange={setLabelKinds} />
        <button type="button" className="btn btn--sm room3d__feeds" aria-pressed={showFeeds} onClick={() => setShowFeeds(!showFeeds)}>
          {showFeeds ? m.room3d.hideFeeds : m.room3d.showFeeds}
        </button>
        <span className="room3d__hint">{m.room3d.hint}</span>
      </div>
    </section>
  );
}
