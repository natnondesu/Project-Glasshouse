import { findNode, findRackDevice, lowestFreeBottomU, newId, type PlanCommand, type PlanContent, type Rack, type RackDevice, type Template } from '@glasshouse/domain';
import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { useT } from '../../i18n';
import { useConfirmStore } from '../../ui/confirm/confirmStore';

interface Copied {
  source: RackDevice;
  templates: Template[];
}

/** In-app clipboard for rack devices; it lives for the visit and works across racks and rooms. */
export const useDeviceClipboard = create<{ copied: Copied | null; set: (c: Copied | null) => void }>()((set) => ({
  copied: null,
  set: (copied) => set({ copied }),
}));

const isTextEntry = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/**
 * ⌘/Ctrl+C copies the selected rack device (a Chassis with its Nodes); ⌘/Ctrl+V pastes it into the
 * active rack at its lowest free U. Selected text still copies as text, and fields paste as usual.
 */
export function useCopyPaste(opts: {
  content: PlanContent;
  selectedId: string | null;
  activeRack: Rack | null;
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
      const { content, selectedId, activeRack, readOnly, commit, onPasted, say, m: t } = latest.current;
      if (key === 'c') {
        if (window.getSelection()?.toString()) return;
        const found = selectedId ? findRackDevice(content, selectedId) : null;
        if (!found) {
          if (selectedId && findNode(content, selectedId)) say(t.copyPaste.nodeCopy);
          return;
        }
        e.preventDefault();
        useDeviceClipboard.getState().set({ source: found.device, templates: content.templatesUsed });
        say(t.copyPaste.copied(found.device.name));
        return;
      }
      const copied = useDeviceClipboard.getState().copied;
      if (!copied) return;
      e.preventDefault();
      if (readOnly) return say(t.palette.frozen);
      if (!activeRack) return say(t.copyPaste.noRack);
      const bottomU = lowestFreeBottomU(activeRack, copied.source.heightU);
      if (bottomU === null) return say(t.elevation.noFreeSpace(activeRack.name, copied.source.heightU));
      const id = newId();
      const nodeIds = copied.source.kind === 'chassis' ? copied.source.nodes.map(() => newId()) : [];
      const problem = commit({ type: 'device/paste', id, rackId: activeRack.id, bottomU, source: copied.source, nodeIds, templates: copied.templates });
      if (problem) return say(problem);
      onPasted(id);
      say(t.copyPaste.pasted(copied.source.name, activeRack.name, bottomU));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
