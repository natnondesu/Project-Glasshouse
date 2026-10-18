import { useEffect } from 'react';
import { Outlet, useMatch } from 'react-router';
import { ProjectTree } from '../features/tree/ProjectTree';
import { PanelRail } from '../ui/PanelRail';
import { usePersistentState } from '../ui/usePersistentState';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useRoomLocation, useViewedRevisionNumber } from '../store/hooks';
import { useT } from '../i18n';
import { HintLayer } from './HintLayer';
import { SyncNotice } from './SyncNotice';
import { ClaimLostDialog } from '../claims/ClaimLostDialog';
import { ConfirmDialog } from '../ui/confirm/ConfirmDialog';
import { TitleBlock } from './TitleBlock';
import { treePlacement, usePinnedTree } from '../features/roomnav/placement';
import { useTreeDrawer } from '../features/roomnav/useTreeDrawer';
import './shell.css';

const isTextEntry = (target: EventTarget): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

export function Shell() {
  const match = useMatch('/rooms/:roomId/*');
  const roomId = match?.params.roomId ?? null;
  const undo = useWorkspaceStore((s) => s.undo);
  const redo = useWorkspaceStore((s) => s.redo);
  const readOnly = useWorkspaceStore((s) => s.readOnly);
  const readOnlyReason = useWorkspaceStore((s) => s.readOnlyReason);
  const connection = useWorkspaceStore((s) => s.connection);
  const viewingPast = useViewedRevisionNumber() !== null;
  const [treeOpen, setTreeOpen] = usePersistentState('glasshouse:tree-open', true);
  const [pinned, setPinned] = usePinnedTree();
  // A room that isn't in the workspace (deleted elsewhere, a stale link) is a not-found page: the tree docks there.
  const inRoom = useRoomLocation(roomId) !== null;
  const drawer = useTreeDrawer(inRoom, pinned);
  const placement = treePlacement({ inRoom, treeOpen, pinned, drawerOpen: drawer.open });
  const m = useT();
  const togglePin = (): void => {
    // Pinning docks the open drawer in place; unpinning leaves it open as a drawer until it is dismissed.
    drawer.setOpen(pinned);
    setPinned(!pinned);
  };

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
      <TitleBlock roomId={roomId} drawer={inRoom && !pinned ? drawer : null} />
      {readOnly && readOnlyReason === 'view-only' && connection !== 'offline' ? (
        <p className="read-only-banner" role="status">
          {m.shell.viewOnly}
        </p>
      ) : connection === 'offline' || (readOnly && connection !== 'local') ? (
        <p className="read-only-banner" role="alert">
          {m.shell.offline}
        </p>
      ) : readOnly ? (
        <p className="read-only-banner" role="alert">
          {m.shell.otherTab}
        </p>
      ) : null}
      <SyncNotice />
      <div className="shell__body">
        {/* One slot for docked and drawer alike, so the tree keeps its state (a rename in progress) as it moves. */}
        {placement === 'rail' ? (
          <PanelRail label={m.panels.projects} side="left" onExpand={() => setTreeOpen(true)} />
        ) : placement === 'hidden' ? null : (
          <ProjectTree
            activeRoomId={roomId}
            variant={placement === 'drawer' ? 'drawer' : 'docked'}
            onCollapse={inRoom ? undefined : () => setTreeOpen(false)}
            pin={inRoom ? { pinned, onToggle: togglePin } : undefined}
            onRoomPicked={drawer.onRoomPicked}
            onRoomAdded={drawer.onRoomAdded}
            onRenameDone={drawer.onRenameDone}
            panelRef={drawer.panelRef}
          />
        )}
        <main id="main" tabIndex={-1} className="shell__main">
          <Outlet />
        </main>
      </div>
      <ConfirmDialog />
      <ClaimLostDialog />
    </div>
  );
}
