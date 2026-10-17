import { useT } from '../i18n';
import { useWorkspaceStore } from '../store/workspaceStore';

/** Why an edit didn't stick (refused by the server, or overtaken by someone else's change). */
export function SyncNotice() {
  const notice = useWorkspaceStore((s) => s.notice);
  const setNotice = useWorkspaceStore((s) => s.setNotice);
  const m = useT();
  if (notice === null) return null;
  return (
    <p className="read-only-banner sync-notice" role="alert">
      <span>{m.shell.notApplied(notice)}</span>
      <button type="button" className="btn btn--sm btn--quiet" onClick={() => setNotice(null)}>
        {m.common.close}
      </button>
    </p>
  );
}
