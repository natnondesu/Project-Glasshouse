import { useEffect, useRef, type ReactNode } from 'react';
import { useT } from '../../i18n';
import { useConfirmStore } from '../../ui/confirm/confirmStore';
import { IconClose, IconSearch } from '../../ui/icons';
import { REVIEWS, ROLES, SOURCES, STATUSES, type UserQuery } from './userFilters';
import './users-toolbar.css';

const isTextEntry = (t: EventTarget | null): boolean => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

interface ToolbarProps {
  query: UserQuery;
  onChange: (next: UserQuery) => void;
  shown: number;
  total: number;
  /** How many a chip would show if pressed, with everything else kept. */
  facet: (change: Partial<UserQuery>) => number;
  onClear: (() => void) | null;
}

function Chip({ pressed, onClick, children, count, focusKey }: { pressed: boolean; onClick: () => void; children: ReactNode; count?: number; focusKey?: string }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} data-focus={focusKey}>
      {children}
      {count === undefined ? null : (
        <>
          {' '}
          <span className="users-toolbar__n">{count}</span>
        </>
      )}
    </button>
  );
}

/** Find a person: search (`/` or ⌘K), status, sign-in, role and access-review chips, and how many show. */
export function UsersToolbar({ query, onChange, shown, total, facet, onClear }: ToolbarProps) {
  const m = useT();
  const input = useRef<HTMLInputElement>(null);
  const set = (change: Partial<UserQuery>): void => onChange({ ...query, ...change });

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const shortcut = (e.key === '/' && !isTextEntry(e.target)) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k');
      if (!shortcut || useConfirmStore.getState().request) return;
      e.preventDefault();
      input.current?.focus();
      input.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="users-toolbar">
      <div className="users-toolbar__row">
        <div className="users-find field__box">
          <IconSearch className="users-find__icon" />
          <label htmlFor="users-find" className="visually-hidden">
            {m.users.findLabel}
          </label>
          <input
            ref={input}
            id="users-find"
            type="search"
            className="field__input"
            placeholder={m.users.findPlaceholder}
            value={query.q}
            autoComplete="off"
            spellCheck={false}
            aria-keyshortcuts="/"
            onChange={(e) => set({ q: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query.q) {
                e.stopPropagation();
                set({ q: '' });
              }
            }}
          />
          {query.q ? (
            <button type="button" className="users-find__clear" aria-label={m.users.clearSearch} onClick={() => (set({ q: '' }), input.current?.focus())}>
              <IconClose />
            </button>
          ) : (
            <kbd className="users-find__key" aria-hidden="true">
              /
            </kbd>
          )}
        </div>
        <div className="seg seg--compact users-toolbar__seg" role="group" aria-label={m.users.filterStatus}>
          {STATUSES.map((s) => (
            <Chip key={s} pressed={query.status === s} onClick={() => set({ status: s })} focusKey={query.status === s ? 'status' : undefined} count={s === 'off' || s === 'must-change' ? facet({ status: s }) : undefined}>
              {m.users.statusChip[s]}
            </Chip>
          ))}
        </div>
      </div>
      <div className="users-toolbar__row">
        <div className="seg seg--compact users-toolbar__seg" role="group" aria-label={m.users.filterSignIn}>
          {SOURCES.map((s) => (
            <Chip key={s} pressed={query.source === s} onClick={() => set({ source: s })}>
              {m.users.sourceChip[s]}
            </Chip>
          ))}
        </div>
        <div className="seg seg--compact users-toolbar__seg" role="group" aria-label={m.users.filterRole}>
          <Chip pressed={query.role === 'any'} onClick={() => set({ role: 'any' })}>
            {m.users.anyRole}
          </Chip>
          {ROLES.map((r) => (
            <Chip key={r} pressed={query.role === r} onClick={() => set({ role: r })}>
              {m.auth.role[r]}
            </Chip>
          ))}
        </div>
        <div className="seg seg--compact users-toolbar__seg" role="group" aria-label={m.users.filterReview}>
          {REVIEWS.filter((r) => r !== 'none').map((r) => (
            <Chip key={r} pressed={query.review === r} onClick={() => set({ review: query.review === r ? 'none' : r })} count={facet({ review: r })}>
              {m.users.reviewChip[r]}
            </Chip>
          ))}
        </div>
      </div>
      <div className="users-toolbar__result">
        <p className="users-toolbar__count" aria-live="polite">
          {m.users.count(shown, total)}
        </p>
        {onClear ? (
          <button type="button" className="users-toolbar__clear" onClick={onClear}>
            {m.users.clearFilters}
          </button>
        ) : null}
      </div>
    </div>
  );
}
