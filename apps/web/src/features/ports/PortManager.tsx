import { faceplateBlocks, resolveRemote, templateOf, type EquipmentState, vlanLabel, describeEnd, effectiveVlan, findNode, findRackDevice, linkAt, nextPortName, otherEnd, PORT_MEDIA_LABEL, portsOf, type Id, type PlanContent, type Port } from '@glasshouse/domain';
import { useState } from 'react';
import type { CommitFn } from '../../store/hooks';
import { IconGrip, IconPlus } from '../../ui/icons';
import { StateIcon } from '../../ui/StateIcon';
import { useFloatingPanel } from '../../ui/useFloatingPanel';
import { PortDetail } from './PortDetail';
import { BulkPortForm } from './BulkPortForm';
import { Faceplate } from './Faceplate';
import { useWorkspaceStore } from '../../store/workspaceStore';
import './ports.css';
import { useT, type Messages } from '../../i18n';

/** The panel ends this far above the bottom of the screen, wherever it was dragged to. */
const PANEL_BOTTOM_GAP_PX = 12;

interface PortManagerProps {
  content: PlanContent;
  /** On-site state, so ports cabled to gear in maintenance say so. */
  stateOf: (id: Id) => EquipmentState;
  roomId: Id;
  deviceId: Id;
  commit: CommitFn;
  readOnly: boolean;
  onClose: () => void;
}

function portLabel(m: Messages, content: PlanContent, deviceId: Id, port: Port, stateOf?: (id: Id) => EquipmentState): string {
  const ref = { deviceId, port: port.name };
  const link = linkAt(content, ref);
  if (!link) return m.ports.portFree(port.name);
  const far = otherEnd(link, ref);
  const label = m.ports.portLinked(port.name, describeEnd(content, far).device, far.port);
  return stateOf?.(far.deviceId) === 'maintenance' ? `${label}, ${m.ports.farInMaintenance}` : label;
}

/** Floating port map for one device: a faceplate of its ports, and the selected port's link. */
export function PortManager({ content, stateOf, roomId, deviceId, commit, readOnly, onClose }: PortManagerProps) {
  const m = useT();
  const owner = findRackDevice(content, deviceId)?.device ?? findNode(content, deviceId)?.node ?? null;
  const name = owner?.name ?? m.search.device;
  // Layout is only how the panel is drawn, matched by port name: take it from the catalog's current
  // version of the template, so a layout set after placing still reaches devices already in rooms.
  const catalog = useWorkspaceStore((s) => s.workspace.catalog);
  const ws = useWorkspaceStore((s) => s.workspace);
  const layoutGroups = owner ? (catalog.find((t) => t.id === owner.templateId)?.ports ?? templateOf(content, owner)?.ports) : undefined;
  const ports = portsOf(content, deviceId);
  // One port shows its own settings; several (Shift for a range, ⌘/Ctrl to add one) share a group form.
  const [picked, setPicked] = useState<string[]>(ports[0] ? [ports[0].name] : []);
  const [anchor, setAnchor] = useState<string | null>(ports[0]?.name ?? null);
  const setSelected = (name: string | null): void => {
    setPicked(name ? [name] : []);
    setAnchor(name);
  };
  const pick = (name: string, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }): void => {
    if (e.shiftKey && anchor !== null) {
      const names = ports.map((p) => p.name);
      const [a, b] = [names.indexOf(anchor), names.indexOf(name)].sort((x, y) => x - y) as [number, number];
      if (a >= 0) return setPicked(names.slice(a, b + 1));
    }
    if (e.metaKey || e.ctrlKey) {
      setAnchor(name);
      return setPicked((cur) => (cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name]));
    }
    setSelected(name);
  };
  const [error, setError] = useState<string | null>(null);
  const { pos, headProps } = useFloatingPanel('glasshouse:port-manager-at', { x: 560, y: 150 });
  const linked = ports.filter((p) => linkAt(content, { deviceId, port: p.name })).length;
  const live = picked.filter((n) => ports.some((p) => p.name === n));
  const current = live.length === 1 ? (ports.find((p) => p.name === live[0]) ?? null) : null;

  const addPort = (): void => {
    const last = ports[ports.length - 1];
    const port: Port = { name: nextPortName(ports), media: last?.media ?? 'rj45', speed: last?.speed ?? '1G' };
    const problem = commit({ type: 'port/add', deviceId, port });
    setError(problem);
    if (!problem) setSelected(port.name);
  };
  const reset = (): void => {
    const problem = commit({ type: 'port/reset', deviceId });
    setError(problem);
    if (!problem) setSelected(null);
  };

  return (
    <section className="port-mgr glass" role="dialog" aria-label={m.ports.title(name)} style={{ left: pos.x, top: pos.y, maxHeight: `calc(100vh - ${pos.y + PANEL_BOTTOM_GAP_PX}px)` }}>
      <header className="port-mgr__head" title={m.panels.dragToMove} {...headProps}>
        <IconGrip className="port-mgr__grip" />
        <h2>
          <span className="mono">{m.ports.title(name)}</span>
        </h2>
        {stateOf(deviceId) === 'maintenance' ? (
          <span className="port-mgr__maint">
            <StateIcon state="maintenance" />
            {m.equipment.state.maintenance}
          </span>
        ) : null}
        <span className="port-mgr__count mono">{m.ports.summary(ports.length, linked)}</span>
        <button type="button" className="icon-btn icon-btn--sm" aria-label={m.ports.close(name)} onClick={onClose}>
          ×
        </button>
      </header>
      <div className="port-mgr__tools">
        <button type="button" className="btn btn--sm" disabled={readOnly} onClick={addPort}>
          <IconPlus />
          {m.ports.add}
        </button>
        <button type="button" className="btn btn--sm btn--quiet" disabled={readOnly} onClick={reset}>
          {m.ports.reset}
        </button>
        <ul className="port-mgr__legend" aria-label={m.ports.legend}>
          <li className="is-linked">{m.ports.linked}</li>
          <li>{m.ports.free}</li>
          <li className="is-fibre">{m.ports.fibre}</li>
        </ul>
      </div>
      {error ? (
        <p role="alert" className="field__error port-mgr__error">
          {error}
        </p>
      ) : null}
      {ports.length === 0 ? (
        <p className="port-mgr__empty">{m.ports.empty}</p>
      ) : (
        <div className="port-mgr__face">
          <Faceplate
            blocks={faceplateBlocks(layoutGroups, ports)}
            label={m.ports.face}
            jack={(p, short) => {
              const far = p.remote ? resolveRemote(ws, p.remote) : null;
              const label = p.remote ? m.uplink.portLabel(p.name, far?.room?.name ?? m.uplink.gone, far?.device?.name ?? m.uplink.gone, p.remote.port) : portLabel(m, content, deviceId, p, stateOf);
              const link = linkAt(content, { deviceId, port: p.name });
              const isLinked = Boolean(link);
              const farMaint = link ? stateOf(otherEnd(link, { deviceId, port: p.name }).deviceId) === 'maintenance' : false;
              const vlan = effectiveVlan(content, { deviceId, port: p.name });
              const vlanNote = vlan ? ` · ${vlanLabel(vlan.vlan)}${vlan.from ? ` ${m.vlans.fromFar(vlan.from.device, vlan.from.port)}` : ''}` : '';
              return (
                <button
                  type="button"
                  className={`port port--${p.media}${isLinked ? ' is-linked' : ''}${p.remote ? ' is-uplink' : ''}${farMaint ? ' is-far-maint' : ''}`}
                  aria-pressed={live.includes(p.name)}
                  aria-label={label}
                  title={`${label} · ${PORT_MEDIA_LABEL[p.media]} ${p.speed}${p.lag ? ` · ${p.lag}` : ''}${vlanNote}`}
                  onClick={(e) => pick(p.name, e)}
                >
                  <span className="port__jack" aria-hidden="true">
                    {farMaint ? <StateIcon state="maintenance" className="port__maint" /> : null}
                  </span>
                  <span className="port__name mono">{short}</span>
                  {vlan ? <span className={`port__vlan mono${vlan.from ? ' is-inherited' : ''}`}>{vlan.vlan.mode === 'access' ? vlan.vlan.vid : m.vlans.tagTrunk}</span> : null}
                </button>
              );
            }}
          />
        </div>
      )}
      {ports.length > 1 ? <p className="port-mgr__hint">{m.ports.bulk.hint}</p> : null}
      {live.length > 1 ? (
        <div className="port-mgr__body">
          <BulkPortForm key={live.join('|')} content={content} deviceId={deviceId} names={ports.filter((p) => live.includes(p.name)).map((p) => p.name)} commit={commit} readOnly={readOnly} onClear={() => setSelected(null)} />
        </div>
      ) : null}
      {current ? (
        // The scroller is a div: browsers don't scroll a <fieldset> even with overflow set, so it clipped instead.
        <div className="port-mgr__body">
          <PortDetail key={ports.indexOf(current)} content={content} stateOf={stateOf} roomId={roomId} deviceId={deviceId} port={current} commit={commit} readOnly={readOnly} onRenamed={setSelected} onRemoved={() => setSelected(null)} />
        </div>
      ) : null}
    </section>
  );
}
