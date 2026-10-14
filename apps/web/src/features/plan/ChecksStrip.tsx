import type { Issue, RoomObject } from '@glasshouse/domain';
import { IconBlock, IconWarn } from '../../ui/icons';
import { useT } from '../../i18n';
import { issueText } from './issueText';
import './checks.css';

interface ChecksStripProps {
  issues: Issue[];
  objects: Pick<RoomObject, 'id' | 'name'>[];
  onSelect: (id: string) => void;
  className?: string;
}

export function ChecksStrip({ issues, objects, onSelect, className }: ChecksStripProps) {
  const names = new Map(objects.map((o) => [o.id, o.name]));
  const m = useT();
  const blocks = issues.filter((i) => i.severity === 'block').length;
  const warnings = issues.length - blocks;
  return (
    <section className={`checks glass${className ? ` ${className}` : ''}`} aria-labelledby="checks-heading">
      <header className="checks__head">
        <h2 id="checks-heading">{m.checks.title}</h2>
        {issues.length === 0 ? <span className="checks__ok">{m.checks.ok}</span> : null}
        {blocks > 0 ? <span className="checks__count checks__count--block">{m.checks.blocks(blocks)}</span> : null}
        {warnings > 0 ? <span className="checks__count checks__count--warn">{m.checks.warnings(warnings)}</span> : null}
        {blocks > 0 ? <span className="checks__note">{m.checks.note}</span> : null}
      </header>
      {issues.length > 0 ? (
        <ul className="checks__list">
          {issues.map((issue) => {
            const target = issue.targets.find((t) => names.has(t));
            const text = issueText(m, issue);
            return (
              <li key={issue.key} className={`checks__row checks__row--${issue.severity}`}>
                {issue.severity === 'block' ? <IconBlock role="img" aria-label={m.checks.blockIcon} aria-hidden={false} /> : <IconWarn role="img" aria-label={m.checks.warnIcon} aria-hidden={false} />}
                <div>
                  <p className="checks__msg">{text.message}</p>
                  <p className="checks__hint">{text.hint}</p>
                </div>
                {target ? (
                  <button type="button" className="btn btn--sm checks__select" data-hint={m.checks.select(names.get(target)!)} onClick={() => onSelect(target)}>
                    {m.checks.select(names.get(target)!)}
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
