import { describe, expect, it, vi } from 'vitest';
import { createUnloadGuard } from './unloadGuard';

function fakeWindow() {
  const handlers = new Set<(e: BeforeUnloadEvent) => void>();
  return {
    handlers,
    addEventListener: vi.fn((_type: string, h: (e: BeforeUnloadEvent) => void) => void handlers.add(h)),
    removeEventListener: vi.fn((_type: string, h: (e: BeforeUnloadEvent) => void) => void handlers.delete(h)),
  };
}

describe('unload guard', () => {
  it('asks the browser to confirm leaving only while edits are unsaved', () => {
    const w = fakeWindow();
    const guard = createUnloadGuard(w);
    guard.set(true);
    guard.set(true);
    expect(w.handlers.size).toBe(1);
    const event = { preventDefault: vi.fn(), returnValue: undefined } as unknown as BeforeUnloadEvent;
    [...w.handlers][0]!(event);
    expect(event.preventDefault).toHaveBeenCalled();
    guard.set(false);
    expect(w.handlers.size).toBe(0);
  });

  it('removes the handler on dispose', () => {
    const w = fakeWindow();
    const guard = createUnloadGuard(w);
    guard.set(true);
    guard.dispose();
    expect(w.handlers.size).toBe(0);
  });
});
