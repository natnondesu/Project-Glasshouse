import { currentRevision } from '@glasshouse/domain';
import { lazy, Suspense, useEffect } from 'react';
import { useParams } from 'react-router';
import { BomView } from '../features/bom/BomView';
import { NetworkView } from '../features/network/NetworkView';
import { ElevationView } from '../features/elevation/ElevationView';
import { PlanView } from '../features/plan/PlanView';
import { ReviewView } from '../features/review/ReviewView';
import { locationAtRevision, useRoomLocation, useViewedRevisionNumber } from '../store/hooks';
import { RevisionBanner } from './RevisionBanner';
import { ErrorBoundary } from './ErrorBoundary';
import { NotFound } from './NotFound';

// three.js is large and only this view needs it: keep it out of the main bundle.
const Room3DView = lazy(() => import('../features/room3d/Room3DView'));
import { ViewTabs } from './ViewTabs';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useAuthStore } from '../auth/authStore';
import { releaseRoom } from '../claims/claimApi';
import { useClaimHeldByOther, useClaimsStore } from '../claims/claimsStore';
import { messagesFor, useLangStore, useT } from '../i18n';
import { getActiveSync } from '../sync/serverMode';
import { useDocumentTitle } from '../ui/useDocumentTitle';
import { useRememberRoom } from '../features/home/lastRoom';

/** View route segment to its tab label key, for the page heading. */
const TAB_LABEL: Record<string, 'plan' | 'elevation' | 'threeD' | 'network' | 'bom' | 'review'> = { plan: 'plan', elevation: 'elevation', '3d': 'threeD', network: 'network', bom: 'bom', review: 'review' };

export function RoomScreen() {
  const { roomId = '', view = 'plan' } = useParams();
  const realLocation = useRoomLocation(roomId);
  const viewedNumber = useViewedRevisionNumber();
  const storeReadOnly = useWorkspaceStore((s) => s.readOnly);
  const storeReadOnlyReason = useWorkspaceStore((s) => s.readOnlyReason);
  const m = useT();
  const tabLabel = TAB_LABEL[view] ? m.views[TAB_LABEL[view]!] : view;
  useDocumentTitle(realLocation ? `${realLocation.room.name} · ${tabLabel}` : null);
  useRememberRoom(realLocation ? roomId : null);
  const heldByOther = useClaimHeldByOther(roomId);
  // Leaving the room hands it back, once what this tab still has unsent has been sent.
  useEffect(() => {
    return () => {
      const mine = useClaimsStore.getState().byRoom[roomId];
      const me = useAuthStore.getState().user?.id;
      if (!mine || !me || mine.userId !== me) return;
      void (async () => {
        try {
          await getActiveSync()?.flush();
          await releaseRoom(roomId);
        } catch {
          useWorkspaceStore.getState().setNotice(messagesFor(useLangStore.getState().lang).claims.releaseFailed);
        }
      })();
    };
  }, [roomId]);
  if (!realLocation) return <NotFound message={m.shell.roomMissing} />;
  const past = view === 'review' ? null : locationAtRevision(realLocation, viewedNumber);
  const location = past ?? realLocation;
  const revision = currentRevision(location.room.plan);
  const frozen = past !== null || revision.state !== 'draft';
  // A viewer or an offline user can't change this draft either; another tab holding the lock keeps its own refusal message.
  const readOnly = frozen || heldByOther !== null || (storeReadOnly && storeReadOnlyReason !== 'other-tab');
  let body;
  if (view === 'plan') body = <PlanView key={`${roomId}:${revision.number}`} location={location} readOnly={readOnly} />;
  else if (view === 'elevation') body = <ElevationView key={`${roomId}:${revision.number}`} location={location} readOnly={readOnly} viewingPast={past !== null} />;
  else if (view === '3d')
    body = (
      <Suspense fallback={<p className="room3d__fallback" role="status">{m.shell.loading3d}</p>}>
        <Room3DView key={`${roomId}:${revision.number}`} location={location} readOnly={readOnly} />
      </Suspense>
    );
  else if (view === 'network') body = <NetworkView key={`${roomId}:${revision.number}`} location={location} readOnly={readOnly} />;
  else if (view === 'bom') body = <BomView key={roomId} location={location} />;
  else if (view === 'review') body = <ReviewView key={roomId} location={location} />;
  else return <NotFound message={m.shell.viewMissing} />;
  return (
    <div className="room-screen">
      <h1 className="visually-hidden">{m.views.pageTitle(realLocation.room.name, TAB_LABEL[view] ? m.views[TAB_LABEL[view]!] : view)}</h1>
      <ViewTabs roomId={roomId} frozen={!past && frozen && view !== 'review' ? revision : null} claim={!frozen} />
      {past ? <RevisionBanner roomId={roomId} view={view} viewed={revision} current={currentRevision(realLocation.room.plan)} /> : null}
      <ErrorBoundary key={view} label={m.views.drawing[view] ?? m.views.drawing.other!}>
        {body}
      </ErrorBoundary>
    </div>
  );
}
