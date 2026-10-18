import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type ComponentType, type KeyboardEvent, type SVGProps } from 'react';
import { createPortal } from 'react-dom';
import { IconMore } from '../../ui/icons';
import './row-menu.css';

export interface RowMenuItem {
  id: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  onSelect: () => void;
  /** Removals sit last, set apart, in the blocking red. */
  danger?: boolean;
}

/** Space kept between the menu and the window edge. */
const EDGE_PX = 8;
const GAP_PX = 4;

/**
 * One button per row that opens that person's actions. The menu is a solid surface placed in the
 * page body, so the table's scroller never clips it, and it flips above the button near the bottom.
 * Keyboard: Enter, Space or ↓ open on the first item (↑ on the last), arrows move, Escape closes back
 * to the button, Tab closes and carries on from the button.
 */
export function UserRowMenu({ label, focusKey, items }: { label: string; focusKey: string; items: RowMenuItem[] }) {
  const [open, setOpen] = useState<false | 'first' | 'last'>(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = (refocus: boolean): void => {
    setOpen(false);
    setPos(null);
    if (refocus) button.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open || !button.current || !menu.current) return;
    const anchor = button.current.getBoundingClientRect();
    const { width, height } = menu.current.getBoundingClientRect();
    const below = anchor.bottom + GAP_PX;
    const top = below + height > window.innerHeight - EDGE_PX ? Math.max(EDGE_PX, anchor.top - GAP_PX - height) : below;
    const left = Math.min(Math.max(EDGE_PX, anchor.right - width), window.innerWidth - EDGE_PX - width);
    setPos({ top, left });
  }, [open]);

  // Only once placed: a hidden menu cannot take focus.
  useLayoutEffect(() => {
    if (!open || !pos) return;
    const entries = menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [];
    entries[open === 'last' ? entries.length - 1 : 0]?.focus({ preventScroll: true });
  }, [open, pos]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: Event): void => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !button.current?.contains(t)) close(false);
    };
    // A fixed menu would drift from its row when the table scrolls or the window resizes; it closes instead.
    const drift = (e: Event): void => {
      if (!menu.current?.contains(e.target as Node)) close(false);
    };
    window.addEventListener('pointerdown', outside);
    window.addEventListener('scroll', drift, true);
    window.addEventListener('resize', drift);
    return () => {
      window.removeEventListener('pointerdown', outside);
      window.removeEventListener('scroll', drift, true);
      window.removeEventListener('resize', drift);
    };
  }, [open]);

  const onButtonKey = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(e.key === 'ArrowUp' ? 'last' : 'first');
    }
  };

  const onMenuKey = (e: KeyboardEvent): void => {
    const entries = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = entries.indexOf(document.activeElement as HTMLElement);
    const go = (i: number): void => {
      e.preventDefault();
      entries[(i + entries.length) % entries.length]?.focus({ preventScroll: true });
    };
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(entries.length - 1);
    else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === 'Tab') {
      // Focus goes back to the button first, so the browser's own Tab moves on from the row, not from the page top.
      close(true);
    }
  };

  const choose = (item: RowMenuItem): void => {
    // The button holds focus while the action runs, so a confirmation returns there when it closes.
    close(true);
    item.onSelect();
  };

  const firstDanger = items.findIndex((i) => i.danger);
  return (
    <>
      <button
        ref={button}
        type="button"
        className="row-menu__btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open !== false}
        aria-controls={open ? menuId : undefined}
        data-focus={focusKey}
        onClick={() => (open ? close(false) : setOpen('first'))}
        onKeyDown={onButtonKey}
      >
        <IconMore />
      </button>
      {open
        ? createPortal(
            <div
              ref={menu}
              id={menuId}
              className="row-menu popover-surface"
              role="menu"
              aria-label={label}
              style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}
              onKeyDown={onMenuKey}
              onBlur={(e) => {
                // Focus jumped to another control (the search's /): the menu goes with it. A null target is a click
                // on something unfocusable (Safari does not focus clicked buttons), which pointerdown already handles.
                const next = e.relatedTarget as Node | null;
                if (next && !menu.current?.contains(next) && !button.current?.contains(next)) close(false);
              }}
            >
              {items.map((item, i) => (
                <Fragment key={item.id}>
                  {i === firstDanger && i > 0 ? <div className="row-menu__sep" role="separator" /> : null}
                  <button type="button" role="menuitem" tabIndex={-1} className={`row-menu__item${item.danger ? ' row-menu__item--danger' : ''}`} onClick={() => choose(item)}>
                    <item.Icon className="row-menu__icon" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                </Fragment>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
