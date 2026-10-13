import { useEffect } from 'react';
import { Outlet, useMatch } from 'react-router';
import { ProjectTree } from '../features/tree/ProjectTree';
import { useWorkspaceStore } from '../store/workspaceStore';
import { TitleBlock } from './TitleBlock';
import './shell.css';

const isTextEntry = (target: EventTarget): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

export function Shell() {
  const match = useMatch('/rooms/:roomId/*');
  const roomId = match?.params.roomId ?? null;
  const undo = useWorkspaceStore((s) => s.undo);
  const redo = useWorkspaceStore((s) => s.redo);
  const readOnly = useWorkspaceStore((s) => s.readOnly);

  // Window-level so undo still works when focus falls back to <body>, e.g. right after a delete.
  useEffect(() => {
    if (!roomId) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.target && isTextEntry(e.target) || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) redo(roomId);
      else undo(roomId);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [roomId, undo, redo]);

  return (
    <div className="shell">
      <TitleBlock roomId={roomId} />
      {readOnly ? (
        <p className="read-only-banner" role="alert">
          Glasshouse is open in another tab, so this tab is read-only. Close the other tab and reload to edit here.
        </p>
      ) : null}
      <div className="shell__body">
        <ProjectTree activeRoomId={roomId} />
        <main className="shell__main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
