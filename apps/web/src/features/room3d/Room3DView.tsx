import { currentRevision, type RoomLocation } from '@glasshouse/domain';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { defaultCamera, type OrbitCamera } from './camera';
import { readPalette } from './palette';
import { hasWebGL, Room3DCanvas } from './Room3DCanvas';
import { buildScene } from './scene';
import './room3d.css';

export default function Room3DView({ location }: { location: RoomLocation }) {
  const navigate = useNavigate();
  const content = currentRevision(location.room.plan).content;
  const scene = useMemo(() => buildScene(content), [content]);
  const palette = useMemo(() => readPalette(), []);
  const home = useMemo(() => defaultCamera(content.survey.width, content.survey.length), [content.survey.width, content.survey.length]);
  const [camera, setCamera] = useState<OrbitCamera>(home);
  const [webgl] = useState(hasWebGL);
  const openRack = (id: string): void => void navigate(`/rooms/${location.room.id}/elevation?sel=${id}`);

  return (
    <section className="room3d" aria-label="Room 3D view">
      {webgl ? (
        <Room3DCanvas scene={scene} palette={palette} camera={camera} onCamera={setCamera} onOpenRack={openRack} />
      ) : (
        <p className="room3d__fallback" role="status">
          This browser can't show 3D (WebGL is turned off or unavailable). The plan and elevation views show the same Room.
        </p>
      )}
      <aside className="room3d__panel glass" aria-label="Racks in this room">
        <h2>Racks</h2>
        {scene.racks.length === 0 ? <p className="room3d__note">No Racks yet. Place them on the Plan.</p> : null}
        <ul>
          {[...scene.racks]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((r) => (
              <li key={r.id}>
                <button type="button" className="room3d__rack" onClick={() => openRack(r.id)}>
                  <span className="mono">{r.name}</span>
                  <span className="room3d__rack-sub">{r.owner === 'customer' ? 'Customer' : `${r.faces.length} ${r.faces.length === 1 ? 'Device' : 'Devices'}`}</span>
                </button>
              </li>
            ))}
        </ul>
      </aside>
      <div className="room3d__controls glass">
        <span className="mono room3d__zoom" aria-live="polite">{`${camera.distance.toFixed(1)} m`}</span>
        <button type="button" className="btn btn--sm" onClick={() => setCamera(home)}>
          Reset view
        </button>
        <span className="room3d__hint">Drag to orbit · two-finger scroll to pan · pinch to zoom · click a Rack to open it</span>
      </div>
    </section>
  );
}
