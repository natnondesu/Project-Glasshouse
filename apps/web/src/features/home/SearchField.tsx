import { useEffect, useRef } from 'react';
import { useT } from '../../i18n';
import { useConfirmStore } from '../../ui/confirm/confirmStore';
import { IconClose, IconSearch } from '../../ui/icons';
import { useHomeView } from './homeView';

const isTextEntry = (t: EventTarget | null): boolean => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

/**
 * Home's search, in the title block: sites and rooms by project, site or room name. `/` (or ⌘K) focuses it, as in a
 * room; Escape clears it; Enter opens the top room match or flies to the site. Typing filters the pins, the numbers
 * and the room grid; the globe only moves when asked.
 */
export function HomeSearch() {
  const m = useT();
  const q = useHomeView((s) => s.q);
  const setQ = useHomeView((s) => s.setQ);
  const enter = useHomeView((s) => s.enter);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const shortcut = (e.key === '/' && !isTextEntry(e.target)) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k');
      if (!shortcut || e.defaultPrevented || useConfirmStore.getState().request || document.querySelector('dialog[open]')) return;
      e.preventDefault();
      input.current?.focus();
      input.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="home-find field__box" role="search">
      <IconSearch className="home-find__icon" />
      <label htmlFor="home-find" className="visually-hidden">
        {m.home.searchLabel}
      </label>
      <input
        ref={input}
        id="home-find"
        type="search"
        className="field__input"
        placeholder={m.home.searchLabel}
        value={q}
        autoComplete="off"
        spellCheck={false}
        aria-keyshortcuts="/"
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            if (q) setQ('');
            else input.current?.blur();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (q.trim()) enter();
          }
        }}
      />
      {q ? (
        <button type="button" className="home-find__clear" aria-label={m.home.clearSearch} onClick={() => (setQ(''), input.current?.focus())}>
          <IconClose />
        </button>
      ) : (
        <kbd className="home-find__key" aria-hidden="true">
          /
        </kbd>
      )}
    </div>
  );
}
