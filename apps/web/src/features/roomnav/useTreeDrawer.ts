import { useCallback, useEffect, useRef, useState } from 'react';
import { isDrawerShortcut } from './placement';

/** Popups that belong to the work in the drawer (a confirmation, the import dialog): using them keeps it open. */
const POPUP = 'dialog, [role="dialog"], [role="alertdialog"], .confirm-backdrop';

export interface TreeDrawer {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  panelRef: React.RefObject<HTMLElement | null>;
  onRoomPicked: () => void;
  onRoomAdded: (roomId: string) => void;
  onRenameDone: (id: string) => void;
}

const focusInto = (panel: HTMLElement | null): void => {
  (panel?.querySelector<HTMLElement>('[aria-current="page"]') ?? panel?.querySelector<HTMLElement>('a[href], button, input'))?.focus();
};

/**
 * The project tree as a drawer over a room: opened by the Projects button or `[`, closed by picking a room,
 * Escape, a click outside or focus moving on. Escape and a picked room hand focus back to the button.
 * A room just added from the tree keeps the drawer until it is named, then the drawer steps aside.
 */
export function useTreeDrawer(inRoom: boolean, pinned: boolean): TreeDrawer {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const naming = useRef<string | null>(null);
  const showing = inRoom && !pinned && open;

  const close = useCallback((refocus: boolean) => {
    naming.current = null;
    // A rename still being typed is kept, as it would be by clicking away from a docked tree.
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && panelRef.current?.contains(active)) active.blur();
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  }, []);

  // Back on Home the tree docks again; returning to a room starts with the drawer closed.
  useEffect(() => {
    if (!inRoom) setOpen(false);
  }, [inRoom]);

  useEffect(() => {
    if (!showing || panelRef.current?.contains(document.activeElement)) return;
    focusInto(panelRef.current);
  }, [showing]);

  useEffect(() => {
    if (!showing) return;
    const inside = (target: EventTarget | null): boolean =>
      target instanceof Node && (!!panelRef.current?.contains(target) || !!buttonRef.current?.contains(target) || (target instanceof Element && target.closest(POPUP) !== null));
    const onPointerDown = (e: PointerEvent): void => {
      if (!inside(e.target)) close(false);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (e.target instanceof Element && e.target.closest(POPUP)) return;
      close(true);
    };
    const onFocusIn = (e: FocusEvent): void => {
      if (!inside(e.target)) close(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [showing, close]);

  useEffect(() => {
    if (!inRoom) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!isDrawerShortcut(e)) return;
      e.preventDefault();
      if (pinned) return focusInto(panelRef.current);
      if (open) close(!!panelRef.current?.contains(document.activeElement));
      else setOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inRoom, pinned, open, close]);

  return {
    open,
    setOpen,
    toggle: () => (open ? close(false) : setOpen(true)),
    buttonRef,
    panelRef,
    onRoomPicked: () => {
      if (showing) close(true);
    },
    onRoomAdded: (roomId) => {
      if (pinned) return;
      naming.current = roomId;
      setOpen(true);
    },
    onRenameDone: (id) => {
      if (naming.current === id) close(true);
    },
  };
}
