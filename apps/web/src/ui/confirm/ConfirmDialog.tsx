import { useEffect, useRef } from 'react';
import { useT } from '../../i18n';
import { useConfirmStore } from './confirmStore';
import './confirm.css';

/**
 * A modal confirmation in the middle of the screen. The destructive button has focus, so the
 * keyboard path is Delete then Enter; Escape or a click outside cancels. Focus returns afterwards.
 */
export function ConfirmDialog() {
  const m = useT();
  const request = useConfirmStore((s) => s.request);
  const answer = useConfirmStore((s) => s.answer);
  const confirmBtn = useRef<HTMLButtonElement>(null);
  const cancelBtn = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!request) return;
    returnTo.current = document.activeElement as HTMLElement | null;
    confirmBtn.current?.focus();
    return () => returnTo.current?.focus?.();
  }, [request]);

  if (!request) return null;
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      answer(false);
    }
    // Two buttons: keep Tab inside the dialog.
    if (e.key === 'Tab') {
      e.preventDefault();
      (document.activeElement === confirmBtn.current ? cancelBtn : confirmBtn).current?.focus();
    }
  };
  return (
    <div className="confirm-backdrop" onPointerDown={(e) => e.target === e.currentTarget && answer(false)}>
      <div className="confirm glass" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-body" onKeyDown={onKeyDown}>
        <h2 id="confirm-title">{request.title}</h2>
        <p id="confirm-body">{request.body}</p>
        <div className="confirm__actions">
          <button ref={cancelBtn} type="button" className="btn" onClick={() => answer(false)}>
            {m.common.cancel}
          </button>
          <button ref={confirmBtn} type="button" className={`btn ${request.tone === 'primary' ? 'btn--ink' : 'btn--danger-solid'}`} onClick={() => answer(true)}>
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
