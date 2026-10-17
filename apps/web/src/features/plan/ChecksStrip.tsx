import type { Issue, RoomObject } from '@glasshouse/domain';
import { IconBlock, IconChevronRight, IconWarn } from '../../ui/icons';
import { Link } from 'react-router';
import { usePersistentState } from '../../ui/usePersistentState';
import { useT } from '../../i18n';
import { issueText } from './issueText';
import './checks.css';

interface ChecksStripProps {
  issues: Issue[];
  objects: Pick<RoomObject, 'id' | 'name'>[];
  onSelect: (id: string) => void;
  className?: string;
  /** Where the open/closed choice is remembered: each view keeps its own. */
  storageKey?: string;
  /** Notes on the revision on screen, and where to read them: a pointer, never something that holds approval. */
  notes?: { count: number; href: string };
}

export function ChecksStrip({ issues, objects, onSelect, className, storageKey = 'glasshouse:checks-open', notes }: ChecksStripProps) {
  const [open, setOpen] = usePersistentState(storageKey, true);
  const names = new Map(objects.map((o) => [o.id, o.name]));
  const m = useT();
  // The same things the Review badge adds up: blocking checks and acknowledgements.
  const blocks = issues.filter((i) => i.severity === 'block').length;
  const needsAck = issues.filter((i) => i.severity === 'needs_ack').length;
  const warnings = issues.length - blocks - needsAck;
  return (
    <section className={`checks glass${className ? ` ${className}` : ''}${open ? '' : ' is-collapsed'}`} aria-labelledby="checks-heading">
      <header className="checks__head">
        {issues.length > 0 ? (
          <button type="button" className={`checks__toggle${open ? ' is-open' : ''}`} aria-expanded={open} aria-controls="checks-list" aria-label={open ? m.checks.hide : m.checks.show} onClick={() => setOpen(!open)}>
            <IconChevronRight />
          </button>
        ) : null}
        <h2 id="checks-heading">{m.checks.title}</h2>
        {issues.length === 0 ? <span className="checks__ok">{m.checks.ok}</span> : null}
        {blocks > 0 ? <span className="checks__count checks__count--block">{m.checks.blocks(blocks)}</span> : null}
        {needsAck > 0 ? <span className="checks__count checks__count--warn">{m.checks.needsAck(needsAck)}</span> : null}
        {warnings > 0 ? <span className="checks__count checks__count--info">{m.checks.warnings(warnings)}</span> : null}
        {notes && notes.count > 0 ? (
          <Link className="checks__notes" to={notes.href}>
            {m.checks.notes(notes.count)}
          </Link>
        ) : null}
      </header>
      {issues.length > 0 && open ? (
        <ul id="checks-list" className="checks__list">
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
      {/* Under the list, so the head stays one line however many counts it carries. */}
      {blocks + needsAck > 0 && open ? <p className="checks__note">{m.checks.note}</p> : null}
    </section>
  );
}
