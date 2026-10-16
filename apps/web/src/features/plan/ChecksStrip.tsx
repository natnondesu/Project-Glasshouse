import type { Issue, RoomObject } from '@glasshouse/domain';
import { IconBlock, IconChevronRight, IconWarn } from '../../ui/icons';
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
  /** Unresolved review notes: they hold approval too, so the strip counts them like the Review badge. */
  openNotes?: number;
}

export function ChecksStrip({ issues, objects, onSelect, className, storageKey = 'glasshouse:checks-open', openNotes = 0 }: ChecksStripProps) {
  const [open, setOpen] = usePersistentState(storageKey, true);
  const names = new Map(objects.map((o) => [o.id, o.name]));
  const m = useT();
  // The same three things the Review badge adds up: blocking checks, acknowledgements, open notes.
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
        {issues.length === 0 && openNotes === 0 ? <span className="checks__ok">{m.checks.ok}</span> : null}
        {blocks > 0 ? <span className="checks__count checks__count--block">{m.checks.blocks(blocks)}</span> : null}
        {needsAck > 0 ? <span className="checks__count checks__count--warn">{m.checks.needsAck(needsAck)}</span> : null}
        {openNotes > 0 ? <span className="checks__count checks__count--warn">{m.checks.openNotes(openNotes)}</span> : null}
        {warnings > 0 ? <span className="checks__count checks__count--info">{m.checks.warnings(warnings)}</span> : null}
        {blocks + needsAck + openNotes > 0 && open ? <span className="checks__note">{m.checks.note}</span> : null}
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
    </section>
  );
}
