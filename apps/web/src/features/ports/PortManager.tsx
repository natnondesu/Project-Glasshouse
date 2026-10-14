import { describeEnd, findNode, findRackDevice, linkAt, nextPortName, otherEnd, PORT_MEDIA_LABEL, portsOf, type Id, type PlanContent, type Port } from '@glasshouse/domain';
import { useState } from 'react';
import type { CommitFn } from '../../store/hooks';
import { IconPlus } from '../../ui/icons';
import { useFloatingPanel } from '../../ui/useFloatingPanel';
import { PortDetail } from './PortDetail';
import './ports.css';

interface PortManagerProps {
  content: PlanContent;
  deviceId: Id;
  commit: CommitFn;
  readOnly: boolean;
  onClose: () => void;
}

export function portLabel(content: PlanContent, deviceId: Id, port: Port): string {
  const ref = { deviceId, port: port.name };
  const link = linkAt(content, ref);
  if (!link) return `Port ${port.name}, free`;
  const far = otherEnd(link, ref);
  return `Port ${port.name}, linked to ${describeEnd(content, far).device} ${far.port}`;
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
export function PortManager({ content, deviceId, commit, readOnly, onClose }: PortManagerProps) {
  const name = findRackDevice(content, deviceId)?.device.name ?? findNode(content, deviceId)?.node.name ?? 'Device';
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
    <section className="port-mgr glass" role="dialog" aria-label={`${name} ports`} style={{ left: pos.x, top: pos.y }}>
      <header className="port-mgr__head" {...headProps}>
        <h2>
          <span className="mono">{name}</span> ports
        </h2>
        <span className="port-mgr__count mono">{`${ports.length} ports · ${linked} linked`}</span>
        <button type="button" className="icon-btn icon-btn--sm" aria-label={`Close ${name} ports`} onClick={onClose}>
          ×
        </button>
      </header>
      <div className="port-mgr__tools">
        <button type="button" className="btn btn--sm" disabled={readOnly} onClick={addPort}>
          <IconPlus />
          Add port
        </button>
        <button type="button" className="btn btn--sm btn--quiet" disabled={readOnly} onClick={reset}>
          Reset to template
        </button>
        <ul className="port-mgr__legend" aria-label="Port legend">
          <li className="is-linked">Linked</li>
          <li>Free</li>
          <li className="is-fibre">Fibre cage</li>
        </ul>
      </div>
      {error ? (
        <p role="alert" className="field__error port-mgr__error">
          {error}
        </p>
      ) : null}
      {ports.length === 0 ? (
        <p className="port-mgr__empty">No ports yet. Add one, or reset to the template’s ports.</p>
      ) : (
        <div className="port-mgr__face" role="group" aria-label="Ports">
          {banksOf(ports).map((bank, b) => (
            <div key={b} className="port-mgr__bank">
              {bank.prefix ? <span className="port-mgr__bank-label mono">{bank.prefix}</span> : null}
              <div className="port-mgr__jacks">
                {bank.ports.map(({ port: p, short }) => {
                  const label = portLabel(content, deviceId, p);
                  const isLinked = Boolean(linkAt(content, { deviceId, port: p.name }));
                  return (
                    <button
                      key={p.name}
                      type="button"
                      className={`port port--${p.media}${isLinked ? ' is-linked' : ''}`}
                      aria-pressed={p.name === selected}
                      aria-label={label}
                      title={`${label} · ${PORT_MEDIA_LABEL[p.media]} ${p.speed}`}
                      onClick={() => setSelected(p.name)}
                    >
                      <span className="port__jack" aria-hidden="true" />
                      <span className="port__name mono">{short}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {current ? <PortDetail key={ports.indexOf(current)} content={content} deviceId={deviceId} port={current} commit={commit} readOnly={readOnly} onRenamed={setSelected} onRemoved={() => setSelected(null)} /> : null}
    </section>
  );
}
