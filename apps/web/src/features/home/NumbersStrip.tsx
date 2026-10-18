import { Link } from 'react-router';
import { useT } from '../../i18n';
import { IconBlock, IconCheck, IconWarn } from '../../ui/icons';
import { kw, powerShare, type HomeNumbers } from './homeNumbers';

interface NumbersStripProps {
  /** "Thailand", "Bangna campus", "Everywhere". */
  label: string;
  isSite: boolean;
  isWorld: boolean;
  query: string;
  /** Null while the map is still placing the sites of a region. */
  numbers: HomeNumbers | null;
  /** Shows the rooms that hold approval (the Needs attention chip). */
  onAttention: () => void;
}

function Holds({ n, onAttention }: { n: HomeNumbers; onAttention: () => void }) {
  const m = useT();
  if (n.roomsHeld === 0) {
    return (
      <>
        <dd className="numbers__figure numbers__figure--ok">
          <IconCheck />
          <span className="mono">0</span>
        </dd>
        <dd className="numbers__detail">{m.home.nothingHolds}</dd>
      </>
    );
  }
  const blocking = n.blocks > 0;
  const figure = (
    <>
      {blocking ? <IconBlock /> : <IconWarn />}
      <span className="mono">{blocking ? n.blocks : n.needsAck}</span>{' '}
      <span className="numbers__unit">{blocking ? m.home.blockingUnit : m.home.ackUnit}</span>
    </>
  );
  const cls = `numbers__figure numbers__hold${blocking ? ' numbers__hold--block' : ' numbers__hold--ack'}`;
  // One room: straight to its Review. Several: the rooms that need attention, below.
  return (
    <>
      <dd className="numbers__figure-wrap">
        {n.heldRoomId ? (
          <Link to={`/rooms/${n.heldRoomId}/review`} className={cls}>
            {figure}
          </Link>
        ) : (
          <button type="button" className={cls} onClick={onAttention}>
            {figure}
          </button>
        )}
      </dd>
      <dd className="numbers__detail">{blocking ? m.home.heldRooms(n.needsAck, n.roomsHeld) : m.home.heldRooms(0, n.roomsHeld)}</dd>
    </>
  );
}

/**
 * The scope's numbers under the globe: rooms by state, racks and devices, planned power against the rooms' limits
 * (unknown draws noted, never zero) and what holds approval. One ruled strip, like a drawing's title block.
 */
export function NumbersStrip({ label, isSite, isWorld, query, numbers: n, onAttention }: NumbersStripProps) {
  const m = useT();
  const share = n ? powerShare(n.knownW, n.limitW) : null;
  return (
    <section className="numbers" aria-label={m.home.numbersLabel(label)}>
      <div className="numbers__head">
        <h2 id="numbers-h">
          {label}
          {!isSite && n ? (
            <>
              {' '}
              <span className="numbers__count">· {m.globe.sitesHere(n.sites)}</span>
            </>
          ) : null}
          {query.trim() ? (
            <>
              {' '}
              <span className="numbers__query">· {m.home.matching(query.trim())}</span>
            </>
          ) : null}
        </h2>
        {isWorld && n && n.unplaced > 0 ? <p className="numbers__note">{m.home.notOnMapCounted(n.unplaced)}</p> : null}
      </div>
      {n ? (
        <dl className="numbers__grid glass">
          <div className="numbers__cell">
            <dt>{m.home.roomsLabel}</dt>
            <dd className="numbers__figure mono">{n.rooms}</dd>
            <dd className="numbers__detail">
              <span className="numbers__ok">{m.home.approvedN(n.approved)}</span>
              {' · '}
              {m.home.draftN(n.draft)}
              {n.inReview > 0 ? ` · ${m.home.inReviewN(n.inReview)}` : ''}
            </dd>
          </div>
          <div className="numbers__cell">
            <dt>{m.home.racksPlanned}</dt>
            <dd className="numbers__figure mono">{n.racks}</dd>
            <dd className="numbers__detail">{m.home.devicesPlaced(n.devices)}</dd>
          </div>
          <div className="numbers__cell numbers__cell--power">
            <dt>{m.home.powerPlanned}</dt>
            <dd className="numbers__figure">
              <span className="mono">{kw(n.knownW)}</span>{' '}
              <span className="numbers__unit mono">kW</span>
            </dd>
            <dd className="numbers__detail numbers__detail--stack">
              {n.rooms === 0 ? null : share ? (
                <>
                  <span className={`numbers__bar${share.over ? ' is-over' : ''}`} aria-hidden="true">
                    <span style={{ transform: `scaleX(${Math.min(1, share.pct / 100)})` }} />
                  </span>
                  <span className={share.over ? 'numbers__over' : undefined}>{share.over ? m.home.overLimits(share.pct, `${kw(n.limitW)} kW`) : m.home.ofLimits(share.pct, `${kw(n.limitW)} kW`)}</span>
                </>
              ) : (
                m.home.noLimits
              )}
              {n.unknownDemand > 0 ? <span className="numbers__unknown">{m.home.unknownNotCounted(n.unknownDemand)}</span> : null}
            </dd>
          </div>
          <div className="numbers__cell">
            <dt>{m.home.beforeApprovalLabel}</dt>
            <Holds n={n} onAttention={onAttention} />
          </div>
        </dl>
      ) : (
        <p className="numbers__pending" role="status">
          {m.home.findingSites}
        </p>
      )}
    </section>
  );
}
