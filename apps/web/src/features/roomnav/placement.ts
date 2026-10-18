import { usePersistentState } from '../../ui/usePersistentState';

/** Its own key: someone whose tree was open under the old `tree-open` starts in drawer mode, not pinned. */
export const PINNED_KEY = 'glasshouse:tree-pinned';

export type TreePlacement = 'docked' | 'rail' | 'drawer' | 'hidden';

/**
 * Where the project tree goes. Outside a room it keeps its old open/closed rail; inside a room the drawing
 * gets the width unless the tree is pinned, and the drawer floats over it only while asked for.
 */
export function treePlacement(s: { inRoom: boolean; treeOpen: boolean; pinned: boolean; drawerOpen: boolean }): TreePlacement {
  if (!s.inRoom) return s.treeOpen ? 'docked' : 'rail';
  if (s.pinned) return 'docked';
  return s.drawerOpen ? 'drawer' : 'hidden';
}

export function usePinnedTree(): [boolean, (pinned: boolean) => void] {
  const [stored, setPinned] = usePersistentState<unknown>(PINNED_KEY, false);
  return [stored === true, setPinned];
}

const isTextEntry = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/**
 * `[` toggles the project drawer. Matched by key position, so the Thai layout (where that key types บ) works
 * the same. Clear of the plan's letter tools, R, Delete, arrows, `/`, ⌘C/V and undo, and of browser shortcuts.
 */
export function isDrawerShortcut(e: KeyboardEvent): boolean {
  if (e.code !== 'BracketLeft' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.repeat) return false;
  if (isTextEntry(e.target)) return false;
  return !(e.target instanceof Element && e.target.closest('dialog, [role="dialog"], [role="alertdialog"]'));
}

/** The shortcut as shown in hints. */
export const DRAWER_SHORTCUT_LABEL = '[';
