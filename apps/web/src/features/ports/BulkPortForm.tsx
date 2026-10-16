import { PORT_MEDIA, PORT_MEDIA_LABEL, PORT_SPEEDS, portsOf, vlanLabel, type BulkPortPatch, type Id, type PlanContent, type PortMedia } from '@glasshouse/domain';
import { useState } from 'react';
import { useT } from '../../i18n';
import type { CommitFn } from '../../store/hooks';

interface BulkPortFormProps {
  content: PlanContent;
  deviceId: Id;
  names: string[];
  commit: CommitFn;
  readOnly: boolean;
  onClear: () => void;
}

type VlanMode = 'keep' | 'none' | 'access' | 'trunk';
interface Draft {
  media: PortMedia | '';
  speed: string;
  lag: string;
  clearLag: boolean;
  vlanMode: VlanMode;
  vid: number | null;
  allowed: 'all' | number[];
  native: number | null;
}
const EMPTY: Draft = { media: '', speed: '', lag: '', clearLag: false, vlanMode: 'keep', vid: null, allowed: 'all', native: null };

/** The one value every selected port shares, or null when they differ. */
function common<T>(values: T[]): T | null {
  const [first] = values;
  return values.every((v) => v === first) ? (first ?? null) : null;
}

/** Only what's filled in is sent: blank fields leave each port as it is. */
export function patchOf(d: Draft): BulkPortPatch {
  const patch: BulkPortPatch = {};
  if (d.media) patch.media = d.media;
  if (d.speed) patch.speed = d.speed;
  if (d.clearLag) patch.lag = '';
  else if (d.lag.trim()) patch.lag = d.lag.trim();
  if (d.vlanMode === 'none') patch.vlan = null;
  if (d.vlanMode === 'access' && d.vid !== null) patch.vlan = { mode: 'access', vid: d.vid };
  if (d.vlanMode === 'trunk') patch.vlan = { mode: 'trunk', allowed: d.allowed, native: d.native };
  return patch;
}

/** Several ports picked on the faceplate: change some fields on all of them at once. */
export function BulkPortForm({ content, deviceId, names, commit, readOnly, onClear }: BulkPortFormProps) {
  const m = useT();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const all = portsOf(content, deviceId);
  const picked = all.filter((p) => names.includes(p.name));
  const vids = content.vlans.map((v) => v.vid);
  const set = (patch: Partial<Draft>): void => {
    setDraft((d) => ({ ...d, ...patch }));
    setDone(null);
  };
  const keep = (value: string | null): string => (value === null ? m.ports.bulk.keepMixed : m.ports.bulk.keepValue(value));
  const patch = patchOf(draft);
  const changes = Object.keys(patch).length;
  // A LAG shares one VLAN, so members outside the selection change with it.
  const lagsHit = patch.vlan !== undefined ? [...new Set(picked.map((p) => p.lag).filter((l): l is string => Boolean(l)))] : [];
  const outside = lagsHit.flatMap((lag) => all.filter((p) => p.lag === lag && !names.includes(p.name)).map((p) => p.name));
  const vlanName = (vid: number): string => {
    const name = content.vlans.find((v) => v.vid === vid)?.name;
    return name ? `${vid} · ${name}` : String(vid);
  };

  const apply = (): void => {
    const problem = commit({ type: 'port/bulk', deviceId, names, patch });
    setError(problem);
    if (!problem) {
      setDraft(EMPTY);
      setDone(names.length);
    }
  };

  return (
    <fieldset className="port-mgr__detail port-bulk" disabled={readOnly}>
      <legend className="visually-hidden">{m.ports.bulk.legend(names.length)}</legend>
      <div className="port-bulk__head">
        <p>
          <strong>{m.ports.bulk.selected(names.length)}</strong> <span className="mono port-bulk__names">{names.join(', ')}</span>
        </p>
        <button type="button" className="btn btn--sm btn--quiet" onClick={onClear}>
          {m.ports.bulk.clear}
        </button>
      </div>
      <p className="port-bulk__note">{m.ports.bulk.note}</p>
      <div className="port-mgr__row port-bulk__row">
        <label className="field">
          <span className="field__label">{m.ports.type}</span>
          <span className="field__box">
            <select className="field__input" value={draft.media} onChange={(e) => set({ media: e.target.value as PortMedia | '' })}>
              <option value="">{keep(common(picked.map((p) => PORT_MEDIA_LABEL[p.media])))}</option>
              {PORT_MEDIA.map((x) => (
                <option key={x} value={x}>
                  {PORT_MEDIA_LABEL[x]}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className="field">
          <span className="field__label">{m.ports.speed}</span>
          <span className="field__box">
            <select className="field__input" value={draft.speed} onChange={(e) => set({ speed: e.target.value })}>
              <option value="">{keep(common(picked.map((p) => p.speed)))}</option>
              {PORT_SPEEDS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </span>
        </label>
      </div>
      <div className="port-mgr__row port-bulk__row port-bulk__row--lag">
        <label className="field">
          <span className="field__label">{m.ports.lag}</span>
          <span className="field__box">
            <input
              className="field__input mono"
              autoComplete="off"
              value={draft.lag}
              disabled={draft.clearLag}
              placeholder={keep(common(picked.map((p) => p.lag ?? m.ports.bulk.noLag)))}
              onChange={(e) => set({ lag: e.target.value })}
            />
          </span>
        </label>
        <label className="port-vlan__check port-bulk__clear-lag">
          <input type="checkbox" checked={draft.clearLag} onChange={(e) => set({ clearLag: e.target.checked, lag: '' })} />
          {m.ports.bulk.clearLag}
        </label>
      </div>
      {vids.length > 0 ? (
        <div className="port-vlan">
          <div className="port-mgr__row port-vlan__row">
            <label className="field">
              <span className="field__label">{m.vlans.mode}</span>
              <span className="field__box">
                <select className="field__input" value={draft.vlanMode} onChange={(e) => set({ vlanMode: e.target.value as VlanMode, vid: draft.vid ?? vids[0]! })}>
                  <option value="keep">{keep(common(picked.map((p) => (p.vlan ? vlanLabel(p.vlan) : m.vlans.modeNone))))}</option>
                  <option value="none">{m.vlans.modeNone}</option>
                  <option value="access">{m.vlans.access}</option>
                  <option value="trunk">{m.vlans.trunk}</option>
                </select>
              </span>
            </label>
            {draft.vlanMode === 'access' ? (
              <label className="field">
                <span className="field__label">{m.vlans.vlan}</span>
                <span className="field__box">
                  <select className="field__input" value={draft.vid ?? ''} onChange={(e) => set({ vid: Number(e.target.value) })}>
                    {vids.map((vid) => (
                      <option key={vid} value={vid}>
                        {vlanName(vid)}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
            ) : null}
            {draft.vlanMode === 'trunk' ? (
              <label className="field">
                <span className="field__label">{m.vlans.native}</span>
                <span className="field__box">
                  <select className="field__input" value={draft.native ?? ''} onChange={(e) => set({ native: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">{m.vlans.nativeNone}</option>
                    {(draft.allowed === 'all' ? vids : draft.allowed).map((vid) => (
                      <option key={vid} value={vid}>
                        {vlanName(vid)}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
            ) : null}
          </div>
          {draft.vlanMode === 'trunk' ? (
            <fieldset className="port-vlan__allowed">
              <legend className="field__label">{m.vlans.allowed}</legend>
              <label className="port-vlan__check">
                <input type="checkbox" checked={draft.allowed === 'all'} onChange={(e) => set({ allowed: e.target.checked ? 'all' : vids })} />
                {m.vlans.allVlans}
              </label>
              {draft.allowed === 'all'
                ? null
                : vids.map((vid) => {
                    const allowed = draft.allowed as number[];
                    return (
                      <label key={vid} className="port-vlan__check">
                        <input
                          type="checkbox"
                          checked={allowed.includes(vid)}
                          onChange={(e) => {
                            const next = e.target.checked ? [...allowed, vid].sort((a, b) => a - b) : allowed.filter((x) => x !== vid);
                            set({ allowed: next, native: draft.native !== null && next.includes(draft.native) ? draft.native : null });
                          }}
                        />
                        {vlanName(vid)}
                      </label>
                    );
                  })}
            </fieldset>
          ) : null}
        </div>
      ) : null}
      {outside.length > 0 ? <p className="port-bulk__warn">{m.ports.bulk.lagOutside(lagsHit.join(', '), outside.join(', '))}</p> : null}
      <div className="port-bulk__actions">
        <button type="button" className="btn btn--sm btn--ink" disabled={changes === 0} onClick={apply}>
          {m.ports.bulk.apply(names.length)}
        </button>
        {done !== null ? (
          <span role="status" className="port-bulk__done">
            {m.ports.bulk.applied(done)}
          </span>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
