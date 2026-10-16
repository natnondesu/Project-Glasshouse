import type { FaceBlock, Port } from '@glasshouse/domain';
import type { ReactNode } from 'react';

/** Jacks per module, as switches group them (1–6 over 2–… in a 2-row panel); modules wrap to fit. */
const MODULE_COLS = 6;

/** The jack's number as printed on the panel: the name without the block's shared prefix. */
export const shortName = (port: Port, label: string): string => (label && port.name.startsWith(label) ? port.name.slice(label.length) : port.name);

/** Splits a block's rows into modules of MODULE_COLS columns, keeping each column's top and bottom jack together. */
function modules(rows: (Port | null)[][]): (Port | null)[][][] {
  const cols = Math.max(0, ...rows.map((r) => r.length));
  const out: (Port | null)[][][] = [];
  for (let c = 0; c < cols; c += MODULE_COLS) out.push(rows.map((r) => Array.from({ length: Math.min(MODULE_COLS, cols - c) }, (_, i) => r[c + i] ?? null)));
  return out;
}

/**
 * A device's front panel: each port group a labelled block, its jacks in the rows the template sets.
 * `jack` draws one port (a button in the port manager, a plain mark in the catalog preview).
 */
export function Faceplate({ blocks, jack, label }: { blocks: FaceBlock[]; jack: (port: Port, short: string) => ReactNode; label: string }) {
  return (
    <div className="faceplate" role="group" aria-label={label}>
      {blocks.map((block, b) => (
        <div key={b} className="faceplate__block">
          {block.label ? <span className="faceplate__label mono">{block.label}</span> : null}
          <div className="faceplate__modules">
            {modules(block.rows).map((mod, i) => (
              <div key={i} className="faceplate__module" style={{ gridTemplateColumns: `repeat(${mod[0]?.length ?? 1}, var(--jack-w))` }}>
                {mod.flatMap((row, r) => row.map((p, c) => (p ? <span key={p.name} className="faceplate__cell">{jack(p, shortName(p, block.label))}</span> : <span key={`gap-${r}-${c}`} className="faceplate__gap" aria-hidden="true" />)))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
