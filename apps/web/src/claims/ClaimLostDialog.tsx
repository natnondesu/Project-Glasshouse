import { useLayoutEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { downloadJson } from '../ui/files';
import { useClaimsStore } from './claimsStore';
import '../features/handoff/handoff.css';
import './claims.css';

/** Shown to the person whose unsent edits to a room were refused because someone took it over: their version is theirs to keep. */
export function ClaimLostDialog() {
  const m = useT();
  const lost = useClaimsStore((s) => s.lost[0]);
  const ref = useRef<HTMLDialogElement>(null);
  // Both are tied to one copy, so a new head of the queue starts from the normal view.
  const [downloaded, setDownloaded] = useState<typeof lost>(undefined);
  const [warned, setWarned] = useState<typeof lost>(undefined);
  const isWarning = !!lost && warned === lost;
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!lost || !dialog) return;
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    // The safe button takes the focus: Enter on Dismiss would throw the only copy away.
    dialog.querySelector<HTMLElement>('.btn--ink')?.focus();
  }, [lost, isWarning]);
  if (!lost) return null;
  const close = () => {
    // The next loss in the queue, if any, re-opens the dialog from the effect above.
    if (ref.current?.open && typeof ref.current.close === 'function') ref.current.close();
    useClaimsStore.getState().shiftLost();
  };
  const dismiss = () => (downloaded === lost ? close() : setWarned(lost));
  const fileName = `${lost.file.project.name} - ${lost.roomName} - my version.json`.replace(/[\\/:*?"<>|]/g, '-');
  // The browser can close a modal on a repeated Escape despite preventDefault; the copy isn't dealt with yet.
  const reopen = () => {
    const dialog = ref.current;
    if (useClaimsStore.getState().lost.length > 0 && dialog && !dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
  };
  return (
    <dialog ref={ref} className="dialog glass claim-lost" aria-labelledby="claim-lost-title" onCancel={(e) => e.preventDefault()} onClose={reopen}>
      {isWarning ? (
        <>
          <h2 id="claim-lost-title">{m.claims.discardTitle}</h2>
          <p>{m.claims.discardBody}</p>
          <div className="dialog__actions">
            <button type="button" className="btn btn--danger-solid" onClick={close}>
              {m.claims.discard}
            </button>
            <button type="button" className="btn btn--ink" onClick={() => setWarned(undefined)}>
              {m.claims.keepIt}
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 id="claim-lost-title">{m.claims.lostTitle(lost.roomName)}</h2>
          <p>{m.claims.lostBody(lost.holderName, lost.changes)}</p>
          <div className="dialog__actions">
            <button type="button" className="btn btn--quiet" onClick={dismiss}>
              {m.claims.dismiss}
            </button>
            <button
              type="button"
              className="btn btn--ink"
              onClick={() => {
                downloadJson(fileName, lost.file);
                setDownloaded(lost);
              }}
            >
              {m.claims.downloadMine}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
