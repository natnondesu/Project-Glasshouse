import { useEffect, useState } from 'react';
import { useCan } from '../auth/useCan';
import { useT } from '../i18n';
import { confirmAction } from '../ui/confirm/confirmStore';
import { getActiveSync } from '../sync/serverMode';
import { useWorkspaceStore } from '../store/workspaceStore';
import { claimRoom, releaseRoom } from './claimApi';
import { CLAIM_IDLE_MS, isIdle, useClaimHeldByOther, useClaimsStore, useMyClaim } from './claimsStore';
import './claims.css';

const TICK_MS = 30_000;
const MS_PER_MINUTE = 60_000;

/** Re-renders every 30 s so "last edit" and the takeover button stay current. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}

const notice = (text: string): void => useWorkspaceStore.getState().setNotice(text);

export function RoomClaimBanner({ roomId }: { roomId: string }) {
  const m = useT();
  const can = useCan();
  const other = useClaimHeldByOther(roomId);
  const mine = useMyClaim(roomId);
  const now = useNow();
  const [busy, setBusy] = useState(false);
  if (!can.verifiedNames) return null;

  if (other) {
    const minutes = Math.max(0, Math.floor((now - Date.parse(other.lastEditAt)) / MS_PER_MINUTE));
    const allowed = can.admin || isIdle(other, now);
    const takeOver = async () => {
      if (!(await confirmAction({ title: m.claims.takeOverTitle(other.name), body: m.claims.takeOverBody(other.name), confirmLabel: m.claims.takeOver, tone: 'primary' }))) return;
      setBusy(true);
      try {
        const claim = await claimRoom(roomId);
        // The event stream stays the source of truth; this only avoids a flash of the old holder.
        useClaimsStore.getState().setClaims([...Object.values(useClaimsStore.getState().byRoom).filter((c) => c.roomId !== roomId), claim]);
      } catch (e) {
        notice(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    };
    return (
      <section className="claim-strip claim-strip--other" aria-label={m.claims.heldBy(other.name)}>
        <p className="claim-strip__text">
          <strong>{m.claims.heldBy(other.name)}</strong> {m.claims.lastEdit(minutes < 1 ? m.claims.justNow : m.claims.minutesAgo(minutes))}
        </p>
        {!can.edit ? null : allowed ? (
          <button type="button" className="btn btn--sm" disabled={busy} onClick={() => void takeOver()}>
            {m.claims.takeOver}
          </button>
        ) : (
          <p className="claim-strip__hint">{m.claims.takeOverLater(CLAIM_IDLE_MS / MS_PER_MINUTE)}</p>
        )}
      </section>
    );
  }

  if (mine) {
    const done = async () => {
      setBusy(true);
      try {
        await getActiveSync()?.flush();
        await releaseRoom(roomId);
      } catch {
        notice(m.claims.releaseFailed);
      } finally {
        setBusy(false);
      }
    };
    return (
      <section className="claim-strip claim-strip--mine" aria-label={m.claims.youEditing}>
        <p className="claim-strip__text">{m.claims.youEditing}</p>
        <button type="button" className="btn btn--sm" disabled={busy} onClick={() => void done()}>
          {m.claims.doneEditing}
        </button>
      </section>
    );
  }
  return null;
}
