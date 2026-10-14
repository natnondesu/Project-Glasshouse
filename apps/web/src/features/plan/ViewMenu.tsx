import { useEffect, useRef, useState } from 'react';

export interface PlanLayers {
  dimensions: boolean;
  clearance: boolean;
  feeds: boolean;
}

export const ALL_LAYERS: PlanLayers = { dimensions: true, clearance: true, feeds: true };

const ITEMS: { key: keyof PlanLayers; label: string }[] = [
  { key: 'dimensions', label: 'Dimensions' },
  { key: 'clearance', label: 'Clearance zones' },
  { key: 'feeds', label: 'Power feeds' },
];

/** Show or hide drawing layers on screen. The Install sheet always prints everything. */
export function ViewMenu({ layers, onChange }: { layers: PlanLayers; onChange: (next: PlanLayers) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  const hidden = ITEMS.filter((i) => !layers[i.key]).length;
  return (
    <div ref={root} className="view-menu" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      <button type="button" className="zoom__fit" aria-haspopup="menu" aria-expanded={open} aria-label="View" onClick={() => setOpen((o) => !o)}>
        View{hidden > 0 ? <span className="view-menu__count">{`${hidden} hidden`}</span> : null}
      </button>
      {open ? (
        <div className="view-menu__pop glass" role="menu" aria-label="Show on plan">
          {ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitemcheckbox"
              aria-checked={layers[item.key]}
              className="view-menu__item"
              onClick={() => onChange({ ...layers, [item.key]: !layers[item.key] })}
            >
              <span className="view-menu__box" aria-hidden="true">
                {layers[item.key] ? '✓' : ''}
              </span>
              {item.label}
            </button>
          ))}
          <p className="view-menu__note">Only hides them here; the Install sheet still prints them.</p>
        </div>
      ) : null}
    </div>
  );
}
