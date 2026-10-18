import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';

export interface PlanLayers {
  dimensions: boolean;
  clearance: boolean;
  feeds: boolean;
}

export const ALL_LAYERS: PlanLayers = { dimensions: true, clearance: true, feeds: true };

const ITEMS: (keyof PlanLayers)[] = ['dimensions', 'clearance', 'feeds'];

/** Show or hide drawing layers on screen. The Install sheet always prints everything. */
export function ViewMenu({ layers, onChange }: { layers: PlanLayers; onChange: (next: PlanLayers) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const m = useT();
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  const hidden = ITEMS.filter((k) => !layers[k]).length;
  return (
    <div ref={root} className="view-menu" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      <button type="button" className="zoom__fit" aria-haspopup="menu" aria-expanded={open} aria-label={m.viewMenu.view} onClick={() => setOpen((o) => !o)}>
        {m.viewMenu.view}
        {hidden > 0 ? <span className="view-menu__count">{m.viewMenu.hidden(hidden)}</span> : null}
      </button>
      {open ? (
        <div className="view-menu__pop popover-surface" role="menu" aria-label={m.viewMenu.showOnPlan}>
          {ITEMS.map((key) => (
            <button
              key={key}
              type="button"
              role="menuitemcheckbox"
              aria-checked={layers[key]}
              className="view-menu__item"
              onClick={() => onChange({ ...layers, [key]: !layers[key] })}
            >
              <span className="view-menu__box" aria-hidden="true">
                {layers[key] ? '✓' : ''}
              </span>
              {m.viewMenu[key]}
            </button>
          ))}
          <p className="view-menu__note">{m.viewMenu.note}</p>
        </div>
      ) : null}
    </div>
  );
}
