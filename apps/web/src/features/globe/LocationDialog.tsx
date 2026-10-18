import { findSite } from '@glasshouse/domain';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useT } from '../../i18n';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { IconMapPin } from '../../ui/icons';
import { formatLatLon } from './format';
import { useLocationStore } from './locationStore';
import { MAX_INPUT_LENGTH, parseLocation } from './parseLocation';
import { confirmAction } from '../../ui/confirm/confirmStore';
import '../handoff/handoff.css';
import '../../ui/fields.css';
import './globe.css';

/** Where a site is: paste a Google Maps link or type coordinates, see what was understood, save. Or go and click the map. */
export function LocationDialog() {
  const siteId = useLocationStore((s) => s.editing);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const found = siteId ? findSite(workspace, siteId) : null;
  if (!siteId || !found) return null;
  return <LocationForm key={siteId} siteId={siteId} name={found.site.name} current={found.site.location ?? null} />;
}

function LocationForm({ siteId, name, current }: { siteId: string; name: string; current: { lat: number; lon: number } | null }) {
  const m = useT();
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const done = useLocationStore((s) => s.done);
  const place = useLocationStore((s) => s.place);
  const navigate = useNavigate();
  const onHome = useLocation().pathname === '/';
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(() => useLocationStore.getState().notice);
  const parsed = useMemo(() => parseLocation(text), [text]);
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const ids = { title: useId(), hint: useId(), status: useId() };

  // A native modal: focus trap, inert page, Escape, and the top layer; focus goes back to the opener.
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog?.setAttribute('open', '');
    input.current?.focus();
    return () => {
      if (dialog?.open && typeof dialog.close === 'function') dialog.close();
      opener?.isConnected && opener.focus();
    };
  }, []);

  const save = (location: { lat: number; lon: number } | null): void => {
    const problem = dispatch({ type: 'site/locate', siteId, location });
    setError(problem?.message ?? null);
    if (problem) return;
    if (location) useLocationStore.getState().markSaved(siteId);
    done();
  };
  // Asks first, in the ordinary popup: the dialog steps aside for it and comes back if the answer is no.
  const remove = (): void => {
    done();
    void confirmAction({ title: m.globe.removeTitle(name), body: m.globe.removeBody, confirmLabel: m.globe.remove, tone: 'danger' }).then((ok) => {
      if (!ok) {
        useLocationStore.getState().edit(siteId);
        return;
      }
      const problem = dispatch({ type: 'site/locate', siteId, location: null });
      if (problem) useLocationStore.getState().edit(siteId, problem.message);
    });
  };
  const placeOnMap = (): void => {
    place(siteId);
    if (!onHome) void navigate('/');
  };
  const status = parsed.ok ? m.globe.readsAs(`${formatLatLon(parsed.location)} (${parsed.source === 'link' ? m.globe.fromLink : m.globe.fromCoordinates})`) : m.globe.problem[parsed.reason];

  return (
    <dialog
      ref={ref}
      className="dialog glass location-dialog"
      aria-labelledby={ids.title}
      onCancel={(e) => {
        e.preventDefault();
        done();
      }}
      onKeyDown={(e) => {
        // The native dialog's Escape, made explicit so it works the same everywhere.
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        done();
      }}
    >
      <form
        className="location-dialog__form"
        onSubmit={(e) => {
          e.preventDefault();
          if (parsed.ok) save(parsed.location);
        }}
      >
        <h2 id={ids.title}>{m.globe.dialogTitle(name)}</h2>
        {current ? (
          <p className="location-dialog__now">
            <IconMapPin />
            <span>{m.globe.now}</span>{' '}
            <span className="mono">{formatLatLon(current)}</span>
          </p>
        ) : null}
        <div className="field">
          <label className="field__label" htmlFor={`${ids.title}-input`}>
            {m.globe.inputLabel}
          </label>
          <div className={`field__box${!parsed.ok && parsed.reason !== 'empty' ? ' field__box--error' : ''}`}>
            <input
              ref={input}
              id={`${ids.title}-input`}
              className="field__input"
              value={text}
              placeholder={m.globe.inputPlaceholder}
              maxLength={MAX_INPUT_LENGTH}
              autoComplete="off"
              spellCheck={false}
              aria-describedby={`${ids.hint} ${ids.status}`}
              aria-invalid={!parsed.ok && parsed.reason !== 'empty'}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <p id={ids.hint} className="field__hint">
            {m.globe.inputHint}
          </p>
        </div>
        <p id={ids.status} className={`location-dialog__status${parsed.ok ? ' is-ok' : parsed.reason === 'empty' ? '' : ' is-bad'}`} role="status" aria-live="polite">
          {status}
        </p>
        {error ? (
          <p role="alert" className="field__error">
            {error}
          </p>
        ) : null}
        <div className="location-dialog__actions">
          {current ? (
            <button type="button" className="btn btn--danger location-dialog__remove" onClick={remove}>
              {m.globe.remove}
            </button>
          ) : null}
          <span className="location-dialog__spacer" />
          <button type="button" className="btn" onClick={done}>
            {m.common.cancel}
          </button>
          <button type="button" className="btn" onClick={placeOnMap}>
            <IconMapPin />
            {m.globe.placeOnMap}
          </button>
          <button type="submit" className="btn btn--ink" disabled={!parsed.ok}>
            {m.globe.savePlace}
          </button>
        </div>
      </form>
    </dialog>
  );
}
