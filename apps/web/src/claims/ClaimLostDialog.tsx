import { useLayoutEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { confirmAction } from '../ui/confirm/confirmStore';
import { downloadJson } from '../ui/files';
import { useClaimsStore } from './claimsStore';
import '../features/handoff/handoff.css';
import './claims.css';

/** Shown to the person whose unsent edits to a room were refused because someone took it over: their version is theirs to keep. */
export function ClaimLostDialog() {
  const m = useT();
  const lost = useClaimsStore((s) => s.lost[0]);
  const ref = useRef<HTMLDialogElement>(null);
  const [downloaded, setDownloaded] = useState<typeof lost>(undefined);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!lost || !dialog) return;
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    // Download takes the focus: Enter on Dismiss would throw the only copy away.
    dialog.querySelector<HTMLElement>('.btn--ink')?.focus();
  }, [lost]);
  if (!lost) return null;
  const close = () => {
    // The next loss in the queue, if any, re-opens the dialog from the effect above.
    if (ref.current?.open && typeof ref.current.close === 'function') ref.current.close();
    useClaimsStore.getState().shiftLost();
  };
  const dismiss = async () => {
    const keep = downloaded === lost || (await confirmAction({ title: m.claims.discardTitle, body: m.claims.discardBody, confirmLabel: m.claims.discard, tone: 'danger' }));
    if (keep) close();
  };
  const fileName = `${lost.file.project.name} - ${lost.roomName} - my version.json`.replace(/[\\/:*?"<>|]/g, '-');
  return (
    <dialog ref={ref} className="dialog glass claim-lost" aria-labelledby="claim-lost-title" onCancel={(e) => e.preventDefault()}>
      <h2 id="claim-lost-title">{m.claims.lostTitle(lost.roomName)}</h2>
      <p>{m.claims.lostBody(lost.holderName, lost.changes)}</p>
      <div className="dialog__actions">
        <button type="button" className="btn btn--quiet" onClick={() => void dismiss()}>
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
    </dialog>
  );
}
