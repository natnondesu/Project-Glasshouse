import { currentRevision, findRoom, linkAt, resolveRemote, siteRooms, type Id, type Port, type PortRef, type RemoteEnd } from '@glasshouse/domain';
import { useMemo, useState } from 'react';
import { useT } from '../../i18n';
import type { CommitFn } from '../../store/hooks';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { DevicePicker } from './DevicePicker';
import { portOwners } from './portOwners';

/** Is `p` in another room free to be this port's far end: not cabled there, and not an uplink to somewhere else? */
const freeFor = (p: Port, me: PortRef & { roomId: Id }, cabled: boolean): boolean =>
  !cabled && (!p.remote || (p.remote.roomId === me.roomId && p.remote.deviceId === me.deviceId && p.remote.port === me.port));

/** Picks the far end of an uplink in another room of the site, and (by default) sets that end to point back. */
export function RemotePicker({ roomId, deviceId, port, commit, onDone }: { roomId: Id; deviceId: Id; port: Port; commit: CommitFn; onDone: () => void }) {
  const m = useT();
  const ws = useWorkspaceStore((s) => s.workspace);
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const rooms = siteRooms(ws, roomId);
  const site = findRoom(ws, roomId)?.site.name ?? '';
  const [farRoomId, setFarRoomId] = useState(rooms[0]?.id ?? '');
  const [farDevice, setFarDevice] = useState('');
  const [farPort, setFarPort] = useState('');
  const [pointBack, setPointBack] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const farRoom = rooms.find((r) => r.id === farRoomId) ?? null;
  const farContent = farRoom ? currentRevision(farRoom.plan).content : null;
  const owners = useMemo(() => (farContent ? portOwners(farContent) : []), [farContent]);
  const me = { roomId, deviceId, port: port.name };
  const freeOn = (id: Id): Port[] => (farContent ? (owners.find((o) => o.id === id)?.ports ?? []).filter((p) => freeFor(p, me, Boolean(linkAt(farContent, { deviceId: id, port: p.name })))) : []);

  if (rooms.length === 0) return <p className="port-mgr__link-to">{m.uplink.noRooms}</p>;

  const link = (): void => {
    if (!farRoom) return;
    const remote: RemoteEnd = { roomId: farRoom.id, deviceId: farDevice, port: farPort };
    const problem = commit({ type: 'port/remote', deviceId, name: port.name, remote });
    if (problem) return setError(problem);
    // The far room approves on its own: its end is set only while it is a draft.
    if (pointBack && currentRevision(farRoom.plan).state === 'draft') {
      const back = dispatch({ type: 'plan', roomId: farRoom.id, command: { type: 'port/remote', deviceId: farDevice, name: farPort, remote: { roomId, deviceId, port: port.name } } });
      if (back) return setError(back.message);
    }
    onDone();
  };

  return (
    <div className="port-mgr__link port-mgr__remote">
      <p className="port-mgr__link-to">{m.uplink.anotherIn(site)}</p>
      <div className="port-mgr__row port-mgr__row--pick port-mgr__row--remote">
        <label className="field">
          <span className="field__label">{m.uplink.room}</span>
          <span className="field__box">
            <select
              className="field__input"
              value={farRoomId}
              onChange={(e) => {
                setFarRoomId(e.target.value);
                setFarDevice('');
                setFarPort('');
              }}
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </span>
        </label>
        <DevicePicker
          owners={owners}
          freeOf={(id) => freeOn(id).length}
          value={farDevice}
          onChange={(id) => {
            setFarDevice(id);
            setFarPort('');
          }}
        />
        <label className="field">
          <span className="field__label">{m.uplink.port}</span>
          <span className="field__box">
            <select className="field__input" aria-label={m.uplink.port} value={farPort} disabled={!farDevice} onChange={(e) => setFarPort(e.target.value)}>
              <option value="">{m.uplink.choose}</option>
              {freeOn(farDevice).map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </span>
        </label>
      </div>
      <label className="port-vlan__check">
        <input type="checkbox" checked={pointBack} onChange={(e) => setPointBack(e.target.checked)} />
        {m.uplink.pointBack}
      </label>
      {farRoom && currentRevision(farRoom.plan).state !== 'draft' ? <p className="port-mgr__remote-note">{m.uplink.farFrozen(farRoom.name)}</p> : null}
      <div className="port-mgr__row-actions">
        <button type="button" className="btn btn--sm btn--ink" disabled={!farDevice || !farPort} onClick={link}>
          {m.uplink.link}
        </button>
        <button type="button" className="btn btn--sm btn--quiet" onClick={onDone}>
          {m.common.cancel}
        </button>
      </div>
      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A port that is an uplink: where it goes, whether the far end agrees, and Unlink (both ends while the far room is a draft). */
export function RemoteLinked({ roomId, deviceId, port, commit }: { roomId: Id; deviceId: Id; port: Port & { remote: RemoteEnd }; commit: CommitFn }) {
  const m = useT();
  const ws = useWorkspaceStore((s) => s.workspace);
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const [error, setError] = useState<string | null>(null);
  const far = resolveRemote(ws, port.remote);
  const farContent = far.room ? currentRevision(far.room.plan).content : null;
  const back = far.port?.remote;
  const pointsBack = Boolean(back && back.roomId === roomId && back.deviceId === deviceId && back.port === port.name);
  const status = !far.port ? m.uplink.missing : farContent && far.device && linkAt(farContent, { deviceId: far.device.id, port: far.port.name }) ? m.uplink.conflict : pointsBack ? m.uplink.paired : m.uplink.notBack;
  const unlink = (): void => {
    const problem = commit({ type: 'port/remote', deviceId, name: port.name, remote: null });
    if (problem) return setError(problem);
    if (pointsBack && far.room && far.device && currentRevision(far.room.plan).state === 'draft') {
      const r = dispatch({ type: 'plan', roomId: far.room.id, command: { type: 'port/remote', deviceId: far.device.id, name: port.remote.port, remote: null } });
      if (r) setError(r.message);
    }
  };
  return (
    <div className="port-mgr__link port-mgr__remote">
      <p className="port-mgr__link-to">
        {m.uplink.to} <strong className="mono">{`${far.device?.name ?? m.uplink.gone} ${port.remote.port}`}</strong>
        <span className="port-mgr__media">{far.room ? `${far.room.name}${far.device ? ` · ${far.device.rack}` : ''}` : m.uplink.gone}</span>
      </p>
      <p className={`port-mgr__remote-status${pointsBack && far.port ? ' is-ok' : ''}`} role="status">
        {status}
      </p>
      <button type="button" className="btn btn--sm" onClick={unlink}>
        {m.uplink.unlink}
      </button>
      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
