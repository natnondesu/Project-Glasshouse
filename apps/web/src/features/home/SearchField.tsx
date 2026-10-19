import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useT } from '../../i18n';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useConfirmStore } from '../../ui/confirm/confirmStore';
import { IconClose, IconSearch } from '../../ui/icons';
import { usePrefersReducedMotion } from '../../ui/usePrefersReducedMotion';
import { siteSummaries } from '../globe/sites';
import { queryWords } from './homeSearch';
import { URL_TYPING_MS, useHomeView } from './homeView';
import { pickOption } from './searchPick';
import { resultSections, searchResults, type SearchOption } from './searchResults';
import { SearchResultsPanel } from './SearchResultsPanel';
import './home-find.css';

const isTextEntry = (t: EventTarget | null): boolean => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

/** The query the dropdown shows: it follows typing once typing settles, like the address does. */
function useSettled(q: string): [string, () => void] {
  const [settled, setSettled] = useState(q);
  useEffect(() => {
    if (settled === q) return;
    const timer = setTimeout(() => setSettled(q), URL_TYPING_MS);
    return () => clearTimeout(timer);
  }, [q, settled]);
  return [settled, () => setSettled(q)];
}

/**
 * Home's search, in the title block: a combobox over sites, rooms and projects. `/` (or ⌘K) focuses it, as in a room.
 * Typing filters the pins, the numbers and the room grid at once, and opens a dropdown of what it found, grouped, for
 * "did I find it?": ↑/↓ move, Enter picks (a site or a room shows on the globe, a project scopes to its sites), → on a
 * room reaches its Open. Enter with nothing highlighted opens the top match, as before. Escape closes the list, then
 * clears; Tab or a click elsewhere closes it.
 */
export function HomeSearch() {
  const m = useT();
  const reduced = usePrefersReducedMotion();
  const q = useHomeView((s) => s.q);
  const setQ = useHomeView((s) => s.setQ);
  const enter = useHomeView((s) => s.enter);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [settled, settleNow] = useSettled(q);

  const sites = useMemo(() => siteSummaries(workspace), [workspace]);
  const words = useMemo(() => queryWords(settled), [settled]);
  const results = useMemo(() => searchResults(sites, words), [sites, words]);
  const sections = useMemo(() => resultSections(results), [results]);
  const options = useMemo(() => sections.flatMap((s) => s.options), [sections]);
  const shown = open && q.trim() !== '' && words.length > 0;
  const hasList = shown && options.length > 0;
  const optionId = (i: number): string => `${listId}-opt-${i}`;

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      const shortcut = (e.key === '/' && !isTextEntry(e.target)) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k');
      if (!shortcut || e.defaultPrevented || useConfirmStore.getState().request || document.querySelector('dialog[open]')) return;
      e.preventDefault();
      input.current?.focus();
      input.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A press outside the search closes the list (the Open links and the list itself are inside).
  useEffect(() => {
    if (!shown) return;
    const onDown = (e: PointerEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [shown]);

  useEffect(() => {
    if (hasList && active >= 0) document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' });
  }, [active, hasList]);

  const close = (): void => {
    setOpen(false);
    setActive(-1);
  };
  const showRooms = (): void => {
    const heading = document.getElementById('home-rooms-h');
    heading?.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    heading?.focus({ preventScroll: true });
  };
  const pick = (option: SearchOption): void => {
    close();
    pickOption(option, results, { showRooms });
  };
  const move = (step: 1 | -1): void => {
    settleNow();
    if (!hasList) {
      setOpen(true);
      setActive(step === 1 ? 0 : options.length - 1);
      return;
    }
    const n = options.length;
    setActive((a) => (a < 0 ? (step === 1 ? 0 : n - 1) : (a + step + n) % n));
  };
  const openLink = (i: number): HTMLAnchorElement | null => root.current?.querySelector<HTMLAnchorElement>(`[data-open-for="${i}"]`) ?? null;

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault();
        move(e.key === 'ArrowDown' ? 1 : -1);
        return;
      case 'ArrowRight': {
        const link = hasList && options[active]?.kind === 'room' ? openLink(active) : null;
        if (!link) return;
        e.preventDefault();
        link.focus();
        return;
      }
      case 'Enter': {
        e.preventDefault();
        const option = hasList ? options[active] : undefined;
        if (option) pick(option);
        else if (q.trim()) {
          close();
          enter();
        }
        return;
      }
      case 'Escape':
        // A search field's own Escape empties it at once (Chrome, Safari): the first press only closes the list.
        e.preventDefault();
        e.stopPropagation();
        if (shown) close();
        else if (q) setQ('');
        else input.current?.blur();
        return;
      case 'Tab':
        close();
        return;
    }
  };
  // Keys on a room's Open: back to the list with ← (or Escape), on through it with ↑/↓; Enter follows the link.
  const onOpenKey = (e: KeyboardEvent<HTMLAnchorElement>): void => {
    if (!['ArrowLeft', 'Escape', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    input.current?.focus();
    if (e.key === 'ArrowDown') move(1);
    if (e.key === 'ArrowUp') move(-1);
  };

  return (
    <div
      ref={root}
      className="home-find field__box"
      role="search"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close();
      }}
    >
      <IconSearch className="home-find__icon" />
      <label htmlFor="home-find" className="visually-hidden">
        {m.home.searchLabel}
      </label>
      <input
        ref={input}
        id="home-find"
        type="search"
        role="combobox"
        className="field__input"
        placeholder={m.home.searchLabel}
        value={q}
        autoComplete="off"
        spellCheck={false}
        aria-keyshortcuts="/"
        aria-autocomplete="list"
        aria-expanded={hasList}
        aria-controls={listId}
        aria-activedescendant={hasList && active >= 0 ? optionId(active) : undefined}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {q ? (
        <button type="button" className="home-find__clear" aria-label={m.home.clearSearch} onClick={() => (setQ(''), close(), input.current?.focus())}>
          <IconClose />
        </button>
      ) : (
        <kbd className="home-find__key" aria-hidden="true">
          /
        </kbd>
      )}
      {shown ? (
        <SearchResultsPanel
          listId={listId}
          query={settled}
          words={words}
          results={results}
          sections={sections}
          active={active}
          optionId={optionId}
          onPick={pick}
          onOpenKey={onOpenKey}
          onOpened={close}
          onClear={() => {
            setQ('');
            close();
            input.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}
