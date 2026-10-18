import { useState } from 'react';
import { useCan } from '../auth/useCan';
import { useT } from '../i18n';
import { useArchiveState } from '../store/hooks';
import { useWorkspaceStore } from '../store/workspaceStore';
import { IconArchive, IconRestore } from '../ui/icons';
import { formatDay } from '../ui/time';

/** Said once above an archived room's views: who put it away and when, and the way back (an admin's). Never on the drawing itself. */
export function ArchiveBanner({ roomId }: { roomId: string }) {
  const state = useArchiveState('room', roomId);
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const can = useCan();
  const m = useT();
  const [error, setError] = useState<string | null>(null);
  const source = state.source;
  if (!source) return null;
  const inherited = state.by !== 'self';
  const via = inherited ? { kind: m.archive.kind[source.kind], name: source.name } : null;
  return (
    <div className="frozen-banner frozen-banner--archived glass" role="status">
      <IconArchive className="frozen-banner__icon" />
      <span>
        <strong>{m.archive.banner(source.by, formatDay(source.at), via)}</strong>
        {inherited && can.admin ? ` ${m.archive.restoreFirst(m.tree.kind[source.kind], source.name)}` : null}
      </span>
      {!inherited && can.admin ? (
        <button type="button" className="btn btn--sm btn--ink" onClick={() => setError(dispatch({ type: 'room/restore', roomId })?.message ?? null)}>
          <IconRestore />
          {m.archive.restore}
        </button>
      ) : null}
      {error ? (
        <span role="alert" className="field__error">
          {error}
        </span>
      ) : null}
    </div>
  );
}
