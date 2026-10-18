import type { ReactNode } from 'react';
import { useT } from '../../i18n';
import { IconSortArrow } from '../../ui/icons';
import type { SortKey, UserQuery } from './userFilters';

function SortHeader({ label, sortKey, query, onSort }: { label: string; sortKey: SortKey; query: UserQuery; onSort: (key: SortKey) => void }) {
  const active = query.sort === sortKey;
  return (
    <th scope="col" aria-sort={active ? (query.desc ? 'descending' : 'ascending') : undefined}>
      <button type="button" className={`users__sort${active ? ' users__sort--on' : ''}`} onClick={() => onSort(sortKey)}>
        {label}
        <IconSortArrow className={`users__sort-arrow${active && !query.desc ? ' users__sort-arrow--up' : ''}`} />
      </button>
    </th>
  );
}

/** The list itself: a sticky, sortable header over the rows, scrolling inside the panel. */
export function UsersTable({ query, onSort, children }: { query: UserQuery; onSort: (key: SortKey) => void; children: ReactNode }) {
  const m = useT();
  return (
    <div className="users__scroll" data-focus="table" role="region" aria-label={m.users.caption} tabIndex={0}>
      <table className="users__table">
        <caption className="visually-hidden">{m.users.caption}</caption>
        <colgroup>
          <col />
          <col className="users__col-role" />
          <col className="users__col-status" />
          <col className="users__col-menu" />
        </colgroup>
        <thead>
          <tr>
            <SortHeader label={m.users.name} sortKey="name" query={query} onSort={onSort} />
            <SortHeader label={m.users.role} sortKey="role" query={query} onSort={onSort} />
            <SortHeader label={m.users.statusCol} sortKey="last" query={query} onSort={onSort} />
            <th scope="col">
              <span className="visually-hidden">{m.users.actions}</span>
            </th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** A full-width row for loading and for an empty result, with the way back. */
export function UsersTableNote({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <tr className="users__note-row">
      <td colSpan={4}>
        <p>{text}</p>
        {action}
      </td>
    </tr>
  );
}
