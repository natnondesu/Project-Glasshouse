import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { Role } from '../../auth/authApi';
import { useCan } from '../../auth/useCan';
import { useT } from '../../i18n';
import { formatTime } from '../../ui/time';
import { createUser, listUsers, resetPassword, updateUser, type AdminUser } from './adminApi';
import '../../ui/fields.css';
import '../review/review.css';
import './users.css';

const ROLES: Role[] = ['viewer', 'editor', 'reviewer', 'admin'];

export function UsersScreen() {
  const m = useT();
  const can = useCan();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ who: string; password: string } | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('editor');

  useEffect(() => {
    if (!can.admin) return;
    listUsers().then(setUsers, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [can.admin]);

  if (!can.admin) {
    return (
      <section className="users glass">
        <p>{m.users.adminsOnly}</p>
        <Link to="/" className="btn btn--sm">{m.shell.backToProjects}</Link>
      </section>
    );
  }

  const run = async (work: () => Promise<void>): Promise<void> => {
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const replace = (u: AdminUser): void => setUsers((list) => (list ?? []).map((x) => (x.id === u.id ? u : x)));
  const add = (e: FormEvent): void => {
    e.preventDefault();
    void run(async () => {
      const r = await createUser({ email: email.trim(), displayName: name.trim(), role });
      setUsers((list) => [...(list ?? []), r.user]);
      setSecret({ who: r.user.email, password: r.temporaryPassword });
      setEmail('');
      setName('');
    });
  };

  return (
    <section className="users glass" aria-labelledby="users-h">
      <h1 id="users-h">{m.users.title}</h1>
      <p className="review-note">{m.users.note}</p>
      {error ? <p role="alert" className="field__error">{error}</p> : null}
      {secret ? (
        <div className="users__secret" role="status">
          <p>{m.users.tempFor(secret.who)}</p>
          <code className="mono">{secret.password}</code>
          <p className="review-note">{m.users.shownOnce}</p>
          <button type="button" className="btn btn--sm" onClick={() => setSecret(null)}>{m.common.close}</button>
        </div>
      ) : null}
      <div className="users__scroll" role="region" aria-label={m.users.title} tabIndex={0}>
        <table className="users__table">
          <thead>
            <tr><th>{m.users.name}</th><th>{m.users.email}</th><th>{m.users.role}</th><th>{m.users.signIn}</th><th>{m.users.status}</th><th>{m.users.lastSignIn}</th><th /></tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => (
              <tr key={u.id} aria-label={u.displayName}>
                <td>{u.displayName}{u.mustChangePassword ? <span className="users__flag">{m.users.mustChange}</span> : null}</td>
                <td>{u.email}</td>
                <td>
                  <select className="users__select" aria-label={m.users.roleFor(u.displayName)} value={u.role} onChange={(e) => void run(async () => replace(await updateUser(u.id, { role: e.target.value as Role })))}>
                    {ROLES.map((r) => <option key={r} value={r}>{m.auth.role[r]}</option>)}
                  </select>
                </td>
                <td>{u.source === 'oidc' ? m.users.sso : m.users.local}</td>
                <td>
                  <button type="button" className={`btn btn--sm btn--quiet users__status users__status--${u.active ? 'on' : 'off'}`} aria-label={m.users.toggleFor(u.displayName, u.active)} onClick={() => void run(async () => replace(await updateUser(u.id, { active: !u.active })))}>
                    {u.active ? m.users.active : m.users.off}
                  </button>
                </td>
                <td className="mono">{u.lastLoginAt ? formatTime(u.lastLoginAt) : m.common.none}</td>
                <td>
                  {u.source === 'local' ? (
                    <button type="button" className="btn btn--sm btn--quiet" aria-label={m.users.resetFor(u.displayName)} onClick={() => void run(async () => setSecret({ who: u.email, password: (await resetPassword(u.id)).temporaryPassword }))}>
                      {m.users.reset}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="users__add review-form" onSubmit={add} aria-labelledby="users-add-h">
        <h2 id="users-add-h">{m.users.addTitle}</h2>
        <div className="field"><label htmlFor="nu-email" className="field__label">{m.users.email}</label><div className="field__box"><input id="nu-email" className="field__input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div></div>
        <div className="field"><label htmlFor="nu-name" className="field__label">{m.users.name}</label><div className="field__box"><input id="nu-name" className="field__input" value={name} onChange={(e) => setName(e.target.value)} required /></div></div>
        <div className="field"><label htmlFor="nu-role" className="field__label">{m.users.role}</label><div className="field__box"><select id="nu-role" className="field__input" value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{m.auth.role[r]}</option>)}</select></div></div>
        <button type="submit" className="btn btn--ink">{m.users.add}</button>
      </form>
    </section>
  );
}
