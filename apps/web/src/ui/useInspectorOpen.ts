import { useEffect, useRef } from 'react';
import { usePersistentState } from './usePersistentState';

/** Below this width the drawing gets the room until someone opens the inspector. */
const WIDE_ENOUGH_FOR_INSPECTOR_PX = 1360;

/**
 * The right-hand inspector, shared by Plan, Elevation and Network: collapsed by default on a narrow
 * laptop, then whatever the person last chose. When `selection` changes to something new, a folded
 * inspector opens again so the details of what was picked are in view.
 */
export function useInspectorOpen(selection?: string | null): [boolean, (open: boolean) => void] {
  const [pref, setPref] = usePersistentState<boolean | null>('glasshouse:inspector-open', null);
  const open = pref ?? window.innerWidth >= WIDE_ENOUGH_FOR_INSPECTOR_PX;
  const last = useRef(selection);
  useEffect(() => {
    if (selection && selection !== last.current && !open) setPref(true);
    last.current = selection;
  }, [selection, open, setPref]);
  return [open, setPref];
}
