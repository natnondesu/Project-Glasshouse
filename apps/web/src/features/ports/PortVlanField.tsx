import { carriedVids, effectiveVlan, vlanLabel, type Id, type PlanContent, type Port, type PortVlan } from '@glasshouse/domain';
import { useState } from 'react';
import { Link } from 'react-router';
import { useT } from '../../i18n';
import type { CommitFn } from '../../store/hooks';

interface PortVlanFieldProps {
  content: PlanContent;
  roomId: Id;
  deviceId: Id;
  port: Port;
  commit: CommitFn;
}

/** Access with one VLAN, or a trunk with its allowed list and native VLAN. */
export function PortVlanField({ content, roomId, deviceId, port, commit }: PortVlanFieldProps) {
  const m = useT();
  const [error, setError] = useState<string | null>(null);
  const v = port.vlan;
  const inherited = v ? null : effectiveVlan(content, { deviceId, port: port.name });
  const set = (vlan: PortVlan | null): void => setError(commit({ type: 'port/vlan', deviceId, name: port.name, vlan }));
  const vids = content.vlans.map((x) => x.vid);
  const label = (vid: number): string => {
    const name = content.vlans.find((x) => x.vid === vid)?.name;
    return name ? `${vid} · ${name}` : String(vid);
  };

  if (vids.length === 0) {
    return (
      <div className="port-vlan">
        <span className="field__label">{m.vlans.section}</span>
        <p className="port-vlan__note">
          {m.vlans.noneInRoom} <Link to={`/rooms/${roomId}/network`}>{m.vlans.defineOnNetwork}</Link>
        </p>
      </div>
    );
  }

  const chooseMode = (mode: string): void => {
    if (mode === '') set(null);
    else if (mode === 'access') set({ mode: 'access', vid: v?.mode === 'trunk' && v.native !== null ? v.native : vids[0]! });
    else set({ mode: 'trunk', allowed: 'all', native: v?.mode === 'access' ? v.vid : null });
  };
  const toggle = (vid: number, on: boolean): void => {
    if (v?.mode !== 'trunk') return;
    const current = v.allowed === 'all' ? vids : v.allowed;
    const allowed = on ? [...current, vid] : current.filter((x) => x !== vid);
    set({ mode: 'trunk', allowed, native: v.native !== null && allowed.includes(v.native) ? v.native : null });
  };

  return (
    <div className="port-vlan" role="group" aria-label={m.vlans.section}>
      <div className="port-mgr__row port-vlan__row">
        <label className="field">
          <span className="field__label">{m.vlans.mode}</span>
          <span className="field__box">
            <select className="field__input" value={v?.mode ?? ''} onChange={(e) => chooseMode(e.target.value)}>
              <option value="">{m.vlans.modeNone}</option>
              <option value="access">{m.vlans.access}</option>
              <option value="trunk">{m.vlans.trunk}</option>
            </select>
          </span>
        </label>
        {v?.mode === 'access' ? (
          <label className="field">
            <span className="field__label">{m.vlans.vlan}</span>
            <span className="field__box">
              <select className="field__input" value={v.vid} onChange={(e) => set({ mode: 'access', vid: Number(e.target.value) })}>
                {vids.map((vid) => (
                  <option key={vid} value={vid}>
                    {label(vid)}
                  </option>
                ))}
              </select>
            </span>
          </label>
        ) : null}
        {v?.mode === 'trunk' ? (
          <label className="field">
            <span className="field__label">{m.vlans.native}</span>
            <span className="field__box">
              <select className="field__input" value={v.native ?? ''} onChange={(e) => set({ ...v, native: e.target.value ? Number(e.target.value) : null })}>
                <option value="">{m.vlans.nativeNone}</option>
                {carriedVids(content, { ...v, native: null }).map((vid) => (
                  <option key={vid} value={vid}>
                    {label(vid)}
                  </option>
                ))}
              </select>
            </span>
          </label>
        ) : null}
      </div>
      {inherited?.from ? (
        <p className="port-vlan__note port-vlan__inherited">
          {m.vlans.inherited(inherited.vlan.mode === 'access' ? `VLAN ${label(inherited.vlan.vid)}` : vlanLabel(inherited.vlan), inherited.from.device, inherited.from.port)}
        </p>
      ) : null}
      {v?.mode === 'trunk' ? (
        <fieldset className="port-vlan__allowed">
          <legend className="field__label">{m.vlans.allowed}</legend>
          <label className="port-vlan__check">
            <input type="checkbox" checked={v.allowed === 'all'} onChange={(e) => set({ ...v, allowed: e.target.checked ? 'all' : vids })} />
            {m.vlans.allVlans}
          </label>
          {v.allowed === 'all'
            ? null
            : vids.map((vid) => (
                <label key={vid} className="port-vlan__check">
                  <input type="checkbox" checked={v.allowed !== 'all' && v.allowed.includes(vid)} onChange={(e) => toggle(vid, e.target.checked)} />
                  {label(vid)}
                </label>
              ))}
        </fieldset>
      ) : null}
      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
