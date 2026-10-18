import { useState, type FormEvent } from 'react';
import type { Role } from '../../auth/authApi';
import { useT } from '../../i18n';
import { ROLES } from './userFilters';

export const ADD_PANEL_ID = 'users-add';

/** Adding a password account: rare under company sign-in, so it opens in place under the toolbar and closes with Escape. */
export function AddUserPanel({ onAdd, onClose }: { onAdd: (input: { email: string; displayName: string; role: Role }) => Promise<boolean>; onClose: () => void }) {
  const m = useT();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('editor');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    const added = await onAdd({ email: email.trim(), displayName: name.trim(), role });
    setBusy(false);
    if (added) onClose();
  };
  return (
    <form
      id={ADD_PANEL_ID}
      className="users-add"
      aria-labelledby="users-add-h"
      onSubmit={(e) => void submit(e)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <h2 id="users-add-h">{m.users.addTitle}</h2>
      <div className="users-add__fields">
        <div className="field users-add__email">
          <label htmlFor="nu-email" className="field__label">{m.users.email}</label>
          <div className="field__box">
            <input id="nu-email" className="field__input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
        </div>
        <div className="field users-add__name">
          <label htmlFor="nu-name" className="field__label">{m.users.name}</label>
          <div className="field__box">
            <input id="nu-name" className="field__input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
          </div>
        </div>
        <div className="field users-add__role">
          <label htmlFor="nu-role" className="field__label">{m.users.role}</label>
          <div className="field__box">
            <select id="nu-role" className="field__input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => <option key={r} value={r}>{m.auth.role[r]}</option>)}
            </select>
          </div>
        </div>
        <div className="users-add__actions">
          <button type="button" className="btn btn--sm btn--quiet" onClick={onClose}>{m.users.cancel}</button>
          <button type="submit" className="btn btn--sm btn--ink" disabled={busy}>{m.users.add}</button>
        </div>
      </div>
    </form>
  );
}
