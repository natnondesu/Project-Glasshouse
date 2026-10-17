type UnloadTarget = {
  addEventListener(type: 'beforeunload', handler: (e: BeforeUnloadEvent) => void): void;
  removeEventListener(type: 'beforeunload', handler: (e: BeforeUnloadEvent) => void): void;
};

/** While edits are unsaved, leaving the page asks the browser to confirm. */
export function createUnloadGuard(target: UnloadTarget) {
  let active = false;
  const handler = (e: BeforeUnloadEvent): void => {
    e.preventDefault();
    // Older browsers only show the prompt when returnValue is set.
    e.returnValue = '';
  };
  const set = (unsaved: boolean): void => {
    if (unsaved === active) return;
    active = unsaved;
    if (unsaved) target.addEventListener('beforeunload', handler);
    else target.removeEventListener('beforeunload', handler);
  };
  return { set, dispose: () => set(false) };
}
