import { useEffect } from 'react';
import { Outlet, useMatch } from 'react-router';
import { ProjectTree } from '../features/tree/ProjectTree';
import { PanelRail } from '../ui/PanelRail';
import { usePersistentState } from '../ui/usePersistentState';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useViewedRevisionNumber } from '../store/hooks';
import { useT } from '../i18n';
import { HintLayer } from './HintLayer';
import { ConfirmDialog } from '../ui/confirm/ConfirmDialog';
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
  const viewingPast = useViewedRevisionNumber() !== null;
  const [treeOpen, setTreeOpen] = usePersistentState('glasshouse:tree-open', true);
  const m = useT();

  // Window-level so undo still works when focus falls back to <body>, e.g. right after a delete.
  useEffect(() => {
    if (!roomId) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.target && isTextEntry(e.target) || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      // An older revision is on screen: undoing the hidden current draft would be invisible and surprising.
      if (viewingPast) return;
      e.preventDefault();
      if (e.shiftKey) redo(roomId);
      else undo(roomId);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [roomId, undo, redo, viewingPast]);

  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        {m.shell.skipToMain}
      </a>
      <HintLayer />
      <TitleBlock roomId={roomId} />
      {readOnly ? (
        <p className="read-only-banner" role="alert">
          {m.shell.otherTab}
        </p>
      ) : null}
      <div className="shell__body">
        {treeOpen ? <ProjectTree activeRoomId={roomId} onCollapse={() => setTreeOpen(false)} /> : <PanelRail label={m.panels.projects} side="left" onExpand={() => setTreeOpen(true)} />}
        <main id="main" tabIndex={-1} className="shell__main">
          <Outlet />
        </main>
      </div>
      <ConfirmDialog />
    </div>
  );
}
