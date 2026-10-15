import { CABLE_LABEL, CABLE_TYPES, describeEnd, linkAt, newId, nextPortName, otherEnd, PORT_MEDIA, PORT_MEDIA_LABEL, PORT_SPEEDS, type CableType, type Id, type PlanContent, type Port, portsOf } from '@glasshouse/domain';
import { useEffect, useMemo, useState } from 'react';
import type { CommitFn } from '../../store/hooks';
import { TextField } from '../../ui/TextField';
import { portOwners } from './portOwners';
import { PortVlanField } from './PortVlanField';
import { useT } from '../../i18n';

/** Sentinel option: create a port on the far device as part of linking. */
const NEW_PORT = '__new_port__';
const FIRST_PORT = 'eth0';

interface PortDetailProps {
  content: PlanContent;
  roomId: Id;
  deviceId: Id;
  port: Port;
  commit: CommitFn;
  readOnly: boolean;
  onRenamed: (name: string) => void;
  onRemoved: () => void;
}

/** The selected port: its own settings, then its link (or a picker to make one). */
export function PortDetail({ content, roomId, deviceId, port, commit, readOnly, onRenamed, onRemoved }: PortDetailProps) {
  const m = useT();
  const lagMembers = port.lag ? portsOf(content, deviceId).filter((p) => p.lag === port.lag).length : 0;
  const [error, setError] = useState<string | null>(null);
  const ref = { deviceId, port: port.name };
  const link = linkAt(content, ref);
  const update = (patch: Partial<Port>): string | null => {
    const problem = commit({ type: 'port/update', deviceId, name: port.name, patch });
    if (!problem && patch.name) onRenamed(patch.name.trim());
    return problem;
  };

  return (
    <fieldset className="port-mgr__detail" disabled={readOnly}>
      <legend className="visually-hidden">{m.ports.portLegend(port.name)}</legend>
      <div className="port-mgr__row">
        <PortNameField id={`port-${deviceId}-name`} value={port.name} onCommit={(v) => update({ name: v })} />
        <label className="field">
          <span className="field__label">{m.ports.type}</span>
          <span className="field__box">
            <select className="field__input" value={port.media} onChange={(e) => setError(update({ media: e.target.value as Port['media'] }))}>
              {PORT_MEDIA.map((m) => (
                <option key={m} value={m}>
                  {PORT_MEDIA_LABEL[m]}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className="field">
          <span className="field__label">{m.ports.speed}</span>
          <span className="field__box">
            <select className="field__input" value={port.speed} onChange={(e) => setError(update({ speed: e.target.value }))}>
              {[...new Set([...PORT_SPEEDS, port.speed])].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </span>
        </label>
        <button
          type="button"
          className="btn btn--sm btn--danger port-mgr__remove"
          onClick={() => {
            const problem = commit({ type: 'port/remove', deviceId, name: port.name });
            setError(problem);
            if (!problem) onRemoved();
          }}
        >
          {m.ports.remove}
        </button>
      </div>
      <div className="port-mgr__lag">
        <TextField id={`${deviceId}-${port.name}-lag`} label={m.ports.lag} value={port.lag ?? ''} onCommit={(v) => commit({ type: 'port/update', deviceId, name: port.name, patch: { lag: v } }, `port:${deviceId}:${port.name}:lag`)} />
        <p className="port-mgr__lag-note">{port.lag ? m.ports.lagShared(port.lag, lagMembers) : m.ports.lagHint}</p>
      </div>
      <PortVlanField content={content} roomId={roomId} deviceId={deviceId} port={port} commit={commit} />
      {link ? <LinkedTo content={content} linkId={link.id} far={otherEnd(link, ref)} commit={commit} onError={setError} /> : <LinkPicker content={content} from={ref} commit={commit} onError={setError} />}
      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function LinkedTo({ content, linkId, far, commit, onError }: { content: PlanContent; linkId: Id; far: { deviceId: Id; port: string }; commit: CommitFn; onError: (e: string | null) => void }) {
  const m = useT();
  const link = content.links.find((l) => l.id === linkId)!;
  const end = describeEnd(content, far);
  return (
    <div className="port-mgr__link">
      <p className="port-mgr__link-to">
        {m.ports.linkedTo} <strong className="mono">{`${end.device} ${far.port}`}</strong>
        {end.port ? <span className="port-mgr__media">{`${PORT_MEDIA_LABEL[end.port.media]} ${end.port.speed}`}</span> : null}
      </p>
      <div className="port-mgr__row">
        <TextField id={`link-${linkId}-label`} label={m.ports.cableLabel} value={link.label} onCommit={(v) => commit({ type: 'link/update', id: linkId, patch: { label: v } }, `link:${linkId}:label`)} />
        <label className="field">
          <span className="field__label">{m.ports.cableType}</span>
          <span className="field__box">
            <select
              className="field__input"
              aria-label={m.ports.cableType}
              value={link.cable ?? ''}
              onChange={(e) => onError(commit({ type: 'link/update', id: linkId, patch: { cable: (e.target.value || null) as CableType | null } }))}
            >
              <option value="">{m.ports.notSet}</option>
              {CABLE_TYPES.map((c) => (
                <option key={c} value={c}>
                  {CABLE_LABEL[c]}
                </option>
              ))}
            </select>
          </span>
        </label>
        <button type="button" className="btn btn--sm" onClick={() => onError(commit({ type: 'link/remove', id: linkId }))}>
          {m.ports.unlink}
        </button>
      </div>
    </div>
  );
}

function LinkPicker({ content, from, commit, onError }: { content: PlanContent; from: { deviceId: Id; port: string }; commit: CommitFn; onError: (e: string | null) => void }) {
  const m = useT();
  const owners = useMemo(() => portOwners(content), [content]);
  const [deviceId, setDeviceId] = useState('');
  const [port, setPort] = useState('');
  const fromPort = describeEnd(content, from).port;
  const fromMedia = fromPort?.media;
  const target = owners.find((o) => o.id === deviceId);
  const free = (target?.ports ?? []).filter((p) => !(deviceId === from.deviceId && p.name === from.port) && !linkAt(content, { deviceId, port: p.name }));
  // Linking to a device without a spare port adds one: servers often have no ports in their template.
  const newName = !target ? '' : target.ports.length ? nextPortName(target.ports) : FIRST_PORT;
  const link = (): void => {
    let problem: string | null = null;
    if (port === NEW_PORT) problem = commit({ type: 'port/add', deviceId, port: { name: newName, media: fromMedia ?? 'rj45', speed: fromPort?.speed ?? '1G' } });
    if (!problem) problem = commit({ type: 'link/add', link: { id: newId(), a: from, b: { deviceId, port: port === NEW_PORT ? newName : port }, label: '', cable: null } });
    onError(problem);
    if (!problem) {
      setDeviceId('');
      setPort('');
    }
  };
  return (
    <div className="port-mgr__link">
      <p className="port-mgr__link-to">{m.ports.notLinked}</p>
      <div className="port-mgr__row">
        <label className="field">
          <span className="field__label">{m.ports.linkDevice}</span>
          <span className="field__box">
            <select
              className="field__input"
              aria-label={m.ports.linkDevice}
              value={deviceId}
              onChange={(e) => {
                setDeviceId(e.target.value);
                setPort('');
              }}
            >
              <option value="">{m.ports.choose}</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>{`${o.rack} · ${o.name}`}</option>
              ))}
            </select>
          </span>
        </label>
        <label className="field">
          <span className="field__label">{m.ports.linkPort}</span>
          <span className="field__box">
            <select className="field__input" aria-label={m.ports.linkPort} value={port} disabled={!deviceId} onChange={(e) => setPort(e.target.value)}>
              <option value="">{m.ports.choose}</option>
              {free.map((p) => (
                <option key={p.name} value={p.name}>
                  {`${p.name}${p.media !== fromMedia ? ` (${PORT_MEDIA_LABEL[p.media]})` : ''}`}
                </option>
              ))}
              {deviceId ? <option value={NEW_PORT}>{m.ports.newPort(newName)}</option> : null}
            </select>
          </span>
        </label>
        <button type="button" className="btn btn--sm btn--ink" disabled={!deviceId || !port} onClick={link}>
          {m.ports.link}
        </button>
      </div>
    </div>
  );
}

/**
 * Renaming re-points the port's link, so it commits once on Enter or blur rather than per keystroke.
 * Escape puts the old name back.
 */
function PortNameField({ id, value, onCommit }: { id: string; value: string; onCommit: (v: string) => string | null }) {
  const m = useT();
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setText(value), [value]);
  const commitText = (): void => {
    if (text.trim() === value) {
      setText(value);
      setError(null);
      return;
    }
    setError(onCommit(text));
  };
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {m.ports.name}
      </label>
      <div className={`field__box${error ? ' field__box--error' : ''}`}>
        <input
          id={id}
          className="field__input mono"
          autoComplete="off"
          value={text}
          aria-invalid={error !== null}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitText();
            if (e.key === 'Escape') {
              setText(value);
              setError(null);
            }
          }}
        />
      </div>
      {error ? (
        <p id={`${id}-error`} className="field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
