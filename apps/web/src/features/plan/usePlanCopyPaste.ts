import { copyName, innerIds, newId, pasteSpot, type PlanCommand, type PlanContent, type RoomObject, type Template } from '@glasshouse/domain';
import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { useT } from '../../i18n';
import { useConfirmStore } from '../../ui/confirm/confirmStore';

interface Copied {
  source: RoomObject;
  templates: Template[];
  /** Where the last copy landed, so pressing ⌘V again lays the next one beside it: a row of racks. */
  last: { x: number; y: number; roomId: string };
}

/** In-app clipboard for plan objects; it lives for the visit and works across rooms. */
export const usePlanClipboard = create<{ copied: Copied | null; set: (c: Copied | null) => void }>()((set) => ({
  copied: null,
  set: (copied) => set({ copied }),
}));

const isTextEntry = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/**
 * ⌘/Ctrl+C copies the selected plan object (a rack with its devices); ⌘/Ctrl+V pastes it beside the
 * original, or beside the last copy. Selected text still copies as text, and fields paste as usual.
 */
export function usePlanCopyPaste(opts: {
  content: PlanContent;
  roomId: string;
  selectedId: string | null;
  readOnly: boolean;
  commit: (command: PlanCommand) => string | null;
  onPasted: (id: string) => void;
  say: (message: string) => void;
}): void {
  const m = useT();
  const latest = useRef({ ...opts, m });
  latest.current = { ...opts, m };
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      if ((key !== 'c' && key !== 'v') || isTextEntry(e.target) || useConfirmStore.getState().request) return;
      const { content, roomId, selectedId, readOnly, commit, onPasted, say, m: t } = latest.current;
      if (key === 'c') {
        if (window.getSelection()?.toString()) return;
        const source = content.objects.find((o) => o.id === selectedId);
        if (!source) return;
        e.preventDefault();
        usePlanClipboard.getState().set({ source, templates: content.templatesUsed, last: { x: source.x, y: source.y, roomId } });
        say(t.planCopy.copied(source.name));
        return;
      }
      const copied = usePlanClipboard.getState().copied;
      if (!copied) return;
      e.preventDefault();
      if (readOnly) return say(t.palette.frozen);
      // In another room it goes beside where the original stood.
      const from = copied.last.roomId === roomId ? copied.last : { x: copied.source.x, y: copied.source.y };
      const at = pasteSpot(content, copied.source, from);
      if (!at) return say(t.planCopy.noSpace(copied.source.name));
      const id = newId();
      const name = copyName(content.objects.map((o) => o.name), copied.source.name);
      const ids = Object.fromEntries(innerIds(copied.source).map((old) => [old, newId()]));
      const problem = commit({ type: 'object/paste', id, source: copied.source, at, ids, templates: copied.templates });
      if (problem) return say(problem);
      usePlanClipboard.getState().set({ ...copied, last: { ...at, roomId } });
      onPasted(id);
      say(t.planCopy.pasted(name, copied.source.name));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
