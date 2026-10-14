import { vlanLabel, describeEnd, findNode, findRackDevice, linkAt, nextPortName, otherEnd, PORT_MEDIA_LABEL, portsOf, type Id, type PlanContent, type Port } from '@glasshouse/domain';
import { useState } from 'react';
import type { CommitFn } from '../../store/hooks';
import { IconPlus } from '../../ui/icons';
import { useFloatingPanel } from '../../ui/useFloatingPanel';
import { PortDetail } from './PortDetail';
import './ports.css';
import { useT, type Messages } from '../../i18n';

interface PortManagerProps {
  content: PlanContent;
  roomId: Id;
  deviceId: Id;
  commit: CommitFn;
  readOnly: boolean;
  onClose: () => void;
}

export function portLabel(m: Messages, content: PlanContent, deviceId: Id, port: Port): string {
  const ref = { deviceId, port: port.name };
  const link = linkAt(content, ref);
  if (!link) return m.ports.portFree(port.name);
  const far = otherEnd(link, ref);
  return m.ports.portLinked(port.name, describeEnd(content, far).device, far.port);
}

interface Bank {
  prefix: string;
  ports: { port: Port; short: string }[];
}

/**
 * Consecutive ports sharing a name prefix form a bank, labelled once, with only the number on
 * each jack (Gi1/0/ then 1…48), like a real faceplate. Names without a trailing number stand alone.
 */
function banksOf(ports: Port[]): Bank[] {
  const banks: Bank[] = [];
  for (const port of ports) {
    const m = /^(.*?)(\d+)$/.exec(port.name);
    const prefix = m ? m[1]! : '';
    const short = m ? m[2]! : port.name;
    const last = banks[banks.length - 1];
    if (last && last.prefix === prefix && m) last.ports.push({ port, short });
    else banks.push({ prefix, ports: [{ port, short }] });
  }
  return banks;
}

/** Floating port map for one device: a faceplate of its ports, and the selected port's link. */
export function PortManager({ content, roomId, deviceId, commit, readOnly, onClose }: PortManagerProps) {
  const m = useT();
  const name = findRackDevice(content, deviceId)?.device.name ?? findNode(content, deviceId)?.node.name ?? m.search.device;
  const ports = portsOf(content, deviceId);
  const [selected, setSelected] = useState<string | null>(ports[0]?.name ?? null);
  const [error, setError] = useState<string | null>(null);
  const { pos, headProps } = useFloatingPanel('glasshouse:port-manager-pos', { x: 140, y: 120 });
  const linked = ports.filter((p) => linkAt(content, { deviceId, port: p.name })).length;
  const current = ports.find((p) => p.name === selected) ?? null;

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
    <section className="port-mgr glass" role="dialog" aria-label={m.ports.title(name)} style={{ left: pos.x, top: pos.y }}>
      <header className="port-mgr__head" {...headProps}>
        <h2>
          <span className="mono">{m.ports.title(name)}</span>
        </h2>
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
        <div className="port-mgr__face" role="group" aria-label={m.ports.face}>
          {banksOf(ports).map((bank, b) => (
            <div key={b} className="port-mgr__bank">
              {bank.prefix ? <span className="port-mgr__bank-label mono">{bank.prefix}</span> : null}
              <div className="port-mgr__jacks">
                {bank.ports.map(({ port: p, short }) => {
                  const label = portLabel(m, content, deviceId, p);
                  const isLinked = Boolean(linkAt(content, { deviceId, port: p.name }));
                  return (
                    <button
                      key={p.name}
                      type="button"
                      className={`port port--${p.media}${isLinked ? ' is-linked' : ''}`}
                      aria-pressed={p.name === selected}
                      aria-label={label}
                      title={`${label} · ${PORT_MEDIA_LABEL[p.media]} ${p.speed}${p.vlan ? ` · ${vlanLabel(p.vlan)}` : ''}`}
                      onClick={() => setSelected(p.name)}
                    >
                      <span className="port__jack" aria-hidden="true" />
                      <span className="port__name mono">{short}</span>
                      {p.vlan ? <span className="port__vlan mono">{p.vlan.mode === 'access' ? p.vlan.vid : m.vlans.tagTrunk}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {current ? <PortDetail key={ports.indexOf(current)} content={content} roomId={roomId} deviceId={deviceId} port={current} commit={commit} readOnly={readOnly} onRenamed={setSelected} onRemoved={() => setSelected(null)} /> : null}
    </section>
  );
}
