import { findNode, findRackDevice, findReserved, type PlanCommand, type PlanContent } from '@glasshouse/domain';
import { useEffect, useRef } from 'react';
import { useT } from '../../i18n';
import { confirmAction, useConfirmStore } from '../../ui/confirm/confirmStore';

const isTextEntry = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/**
 * Delete or Backspace removes the selected device, Node or Reserved range after a confirmation.
 * Not while typing, not in a frozen revision, and not while a confirmation is already open.
 */
export function useDeleteKey(opts: {
  content: PlanContent;
  selectedId: string | null;
  readOnly: boolean;
  commit: (command: PlanCommand) => string | null;
  onRemoved: (next: string | null) => void;
}): void {
  const m = useT();
  const latest = useRef({ ...opts, m });
  latest.current = { ...opts, m };
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (e.metaKey || e.ctrlKey || e.altKey || isTextEntry(e.target) || useConfirmStore.getState().request) return;
      const { content, selectedId, readOnly, commit, onRemoved, m: t } = latest.current;
      if (readOnly || !selectedId) return;
      const device = findRackDevice(content, selectedId);
      const node = device ? null : findNode(content, selectedId);
      const reserved = device || node ? null : findReserved(content, selectedId);
      const target = device
        ? { title: t.device.removeQuestion(device.device.name, device.device.kind === 'chassis' ? device.device.nodes.length : 0), command: { type: 'device/remove', id: selectedId } as PlanCommand, next: null }
        : node
          ? { title: t.device.removeNodeQuestion(node.node.name, node.node.slot), command: { type: 'node/remove', id: selectedId } as PlanCommand, next: node.chassis.id }
          : reserved
            ? { title: t.reserved.removeQuestion(reserved.range.label), command: { type: 'reserved/remove', id: selectedId } as PlanCommand, next: reserved.rack.id }
            : null;
      if (!target) return;
      e.preventDefault();
      void confirmAction({ title: target.title, body: t.confirmRemove.undo, confirmLabel: t.confirmRemove.action }).then((ok) => {
        if (ok && commit(target.command) === null) onRemoved(target.next);
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
