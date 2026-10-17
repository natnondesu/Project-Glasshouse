import { useLayoutEffect, useRef } from 'react';
import { useT } from '../i18n';
import { downloadJson } from '../ui/files';
import { useClaimsStore } from './claimsStore';
import '../features/handoff/handoff.css';
import './claims.css';

/** Shown to the person whose unsent edits to a room were refused because someone took it over: their version is theirs to keep. */
export function ClaimLostDialog() {
  const m = useT();
  const lost = useClaimsStore((s) => s.lost);
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!lost || !dialog || dialog.open) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    // Download takes the focus: Enter on Dismiss would throw the only copy away.
    dialog.querySelector<HTMLElement>('.btn--ink')?.focus();
  }, [lost]);
  if (!lost) return null;
  const close = () => {
    if (ref.current?.open && typeof ref.current.close === 'function') ref.current.close();
    useClaimsStore.getState().setLost(null);
  };
  const fileName = `${lost.file.project.name} - ${lost.roomName} - my version.json`.replace(/[\\/:*?"<>|]/g, '-');
  return (
    <dialog
      ref={ref}
      className="dialog glass claim-lost"
      aria-labelledby="claim-lost-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <h2 id="claim-lost-title">{m.claims.lostTitle(lost.roomName)}</h2>
      <p>{m.claims.lostBody(lost.holderName, lost.changes)}</p>
      <div className="dialog__actions">
        <button type="button" className="btn btn--quiet" onClick={close}>
          {m.claims.dismiss}
        </button>
        <button type="button" className="btn btn--ink" onClick={() => downloadJson(fileName, lost.file)}>
          {m.claims.downloadMine}
        </button>
      </div>
    </dialog>
  );
}
