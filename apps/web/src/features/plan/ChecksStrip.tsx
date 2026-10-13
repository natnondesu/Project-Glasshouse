import type { Issue, RoomObject } from '@glasshouse/domain';
import { IconBlock, IconWarn } from '../../ui/icons';
import './checks.css';

interface ChecksStripProps {
  issues: Issue[];
  objects: Pick<RoomObject, 'id' | 'name'>[];
  onSelect: (id: string) => void;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function ChecksStrip({ issues, objects, onSelect }: ChecksStripProps) {
  const names = new Map(objects.map((o) => [o.id, o.name]));
  const blocks = issues.filter((i) => i.severity === 'block').length;
  const warnings = issues.length - blocks;
  return (
    <section className="checks" aria-labelledby="checks-heading">
      <header className="checks__head">
        <h2 id="checks-heading">Checks</h2>
        {issues.length === 0 ? <span className="checks__ok">No issues found</span> : null}
        {blocks > 0 ? <span className="checks__count checks__count--block">{plural(blocks, 'blocks approval', 'block approval')}</span> : null}
        {warnings > 0 ? <span className="checks__count checks__count--warn">{plural(warnings, 'warning', 'warnings')}</span> : null}
        {blocks > 0 ? <span className="checks__note">You can keep drafting; approval waits for these.</span> : null}
      </header>
      {issues.length > 0 ? (
        <ul className="checks__list">
          {issues.map((issue) => {
            const target = issue.targets.find((t) => names.has(t));
            return (
              <li key={issue.key} className={`checks__row checks__row--${issue.severity}`}>
                {issue.severity === 'block' ? <IconBlock role="img" aria-label="Blocks approval" aria-hidden={false} /> : <IconWarn role="img" aria-label="Warning" aria-hidden={false} />}
                <div>
                  <p className="checks__msg">{issue.message}</p>
                  <p className="checks__hint">{issue.hint}</p>
                </div>
                {target ? (
                  <button type="button" className="btn btn--sm" onClick={() => onSelect(target)}>
                    Select {names.get(target)}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
