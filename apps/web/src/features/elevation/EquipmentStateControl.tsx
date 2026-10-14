import { EQUIPMENT_STATES, equipmentStateOf, type EquipmentState, type Plan } from '@glasshouse/domain';
import { useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useT } from '../../i18n';

/** One glyph per state, used on racks, in 3D labels and in legends; colour is never the only signal. */
export const STATE_SYMBOL: Record<EquipmentState, string> = { planned: '○', deployed: '✓', maintenance: '!' };

export function EquipmentStateControl({ roomId, plan, id, locked }: { roomId: string; plan: Plan; id: string; locked: boolean }) {
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const m = useT();
  const [error, setError] = useState<string | null>(null);
  const current = equipmentStateOf(plan, id);
  return (
    <div className="equip-state">
      <span className="field__label">{m.equipment.onSite}</span>
      <div className="seg seg--compact equip-state__seg" role="group" aria-label={m.equipment.group}>
        {EQUIPMENT_STATES.map((s) => (
          <button
            key={s}
            type="button"
            className={`equip-state__btn equip-state__btn--${s}`}
            aria-pressed={current === s}
            disabled={locked}
            onClick={() => setError(dispatch({ type: 'equipment/state', roomId, ids: [id], state: s })?.message ?? null)}
          >
            <span aria-hidden="true" className="equip-state__glyph">
              {STATE_SYMBOL[s]}
            </span>
            {m.equipment.state[s]}
          </button>
        ))}
      </div>
      <p className="inspector__note">{locked ? m.equipment.lockedNote : m.equipment.note}</p>
      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function StateLegend() {
  const m = useT();
  return (
    <ul className="state-legend" aria-label={m.equipment.legend}>
      {EQUIPMENT_STATES.map((s) => (
        <li key={s} className={`state-legend__item state-legend__item--${s}`}>
          <span aria-hidden="true" className="state-legend__glyph">
            {STATE_SYMBOL[s]}
          </span>
          {m.equipment.state[s]}
        </li>
      ))}
    </ul>
  );
}
