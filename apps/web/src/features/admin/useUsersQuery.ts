import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { usePersistentState } from '../../ui/usePersistentState';
import { hasQueryParams, parseQuery, queryToParams, type UserQuery } from './userFilters';

const VIEW_KEY = 'glasshouse:users-view';

/**
 * The Users view (filters, search, sort). It opens from the address, so a filtered list can be shared
 * or reloaded; a bare /admin/users opens the last view kept in this browser (without the search), as a
 * convenience. The screen answers from its own state and mirrors it into the address: the router updates
 * the address in a transition, and a click followed by typing must never read a stale view back.
 */
export function useUsersQuery(): [UserQuery, (next: UserQuery) => void] {
  const [params, setParams] = useSearchParams();
  const [saved, setSaved] = usePersistentState<string>(VIEW_KEY, '');
  const [query, setQuery] = useState(() => parseQuery(hasQueryParams(params) ? params : new URLSearchParams(saved)));

  useEffect(() => {
    if (queryToParams(query, params).toString() !== params.toString()) setParams((prev) => queryToParams(query, prev), { replace: true });
  }, [query, params, setParams]);

  const set = useCallback(
    (next: UserQuery) => {
      setQuery(next);
      setSaved(queryToParams({ ...next, q: '' }).toString());
    },
    [setSaved],
  );
  return [query, set];
}
