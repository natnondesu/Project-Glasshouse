import { archiveState, createCopyIds, previewImport, type ProjectFile } from '@glasshouse/domain';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { pad2 } from '../../ui/StatusStamp';
import { useT } from '../../i18n';
import { formatTime } from '../../ui/time';
import './handoff.css';

export function ImportDialog({ file, onClose }: { file: ProjectFile; onClose: () => void }) {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const preview = useMemo(() => previewImport(workspace, file), [workspace, file]);
  // Merging into archived work is refused, so a file for an archived project starts as a copy.
  const archivedHere = useMemo(() => archiveState(workspace, 'project', file.project.id).archived, [workspace, file.project.id]);
  const [mode, setMode] = useState<'merge' | 'copy'>(preview.idClash || archivedHere ? 'copy' : 'merge');
  const [take, setTake] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  const m = useT();

  // A native modal gives a focus trap, an inert page, Escape and the top layer (no backdrop-filter trap).
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog?.setAttribute('open', '');
    dialog?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
    return () => {
      if (dialog?.open && typeof dialog.close === 'function') dialog.close();
      opener?.focus();
    };
  }, []);

  const choose = (roomId: string, incoming: boolean): void =>
    setTake((prev) => {
      const next = new Set(prev);
      if (incoming) next.add(roomId);
      else next.delete(roomId);
      return next;
    });
  const confirm = (): void => {
    const problem = dispatch({ type: 'project/import', file, resolution: mode === 'copy' ? { mode: 'copy', ids: createCopyIds(file) } : { mode: 'merge', takeIncoming: [...take] } });
    setError(problem?.message ?? null);
    if (!problem) onClose();
  };

  return (
    <dialog
      ref={ref}
      className="dialog glass"
      aria-labelledby="import-h"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
        <h2 id="import-h">{m.importFile.title(preview.projectName)}</h2>
        <p className="dialog__meta">
          {m.importFile.summary(preview.newRooms, preview.conflicts.length, preview.newTemplates)}
          {file.exportedAt ? m.importFile.exported(formatTime(file.exportedAt)) : ''}
        </p>
        <div className="seg" role="group" aria-label={m.importFile.how}>
          <button type="button" aria-pressed={mode === 'merge'} disabled={preview.idClash || archivedHere} onClick={() => setMode('merge')}>
            {m.importFile.merge}
          </button>
          <button type="button" aria-pressed={mode === 'copy'} onClick={() => setMode('copy')}>
            {m.importFile.copy}
          </button>
        </div>
        {preview.differingTemplates.length > 0 ? (
          <p className="dialog__note">{m.importFile.differing(preview.differingTemplates.join(', '))}</p>
        ) : null}
        {preview.idClash ? <p className="dialog__note">{m.importFile.idClash}</p> : null}
        {archivedHere ? <p className="dialog__note">{m.archive.importArchived(preview.projectName)}</p> : null}
        {mode === 'copy' ? <p className="dialog__note">{m.importFile.copyNote}</p> : null}
        {mode === 'merge' && preview.conflicts.length > 0 ? (
          <table className="conflicts">
            <thead>
              <tr>
                <th scope="col">{m.importFile.room}</th>
                <th scope="col">{m.importFile.here}</th>
                <th scope="col">{m.importFile.inFile}</th>
                <th scope="col">{m.importFile.use}</th>
              </tr>
            </thead>
            <tbody>
              {preview.conflicts.map((c) => (
                <tr key={c.roomId}>
                  <td>
                    <strong>{c.roomName}</strong>
                    <span className="conflicts__site">{c.siteName}</span>
                  </td>
                  <td className="mono">{`R${pad2(c.local.revision)} ${m.revision.stamp[c.local.state]}`}</td>
                  <td className="mono">{`R${pad2(c.incoming.revision)} ${m.revision.stamp[c.incoming.state]}`}</td>
                  <td>
                    <div className="seg seg--compact" role="group" aria-label={m.importFile.choice(c.roomName)}>
                      <button type="button" aria-label={m.importFile.keepMineOf(c.roomName)} aria-pressed={!take.has(c.roomId)} onClick={() => choose(c.roomId, false)}>
                        {m.importFile.keepMine}
                      </button>
                      <button type="button" aria-label={m.importFile.takeIncomingOf(c.roomName)} aria-pressed={take.has(c.roomId)} onClick={() => choose(c.roomId, true)}>
                        {m.importFile.takeIncoming}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {mode === 'merge' && preview.conflicts.length > 0 ? <p className="dialog__note">{m.importFile.keepNote}</p> : null}
        {error ? (
          <p role="alert" className="field__error">
            {error}
          </p>
        ) : null}
        <div className="dialog__actions">
          <button type="button" className="btn btn--ink" onClick={confirm}>
            {m.importFile.import}
          </button>
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            {m.common.cancel}
          </button>
        </div>
    </dialog>
  );
}
