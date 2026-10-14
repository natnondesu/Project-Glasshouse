import { useEffect, useState } from 'react';
import './hint.css';

interface Shown {
  text: string;
  x: number;
  y: number;
  below: boolean;
}

const GAP_PX = 8;
const HINT_CHAR_PX = 6.6;
const HINT_PAD_PX = 20;
const EDGE_PX = 6;

/** An icon-only button: it has an accessible name but no visible text. The plan toolbar has its own richer hints. */
function hintTarget(el: EventTarget | null): HTMLElement | null {
  if (!(el instanceof Element)) return null;
  const b = el.closest<HTMLElement>('button[aria-label], a[aria-label], [data-hint]');
  if (!b || b.closest('.toolbar, .tool-flyout')) return null;
  if (b.dataset.hint) return b;
  return (b.textContent ?? '').trim() === '' ? b : null;
}

/**
 * One shared hover/focus hint for every icon-only control, so none of them is a mystery.
 * Native `title` tooltips are suppressed while ours shows, to avoid a second, slower one.
 */
export function HintLayer() {
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    let current: HTMLElement | null = null;
    const show = (el: HTMLElement): void => {
      if (el.hasAttribute('title')) {
        el.dataset.hintTitle = el.getAttribute('title') ?? '';
        el.removeAttribute('title');
      }
      const text = el.dataset.hint ?? el.getAttribute('aria-label') ?? '';
      const r = el.getBoundingClientRect();
      const below = r.top < 48;
      // Keep the hint on screen near the window edges (estimated width; Geist at 12px).
      const half = (text.length * HINT_CHAR_PX + HINT_PAD_PX) / 2;
      const x = Math.min(Math.max(r.left + r.width / 2, half + EDGE_PX), window.innerWidth - half - EDGE_PX);
      setShown({ text, x, y: below ? r.bottom + GAP_PX : r.top - GAP_PX, below });
      current = el;
    };
    const hide = (): void => {
      if (current?.dataset.hintTitle !== undefined) {
        current.setAttribute('title', current.dataset.hintTitle);
        delete current.dataset.hintTitle;
      }
      current = null;
      setShown(null);
    };
    const onOver = (e: Event): void => {
      const el = hintTarget(e.target);
      if (el === current) return;
      if (el) show(el);
      else if (current) hide();
    };
    const onOut = (e: Event): void => {
      const to = (e as MouseEvent).relatedTarget;
      if (current && !(to instanceof Node && current.contains(to))) hide();
    };
    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);
    document.addEventListener('focusin', onOver);
    document.addEventListener('focusout', hide);
    window.addEventListener('scroll', hide, true);
    // A click often changes the control (Collapse → Expand); drop the now-stale hint.
    document.addEventListener('click', hide, true);
    return () => {
      document.removeEventListener('click', hide, true);
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
      document.removeEventListener('focusin', onOver);
      document.removeEventListener('focusout', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, []);

  if (!shown) return null;
  return (
    <span role="tooltip" className={`hint-layer${shown.below ? ' is-below' : ''}`} style={{ left: shown.x, top: shown.y }}>
      {shown.text}
    </span>
  );
}
