import { useCallback, useState } from 'react';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** A view preference kept in this browser only (panel open/closed, legend shown). Never workspace data. */
export function usePersistentState<T>(key: string, fallback: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => read(key, fallback));
  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Blocked storage: the preference just lasts for this visit.
      }
    },
    [key],
  );
  return [value, set];
}

/** Set a view preference ahead of navigating, e.g. so the Checks list is open when a link lands on it. */
export function writePreference<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Blocked storage: the view opens with its own default.
  }
}
