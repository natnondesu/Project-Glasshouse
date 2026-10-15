import { panelOf, type RoomObject } from '@glasshouse/domain';
import type { ReactNode } from 'react';
import { useT } from '../../i18n';

/** What the side panel says about a selected non-rack object; an MCB offers its ways. */
export function ObjectCard({ object, onManageWays, children }: { object: RoomObject; onManageWays: () => void; children?: ReactNode }) {
  const m = useT();
  const panel = object.type === 'mcb' ? panelOf(object) : null;
  return (
    <section className="room3d__card" aria-label={m.inspector.details(object.name)}>
      <h3 className="room3d__card-title mono">{object.name}</h3>
      <dl>
        <dt>{m.room3d.kind}</dt>
        <dd>{m.objects.type[object.type]}</dd>
        {panel ? (
          <>
            <dt>{m.panelMgr.ways}</dt>
            <dd className="mono">{`${panel.ways.length} · ${panel.phase === 'three' ? m.panelMgr.three : m.panelMgr.single}`}</dd>
          </>
        ) : null}
      </dl>
      {panel ? (
        <button type="button" className="btn btn--sm btn--ink" onClick={onManageWays}>
          {m.room3d.manageWays}
        </button>
      ) : null}
      {children}
    </section>
  );
}
