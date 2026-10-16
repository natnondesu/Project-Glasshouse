import { findRackDevice, formatURange, MAX_STACK_MEMBERS, newId, nextMemberNumber, stackOf, stacksOf, type Id, type PlanContent } from '@glasshouse/domain';
import { useState } from 'react';
import type { CommitFn } from '../../store/hooks';
import { TextField } from '../../ui/TextField';
import { useT } from '../../i18n';

const NEW = '__new__';

/** "ICON-CS-B10-01" → "ICON-CS-B10": what the members of a stack are usually named after. */
export const stackNameFor = (deviceName: string): string => deviceName.replace(/[-_ ]?\d+$/, '') || deviceName;

/** A switch's stack: join one (or start one), its member number, and the other members. */
export function StackField({ content, deviceId, commit, onSelect, readOnly }: { content: PlanContent; deviceId: Id; commit: CommitFn; onSelect: (id: string) => void; readOnly: boolean }) {
  const m = useT();
  const device = findRackDevice(content, deviceId)?.device;
  const mine = stackOf(content, deviceId);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState(() => stackNameFor(device?.name ?? ''));
  const [error, setError] = useState<string | null>(null);
  if (!device) return null;

  if (!mine) {
    const stacks = stacksOf(content);
    return (
      <fieldset className="inspector__group stack-field" disabled={readOnly}>
        <legend className="lbl">{m.stack.title}</legend>
        {creating ? (
          <div className="stack-field__new">
            <TextField id={`${deviceId}-stack-name`} label={m.stack.name} value={name} onCommit={(v) => (setName(v), null)} />
            <div className="stack-field__actions">
              <button
                type="button"
                className="btn btn--sm btn--ink"
                onClick={() => {
                  const problem = commit({ type: 'stack/create', stack: { id: newId(), name, members: [{ deviceId, member: 1 }] } });
                  setError(problem);
                  if (!problem) setCreating(false);
                }}
              >
                {m.stack.create}
              </button>
              <button type="button" className="btn btn--sm btn--quiet" onClick={() => setCreating(false)}>
                {m.common.cancel}
              </button>
            </div>
          </div>
        ) : (
          <label className="field">
            <span className="field__label">{m.stack.notStacked}</span>
            <span className="field__box">
              <select
                className="field__input"
                value=""
                onChange={(e) => {
                  if (e.target.value === NEW) return setCreating(true);
                  const stack = stacks.find((s) => s.id === e.target.value);
                  if (stack) setError(commit({ type: 'stack/member', id: stack.id, deviceId, member: nextMemberNumber(stack) }));
                }}
              >
                <option value="">{m.stack.join}</option>
                {stacks.map((s) => (
                  <option key={s.id} value={s.id} disabled={s.members.length >= MAX_STACK_MEMBERS}>
                    {m.stack.option(s.name, s.members.length)}
                  </option>
                ))}
                <option value={NEW}>{m.stack.newStack}</option>
              </select>
            </span>
          </label>
        )}
        {error ? (
          <p role="alert" className="field__error">
            {error}
          </p>
        ) : null}
      </fieldset>
    );
  }

  const { stack, member } = mine;
  const taken = new Set(stack.members.filter((x) => x.deviceId !== deviceId).map((x) => x.member));
  return (
    <fieldset className="inspector__group stack-field" disabled={readOnly}>
      <legend className="lbl">{m.stack.title}</legend>
      <div className="field-pair">
        <TextField id={`${stack.id}-name`} label={m.stack.name} value={stack.name} onCommit={(v) => commit({ type: 'stack/rename', id: stack.id, name: v })} />
        <label className="field">
          <span className="field__label">{m.stack.member}</span>
          <span className="field__box">
            <select className="field__input mono" value={member} onChange={(e) => setError(commit({ type: 'stack/member', id: stack.id, deviceId, member: Number(e.target.value) }))}>
              {Array.from({ length: MAX_STACK_MEMBERS }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n} disabled={taken.has(n)}>
                  {n}
                </option>
              ))}
            </select>
          </span>
        </label>
      </div>
      <p className="inspector__note">{m.stack.portsHint(member)}</p>
      <ul className="stack-field__members" aria-label={m.stack.members(stack.name)}>
        {stack.members.map((x) => {
          const found = findRackDevice(content, x.deviceId);
          if (!found) return null;
          return (
            <li key={x.deviceId}>
              <span className="stack-field__no mono">{x.member}</span>
              {x.deviceId === deviceId ? (
                <span className="mono">{found.device.name}</span>
              ) : (
                <button type="button" className="stack-field__goto mono" onClick={() => onSelect(x.deviceId)}>
                  {found.device.name}
                </button>
              )}
              <span className="stack-field__where">{`${found.rack.name} · ${formatURange(found.device)}`}</span>
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn btn--sm btn--quiet" onClick={() => setError(commit({ type: 'stack/member', id: stack.id, deviceId, member: null }))}>
        {stack.members.length === 1 ? m.stack.dissolve : m.stack.leave}
      </button>
      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
