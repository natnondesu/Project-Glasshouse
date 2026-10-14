import { currentRevision, racksOf, rackPower, type RoomLocation } from '@glasshouse/domain';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { SearchBox } from '../search/SearchBox';
import type { SearchHit } from '../search/search';
import { defaultCamera, type OrbitCamera } from './camera';
import { readPalette } from './palette';
import { usePersistentState } from '../../ui/usePersistentState';
import { hasWebGL, Room3DCanvas, type Focus3D } from './Room3DCanvas';
import { buildScene } from './scene';
import './room3d.css';

const FOCUS_HEIGHT_M = 0.8;
const FOCUS_DISTANCE_M = 6;

export default function Room3DView({ location }: { location: RoomLocation }) {
  const navigate = useNavigate();
  const content = currentRevision(location.room.plan).content;
  const scene = useMemo(() => buildScene(content), [content]);
  const palette = useMemo(() => readPalette(), []);
  const home = useMemo(() => defaultCamera(content.survey.width, content.survey.length), [content.survey.width, content.survey.length]);
  const [camera, setCamera] = useState<OrbitCamera>(home);
  const [webgl] = useState(hasWebGL);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [labels, setLabels] = usePersistentState<'always' | 'hover'>('glasshouse:3d-labels', 'always');
  const [focus, setFocus] = useState<Focus3D | null>(null);
  const pickHit = (hit: SearchHit): void => {
    const target = scene.racks.find((r) => r.id === hit.objectId) ?? scene.others.find((o) => o.id === hit.objectId);
    if (!target) return;
    if (scene.racks.some((r) => r.id === hit.objectId)) setSelectedId(hit.objectId);
    const [x, , z] = target.position;
    // Swing to the hit without zooming out; come closer if the camera is far away.
    setCamera((prev) => ({ ...prev, target: [x, FOCUS_HEIGHT_M, z], distance: Math.min(prev.distance, FOCUS_DISTANCE_M) }));
    setFocus({ position: [x, 0, z], radius: Math.hypot(target.size[0], target.size[2]) / 2 + 0.15, n: Date.now() });
  };
  const racks = [...scene.racks].sort((a, b) => a.name.localeCompare(b.name));
  const selected = racksOf(content).find((r) => r.id === selectedId) ?? null;
  const power = selected ? rackPower(selected) : null;
  const openElevation = (id: string): void => void navigate(`/rooms/${location.room.id}/elevation?sel=${id}`);

  return (
    <section className="room3d" aria-label="Room 3D view">
      {webgl ? (
        <Room3DCanvas scene={scene} palette={palette} camera={camera} onCamera={setCamera} selectedRackId={selectedId} onSelectRack={setSelectedId} labels={labels} focus={focus} />
      ) : (
        <p className="room3d__fallback" role="status">
          This browser can't show 3D (WebGL is turned off or unavailable). The plan and elevation views show the same Room.
        </p>
      )}
      <SearchBox
        className="room3d__search"
        content={content}
        roomName={location.room.name}
        onPick={pickHit}
        action={(hit) =>
          hit.elementId ? (
            <Link to={`/rooms/${location.room.id}/elevation?sel=${hit.elementId}`} aria-label={`Open ${hit.name} in elevation`} onMouseDown={(e) => e.stopPropagation()}>
              Elevation
            </Link>
          ) : null
        }
      />
      <aside className="room3d__panel glass" aria-label="Racks in this room">
        <h2>Racks</h2>
        {racks.length === 0 ? <p className="room3d__note">No Racks yet. Place them on the Plan.</p> : null}
        <ul>
          {racks.map((r) => (
            <li key={r.id}>
              <button type="button" className="room3d__rack" aria-pressed={r.id === selectedId} onClick={() => setSelectedId(r.id === selectedId ? null : r.id)}>
                <span className="mono">{r.name}</span>
                <span className="room3d__rack-sub">{r.owner === 'customer' ? 'Customer' : `${r.usedU}/${r.capacityU}U`}</span>
              </button>
            </li>
          ))}
        </ul>
        {selected && power ? (
          <section className="room3d__card" aria-label={`${selected.name} details`}>
            <dl>
              <dt>Owner</dt>
              <dd>{selected.owner === 'customer' ? 'Customer' : 'OxygenAI'}</dd>
              <dt>Space</dt>
              <dd className="mono">{`${scene.racks.find((r) => r.id === selected.id)?.usedU ?? 0}/${selected.capacityU}U`}</dd>
              <dt>Devices</dt>
              <dd className="mono">{selected.devices.length}</dd>
              <dt>Demand</dt>
              <dd className="mono">{`${(power.devices.knownW + power.reserved.knownW).toLocaleString('en-US')} W${power.devices.unknownCount + power.reserved.unknownCount ? ' + unknown' : ''}`}</dd>
            </dl>
            <button type="button" className="btn btn--sm btn--ink" aria-label={`Open ${selected.name} elevation`} onClick={() => openElevation(selected.id)}>
              Open elevation
            </button>
          </section>
        ) : (
          <p className="room3d__note">Click a Rack, here or in the room, to highlight it.</p>
        )}
      </aside>
      <div className="room3d__controls glass">
        <span className="mono room3d__zoom" aria-live="polite">{`${camera.distance.toFixed(1)} m`}</span>
        <button type="button" className="btn btn--sm" onClick={() => setCamera(home)}>
          Reset view
        </button>
        <div className="seg seg--compact" role="group" aria-label="Rack labels">
          <button type="button" aria-pressed={labels === 'always'} onClick={() => setLabels('always')}>
            Labels always
          </button>
          <button type="button" aria-pressed={labels === 'hover'} onClick={() => setLabels('hover')}>
            On hover
          </button>
        </div>
        <span className="room3d__hint">Drag to orbit · two-finger scroll to pan · pinch to zoom · click a Rack to highlight it</span>
      </div>
    </section>
  );
}
