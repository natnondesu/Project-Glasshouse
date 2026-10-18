import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { isDrawerShortcut, PINNED_KEY, treePlacement, usePinnedTree } from './placement';

beforeEach(() => localStorage.clear());

describe('treePlacement', () => {
  it('keeps Home and the other pages as they were: docked, or a rail once collapsed', () => {
    expect(treePlacement({ inRoom: false, treeOpen: true, pinned: false, drawerOpen: false })).toBe('docked');
    expect(treePlacement({ inRoom: false, treeOpen: false, pinned: true, drawerOpen: true })).toBe('rail');
  });

  it('gives a room the width: no tree until the drawer opens', () => {
    expect(treePlacement({ inRoom: true, treeOpen: true, pinned: false, drawerOpen: false })).toBe('hidden');
    expect(treePlacement({ inRoom: true, treeOpen: true, pinned: false, drawerOpen: true })).toBe('drawer');
  });

  it('docks the tree in a room once pinned, whatever the old open or closed state', () => {
    expect(treePlacement({ inRoom: true, treeOpen: false, pinned: true, drawerOpen: false })).toBe('docked');
    expect(treePlacement({ inRoom: true, treeOpen: true, pinned: true, drawerOpen: true })).toBe('docked');
  });
});

describe('usePinnedTree', () => {
  it('starts unpinned, even for someone whose tree was open before', () => {
    localStorage.setItem('glasshouse:tree-open', 'true');
    expect(renderHook(() => usePinnedTree()).result.current[0]).toBe(false);
  });

  it('reads a remembered pin, and ignores anything that is not a yes', () => {
    localStorage.setItem(PINNED_KEY, 'true');
    expect(renderHook(() => usePinnedTree()).result.current[0]).toBe(true);
    localStorage.setItem(PINNED_KEY, '"yes"');
    expect(renderHook(() => usePinnedTree()).result.current[0]).toBe(false);
  });
});

describe('isDrawerShortcut', () => {
  const key = (init: KeyboardEventInit, target: EventTarget = document.body) => {
    const e = new KeyboardEvent('keydown', { bubbles: true, ...init });
    Object.defineProperty(e, 'target', { value: target });
    return e;
  };

  it('is the [ key on its own, by position so a Thai layout works too', () => {
    expect(isDrawerShortcut(key({ key: '[', code: 'BracketLeft' }))).toBe(true);
    expect(isDrawerShortcut(key({ key: 'บ', code: 'BracketLeft' }))).toBe(true);
  });

  it('leaves modified presses, held repeats and other keys alone', () => {
    for (const init of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }, { shiftKey: true }, { repeat: true }]) {
      expect(isDrawerShortcut(key({ key: '[', code: 'BracketLeft', ...init }))).toBe(false);
    }
    expect(isDrawerShortcut(key({ key: ']', code: 'BracketRight' }))).toBe(false);
    expect(isDrawerShortcut(key({ key: '/', code: 'Slash' }))).toBe(false);
  });

  it('never fires while typing or inside a dialog', () => {
    const input = document.createElement('input');
    expect(isDrawerShortcut(key({ key: '[', code: 'BracketLeft' }, input))).toBe(false);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'alertdialog');
    const button = document.createElement('button');
    dialog.append(button);
    expect(isDrawerShortcut(key({ key: '[', code: 'BracketLeft' }, button))).toBe(false);
  });
});
