import { EQUIPMENT_STATE_LABEL, equipmentStateOf, type Plan, type PlanContent } from '@glasshouse/domain';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { searchRoom, type SearchHit } from './search';
import { useT } from '../../i18n';
import './search.css';

interface SearchBoxProps {
  content: PlanContent;
  roomName: string;
  onPick: (hit: SearchHit) => void;
  /** An extra link per result, e.g. "Open in elevation". */
  action?: (hit: SearchHit) => ReactNode;
  className?: string;
  /** The room's plan, so on-site state ("maintenance") is searchable too. */
  plan?: Plan;
}

const isTextEntry = (t: EventTarget | null): boolean => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

/** Room search: `/` or ⌘K to focus, type, ↑/↓ to choose, Enter to go there. */
export function SearchBox({ content, roomName, onPick, action, className, plan }: SearchBoxProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const m = useT();
  const hits = useMemo(
    () => searchRoom(content, query, { m, stateOf: plan ? (id) => `${EQUIPMENT_STATE_LABEL[equipmentStateOf(plan, id)]} ${m.equipment.state[equipmentStateOf(plan, id)]}`.toLowerCase() : undefined }),
    [content, query, plan, m],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const shortcut = (e.key === '/' && !isTextEntry(e.target)) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k');
      if (!shortcut) return;
      e.preventDefault();
      input.current?.focus();
      input.current?.select();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pick = (hit: SearchHit | undefined): void => {
    if (!hit) return;
    setOpen(false);
    onPick(hit);
  };
  const showList = open && query.trim().length > 0;

  return (
    <div className={`search glass${className ? ` ${className}` : ''}`}>
      <svg className="search__icon" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9.2 9.2L12.5 12.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <input
        ref={input}
        role="combobox"
        aria-label={m.search.placeholder}
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && hits[active] ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
        className="search__input"
        placeholder={m.search.placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!open) setOpen(true);
            else setActive((a) => Math.min(a + 1, hits.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            pick(hits[active]);
          } else if (e.key === 'Escape') {
            if (query) setQuery('');
            else input.current?.blur();
            setOpen(false);
          }
          e.stopPropagation();
        }}
      />
      <kbd className="search__key" aria-hidden="true">
        /
      </kbd>
      {showList ? (
        hits.length === 0 ? (
          <p className="search__empty" role="status">{m.search.noMatches(roomName)}</p>
        ) : (
          <ul className="search__list" role="listbox" id={listId} aria-label={m.search.results}>
            {hits.map((hit, i) => (
              <li
                key={hit.key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className="search__hit"
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  if ((e.target as Element).closest('a')) return;
                  e.preventDefault();
                  pick(hit);
                }}
              >
                <span className="search__name">{hit.name}</span>
                <span className="search__detail">{hit.detail}</span>
                {action ? <span className="search__action">{action(hit)}</span> : null}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
