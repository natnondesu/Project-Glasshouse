import { currentRevision, equipmentStateOf, findNode, findRackDevice, type RoomLocation } from '@glasshouse/domain';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { usePlanCommit } from '../../store/hooks';
import { IconMinus, IconPlus } from '../../ui/icons';
import { PortManager } from '../ports/PortManager';
import { NetworkDetails } from './NetworkDetails';
import { TopologyDiagram, type TopoSelection } from './TopologyDiagram';
import { buildTopology } from './topology';
import { VlanList } from './VlanList';
import './network.css';

const ZOOM_STEP = 1.25;
const MIN_SCALE = 0.25;
/** "Fit" stops here: below it, node text drops under the 11px floor, so the canvas scrolls instead. */
const FIT_FLOOR = 0.85;
const MAX_SCALE = 2;

export function NetworkView({ location, readOnly }: { location: RoomLocation; readOnly: boolean }) {
  const m = useT();
  const content = currentRevision(location.room.plan).content;
  const roomId = location.room.id;
  const commit = usePlanCommit(roomId);
  const topology = useMemo(() => buildTopology(content), [content]);
  const [vid, setVid] = useState<number | null>(null);
  const [scale, setScale] = useState(1);
  const [selection, setSelection] = useState<TopoSelection>(null);
  const [portsFor, setPortsFor] = useState<string | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const zoom = (k: number): void => setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * k)));
  const fit = (): void => {
    const w = area.current?.clientWidth ?? topology.width;
    setScale(Math.min(1, Math.max(FIT_FLOOR, (w - 16) / Math.max(topology.width, 1))));
  };
  // Open showing the whole diagram; after that the zoom is the user's.
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || topology.nodes.length === 0 || !area.current?.clientWidth) return;
    fitted.current = true;
    fit();
  }, [topology]);

  return (
    <div className="network">
      <section className="network__main glass" aria-label={m.topology.region}>
        <div className="network__bar">
          <label className="network__filter">
            <span>{m.topology.highlight}</span>
            <select value={vid ?? ''} onChange={(e) => setVid(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{m.topology.allVlans}</option>
              {content.vlans.map((v) => (
                <option key={v.vid} value={v.vid}>{`${v.vid} · ${v.name}`}</option>
              ))}
            </select>
          </label>
          <span className="network__legend" aria-hidden="true">
            <span className="network__swatch" />
            {m.topology.copper}
            <span className="network__swatch network__swatch--fibre" />
            {m.topology.fibre}
          </span>
          <span className="network__zoom">
            <button type="button" className="icon-btn icon-btn--sm" aria-label={m.topology.zoomOut} onClick={() => zoom(1 / ZOOM_STEP)}>
              <IconMinus />
            </button>
            <span className="mono">{`${Math.round(scale * 100)}%`}</span>
            <button type="button" className="icon-btn icon-btn--sm" aria-label={m.topology.zoomIn} onClick={() => zoom(ZOOM_STEP)}>
              <IconPlus />
            </button>
            <button type="button" className="btn btn--sm btn--quiet" onClick={fit}>
              {m.topology.fit}
            </button>
          </span>
        </div>
        <div ref={area} className="network__canvas">
          {topology.nodes.length === 0 ? (
            <p className="network__empty">{m.topology.empty}</p>
          ) : (
            <TopologyDiagram
              content={content}
              topology={topology}
              vid={vid}
              scale={scale}
              selection={selection}
              onSelect={(s) => setSelection((cur) => (JSON.stringify(cur) === JSON.stringify(s) ? null : s))}
              stateOf={(id) => equipmentStateOf(location.room.plan, id)}
            />
          )}
        </div>
      </section>
      <aside className="network__side">
        <section className="net-panel glass">
          <NetworkDetails content={content} roomId={roomId} topology={topology} selection={selection} onManagePorts={setPortsFor} />
          {topology.unlinked.length > 0 ? (
            <details className="net-unlinked">
              <summary>{m.topology.unlinked(topology.unlinked.length)}</summary>
              <ul>
                {topology.unlinked.map((u) => (
                  <li key={u.id}>
                    <button type="button" className="net-unlinked__item" onClick={() => setPortsFor(u.id)}>
                      <span className="mono">{u.name}</span>
                      <span>{u.where}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
        <VlanList content={content} commit={commit} readOnly={readOnly} />
      </aside>
      {portsFor && (findRackDevice(content, portsFor) || findNode(content, portsFor)) ? (
        <PortManager key={portsFor} content={content} roomId={roomId} deviceId={portsFor} commit={commit} readOnly={readOnly} onClose={() => setPortsFor(null)} />
      ) : null}
    </div>
  );
}
