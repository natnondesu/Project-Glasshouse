import { powerPath, type PlanContent } from '@glasshouse/domain';
import { useT } from '../../i18n';

/** Show or hide the selected object's power path; says so when nothing is wired to it. */
export function PowerPathToggle({ content, objectId, name, active, onToggle }: { content: PlanContent; objectId: string; name: string; active: boolean; onToggle: (on: boolean) => void }) {
  const m = useT();
  const lines = powerPath(content, objectId).feedIds.size;
  if (lines === 0) return <p className="room3d__note">{m.room3d.noPath(name)}</p>;
  return (
    <div className="power-path">
      <button type="button" className="btn btn--sm" aria-pressed={active} onClick={() => onToggle(!active)}>
        {active ? m.room3d.hidePath : m.room3d.showPath}
      </button>
      {active ? <p className="room3d__note">{m.room3d.pathNote(lines)}</p> : null}
    </div>
  );
}
