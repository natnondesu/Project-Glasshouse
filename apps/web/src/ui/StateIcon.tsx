import type { EquipmentState } from '@glasshouse/domain';
import type { ReactNode } from 'react';

/** Drawn on a 12-unit grid in one 1.6 stroke, so the three states read alike at 12px. */
const SHAPE: Record<EquipmentState, ReactNode> = {
  // Not there yet: a dashed outline.
  planned: <circle cx="6" cy="6" r="4.3" strokeDasharray="2.2 1.7" />,
  deployed: <path d="M2.3 6.3 5 9 9.8 3.3" />,
  maintenance: (
    <>
      <path d="M6 1.5 10.9 10.3H1.1Z" />
      <path d="M6 4.9v2.3M6 8.7v.05" />
    </>
  ),
};

const STROKE = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** For HTML: buttons, legends. */
export function StateIcon({ state, className }: { state: EquipmentState; className?: string }) {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" data-state={state} className={`state-icon${className ? ` ${className}` : ''}`} {...STROKE}>
      {SHAPE[state]}
    </svg>
  );
}

/** For inside an SVG drawing, centred on (cx, cy). */
export function StateGlyph({ state, cx, cy, className }: { state: EquipmentState; cx: number; cy: number; className?: string }) {
  return (
    <g transform={`translate(${cx - 6} ${cy - 6})`} aria-hidden="true" data-state={state} className={`state-icon${className ? ` ${className}` : ''}`} {...STROKE}>
      {SHAPE[state]}
    </g>
  );
}
