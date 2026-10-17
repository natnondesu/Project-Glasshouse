import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useT } from '../i18n';
import { logout } from './authApi';
import { useAuthStore } from './authStore';
import './auth.css';

/** The user corner of the title block (server mode with sign-in): who you are, your role, Users for admins, sign out. */
export function UserMenu() {
  const m = useT();
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!user) return null;
  const signOut = async (): Promise<void> => {
    try {
      await logout();
      useAuthStore.getState().signedOut(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <span className="user-menu">
      <button type="button" className="btn btn--sm" aria-label={m.auth.menu(user.name)} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        <span className="user-menu__name">{user.name}</span>
      </button>
      {open ? (
        <span className="user-menu__panel glass" role="menu">
          <span className="user-menu__who">{user.email}</span>
          <span className="user-menu__role">{m.auth.role[user.role]}</span>
          {user.role === 'admin' ? <Link role="menuitem" to="/admin/users" className="btn btn--sm btn--quiet" onClick={() => setOpen(false)}>{m.auth.users}</Link> : null}
          <button type="button" role="menuitem" className="btn btn--sm btn--quiet" onClick={() => void signOut()}>{m.auth.signOut}</button>
          {error ? <span role="alert" className="field__error">{error}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
