import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useT } from '../i18n';
import { getActiveSync } from '../sync/serverMode';
import { saveStash } from '../sync/pendingStash';
import { useWorkspaceStore } from '../store/workspaceStore';
import { downloadJson } from '../ui/files';
import { logout } from './authApi';
import { useAuthStore } from './authStore';
import './auth.css';

const SIGN_OUT_FLUSH_MS = 5000;
const BACKUP_FALLBACK_NAME = 'glasshouse-backup.json';

const filenameOf = (res: Response): string => /filename="?([^";]+)"?/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? BACKUP_FALLBACK_NAME;

/** Gives unsent edits a short chance to reach the server; whatever is still pending is kept for the next sign-in. */
async function keepUnsentEdits(userId: string): Promise<void> {
  const sync = getActiveSync();
  if (!sync || sync.pendingCommands().length === 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([sync.flush(), new Promise<void>((resolve) => (timer = setTimeout(resolve, SIGN_OUT_FLUSH_MS)))]);
  clearTimeout(timer);
  const commands = sync.pendingCommands();
  if (commands.length > 0) saveStash({ userId, clientId: sync.clientId, commands });
}

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
      await keepUnsentEdits(user.id);
      await logout();
      useAuthStore.getState().signedOut(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const downloadBackup = async (): Promise<void> => {
    setOpen(false);
    const notify = useWorkspaceStore.getState().setNotice;
    let res: Response;
    try {
      res = await fetch('/api/admin/backup');
    } catch {
      return notify(m.users.unreachable);
    }
    if (!res.ok) return notify(m.auth.backupFailed(res.status));
    try {
      downloadJson(filenameOf(res), await res.json());
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <span className="user-menu">
      <button type="button" className="btn btn--sm" aria-label={m.auth.menu(user.name)} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        <span className="user-menu__name">{user.name}</span>
      </button>
      {open ? (
        <span className="user-menu__panel popover-surface" role="menu">
          <span className="user-menu__who">{user.email}</span>
          <span className="user-menu__role">{m.auth.role[user.role]}</span>
          {user.role === 'admin' ? <Link role="menuitem" to="/admin/users" className="btn btn--sm btn--quiet" onClick={() => setOpen(false)}>{m.auth.users}</Link> : null}
          {user.role === 'admin' ? <button type="button" role="menuitem" className="btn btn--sm btn--quiet" onClick={() => void downloadBackup()}>{m.auth.backup}</button> : null}
          <button type="button" role="menuitem" className="btn btn--sm btn--quiet" onClick={() => void signOut()}>{m.auth.signOut}</button>
          {error ? <span role="alert" className="field__error">{error}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
