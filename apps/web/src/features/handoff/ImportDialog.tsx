import { previewImport, type ProjectFile } from '@glasshouse/domain';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { pad2, STATE_LABEL } from '../../ui/StatusStamp';
import { formatTime } from '../../ui/time';
import './handoff.css';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function ImportDialog({ file, onClose }: { file: ProjectFile; onClose: () => void }) {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const preview = useMemo(() => previewImport(workspace, file), [workspace, file]);
  const [mode, setMode] = useState<'merge' | 'copy'>(preview.idClash ? 'copy' : 'merge');
  const [take, setTake] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

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
    const problem = dispatch({ type: 'project/import', file, resolution: mode === 'copy' ? { mode: 'copy' } : { mode: 'merge', takeIncoming: [...take] } });
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
        <h2 id="import-h">{`Import “${preview.projectName}”`}</h2>
        <p className="dialog__meta">
          {`${plural(preview.newRooms, 'new room', 'new rooms')} · ${plural(preview.conflicts.length, 'room already here', 'rooms already here')} · ${plural(preview.newTemplates, 'new template', 'new templates')}`}
          {file.exportedAt ? ` · exported ${formatTime(file.exportedAt)}` : ''}
        </p>
        <div className="seg" role="group" aria-label="How to import">
          <button type="button" aria-pressed={mode === 'merge'} disabled={preview.idClash} onClick={() => setMode('merge')}>
            Merge into this browser
          </button>
          <button type="button" aria-pressed={mode === 'copy'} onClick={() => setMode('copy')}>
            Import as a copy
          </button>
        </div>
        {preview.differingTemplates.length > 0 ? (
          <p className="dialog__note">{`${preview.differingTemplates.join(', ')}: a different version is in the file. Your catalog keeps its own; placed Devices keep the version they were placed with.`}</p>
        ) : null}
        {preview.idClash ? <p className="dialog__note">Some rooms in this file belong to another project here, so it can only be imported as a copy.</p> : null}
        {mode === 'copy' ? <p className="dialog__note">The copy gets new IDs and “(copy)” after its name. Nothing here changes.</p> : null}
        {mode === 'merge' && preview.conflicts.length > 0 ? (
          <table className="conflicts">
            <thead>
              <tr>
                <th scope="col">Room</th>
                <th scope="col">Here</th>
                <th scope="col">In the file</th>
                <th scope="col">Use</th>
              </tr>
            </thead>
            <tbody>
              {preview.conflicts.map((c) => (
                <tr key={c.roomId}>
                  <td>
                    <strong>{c.roomName}</strong>
                    <span className="conflicts__site">{c.siteName}</span>
                  </td>
                  <td className="mono">{`R${pad2(c.local.revision)} ${STATE_LABEL[c.local.state]}`}</td>
                  <td className="mono">{`R${pad2(c.incoming.revision)} ${STATE_LABEL[c.incoming.state]}`}</td>
                  <td>
                    <div className="seg seg--compact" role="group" aria-label={`${c.roomName} choice`}>
                      <button type="button" aria-label={`${c.roomName}: keep mine`} aria-pressed={!take.has(c.roomId)} onClick={() => choose(c.roomId, false)}>
                        Keep mine
                      </button>
                      <button type="button" aria-label={`${c.roomName}: take incoming`} aria-pressed={take.has(c.roomId)} onClick={() => choose(c.roomId, true)}>
                        Take incoming
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {mode === 'merge' && preview.conflicts.length > 0 ? <p className="dialog__note">Keep mine leaves that Room exactly as it is in this browser.</p> : null}
        {error ? (
          <p role="alert" className="field__error">
            {error}
          </p>
        ) : null}
        <div className="dialog__actions">
          <button type="button" className="btn btn--ink" onClick={confirm}>
            Import
          </button>
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            Cancel
          </button>
        </div>
    </dialog>
  );
}
