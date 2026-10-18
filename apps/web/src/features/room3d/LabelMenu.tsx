import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { LABEL_KINDS, type LabelKind } from './labels';

/** Which kinds of thing are always labelled in 3D; the rest show their label on hover. */
export function LabelMenu({ shown, onChange }: { shown: LabelKind[]; onChange: (next: LabelKind[]) => void }) {
  const m = useT();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', key);
    };
  }, [open]);
  const toggle = (kind: LabelKind): void => onChange(shown.includes(kind) ? shown.filter((k) => k !== kind) : LABEL_KINDS.filter((k) => k === kind || shown.includes(k)));
  return (
    <div className="label-menu" ref={root}>
      <button type="button" className="btn btn--sm" aria-expanded={open} aria-controls="label-menu-list" onClick={() => setOpen(!open)}>
        {m.room3d.labelsMenu(shown.length)}
      </button>
      {open ? (
        <fieldset id="label-menu-list" className="label-menu__list popover-surface">
          <legend className="lbl">{m.room3d.labelsAlwaysFor}</legend>
          {LABEL_KINDS.map((kind) => (
            <label key={kind} className="label-menu__item">
              <input type="checkbox" checked={shown.includes(kind)} onChange={() => toggle(kind)} />
              {m.room3d.labelKind[kind]}
            </label>
          ))}
          <p className="label-menu__note">{m.room3d.labelsNote}</p>
        </fieldset>
      ) : null}
    </div>
  );
}
