import type { PlanContent } from '@glasshouse/domain';
import { useMemo, useState, type FormEvent } from 'react';
import { useT } from '../../i18n';
import type { CommitFn } from '../../store/hooks';
import { IconPlus, IconTrash } from '../../ui/icons';
import { vlanUsage } from './vlanUsage';

/** The room's VLANs: ID, name and how many ports use each. Changing an ID follows onto the ports. */
export function VlanList({ content, commit, readOnly }: { content: PlanContent; commit: CommitFn; readOnly: boolean }) {
  const m = useT();
  const usage = useMemo(() => vlanUsage(content), [content]);
  const [vid, setVid] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = (e: FormEvent): void => {
    e.preventDefault();
    const problem = commit({ type: 'vlan/add', vlan: { vid: Number(vid), name } });
    setError(problem);
    if (!problem) {
      setVid('');
      setName('');
    }
  };
  return (
    <section className="vlans glass" aria-labelledby="vlans-h">
      <h2 id="vlans-h">{m.vlans.title}</h2>
      <p className="vlans__note">{m.vlans.note}</p>
      <fieldset className="inspector__lock" disabled={readOnly}>
        {content.vlans.length === 0 ? (
          <p className="vlans__note">{m.vlans.empty}</p>
        ) : (
          <table className="vlans__table">
            <thead>
              <tr>
                <th scope="col">{m.vlans.vid}</th>
                <th scope="col">{m.vlans.name}</th>
                <th scope="col">{m.vlans.ports}</th>
                <th scope="col" aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {content.vlans.map((v) => (
                <tr key={v.vid}>
                  <td>
                    <VidInput vid={v.vid} label={m.vlans.idOf(v.vid)} onCommit={(to) => setError(to === v.vid ? null : commit({ type: 'vlan/update', vid: v.vid, patch: { vid: to } }))} />
                  </td>
                  <td>
                    <input
                      className="field__input vlans__name"
                      aria-label={m.vlans.nameOf(v.vid)}
                      value={v.name}
                      onChange={(e) => setError(commit({ type: 'vlan/update', vid: v.vid, patch: { name: e.target.value } }, `vlan:${v.vid}:name`))}
                    />
                  </td>
                  <td className="mono vlans__used">{m.vlans.usedBy(usage.get(v.vid) ?? 0)}</td>
                  <td>
                    <button type="button" className="icon-btn icon-btn--sm" aria-label={m.vlans.remove(v.vid)} onClick={() => setError(commit({ type: 'vlan/remove', vid: v.vid }))}>
                      <IconTrash />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form className="vlans__add" onSubmit={add}>
          <input className="field__input mono" aria-label={m.vlans.newVid} placeholder={m.vlans.vid} inputMode="numeric" value={vid} onChange={(e) => setVid(e.target.value)} />
          <input className="field__input" aria-label={m.vlans.newName} placeholder={m.vlans.name} value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn btn--sm" disabled={vid.trim() === ''}>
            <IconPlus />
            {m.vlans.add}
          </button>
        </form>
      </fieldset>
      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/** A VLAN ID edits on blur or Enter: every keystroke would re-point ports to half-typed IDs. */
function VidInput({ vid, label, onCommit }: { vid: number; label: string; onCommit: (to: number) => void }) {
  const [text, setText] = useState(String(vid));
  const done = (): void => {
    const to = Number(text);
    if (Number.isInteger(to) && text.trim() !== '') onCommit(to);
    else setText(String(vid));
  };
  return (
    <input
      className="field__input mono vlans__vid"
      aria-label={label}
      inputMode="numeric"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => {
        if (e.key === 'Enter') done();
        if (e.key === 'Escape') setText(String(vid));
      }}
    />
  );
}
