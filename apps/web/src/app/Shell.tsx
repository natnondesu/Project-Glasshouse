import type { KeyboardEvent } from 'react';
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

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (isTextEntry(e.target) || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  };

  return (
    <div className="shell" onKeyDown={onKeyDown}>
      <TitleBlock roomId={roomId} />
      <div className="shell__body">
        <ProjectTree activeRoomId={roomId} />
        <main className="shell__main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
