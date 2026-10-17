import { useState } from 'react';
import { Link } from 'react-router';
import { isSelfApproved, type Plan } from '@glasshouse/domain';
import { pad2, StatusStamp } from '../../ui/StatusStamp';
import { formatTime } from '../../ui/time';
import { useT } from '../../i18n';
import { historyText } from '../plan/issueText';

/** Events per page, newest first. */
const PAGE = 20;
/** Revisions shown before "Show all". */
const RECENT_REVISIONS = 5;

export function HistoryPanel({ plan, roomId }: { plan: Plan; roomId: string }) {
  const m = useT();
  const currentNumber = plan.revisions[plan.revisions.length - 1]?.number;
  const [allRevisions, setAllRevisions] = useState(false);
  const [page, setPage] = useState(0);
  const allRevs = [...plan.revisions].reverse();
  const revisions = allRevisions ? allRevs : allRevs.slice(0, RECENT_REVISIONS);
  const all = [...plan.history].reverse();
  const pages = Math.max(1, Math.ceil(all.length / PAGE));
  const at = Math.min(page, pages - 1);
  const events = all.slice(at * PAGE, at * PAGE + PAGE);
  return (
    <section className="review-card glass" aria-labelledby="history-h">
      <h2 id="history-h">{m.review.history}</h2>
      <ul className="revisions">
        {revisions.map((r) => (
          <li key={r.number} className="revisions__item">
            <span className="mono revisions__n">{`R${pad2(r.number)}`}</span>
            <StatusStamp state={r.state} />
            <span className="revisions__who">
              {r.designedBy ? m.review.designedByName(r.designedBy.name) : m.review.designerNotRecorded}
              {r.approvedBy ? m.review.approvedByName(r.approvedBy.name, formatTime(r.approvedAt)) : ''}
              {[r.designedBy, r.approvedBy].some((p) => p && !p.userId) ? m.review.unverifiedTail : ''}
              {isSelfApproved(r) ? m.review.selfApprovedTail : ''}
            </span>
            {r.number !== currentNumber ? (
              <Link className="revisions__view" to={`/rooms/${roomId}/plan?rev=${r.number}`} aria-label={m.review.viewRev(pad2(r.number))}>
                {m.review.view}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
      {allRevs.length > RECENT_REVISIONS ? (
        <button type="button" className="btn btn--sm btn--quiet revisions__more" onClick={() => setAllRevisions(!allRevisions)}>
          {allRevisions ? m.review.fewerRevisions : m.review.allRevisions(allRevs.length)}
        </button>
      ) : null}
      <ol className="events" aria-label={m.review.events}>
        {events.map((e, i) => (
          <li key={`${e.at}-${i}`}>
            <span className="events__time mono">{formatTime(e.at)}</span>
            <span className="mono events__rev">{`R${pad2(e.revision)}`}</span>
            <span>{historyText(m, e)}</span>
          </li>
        ))}
      </ol>
      {pages > 1 ? (
        <nav className="events__pages" aria-label={m.review.pages}>
          <button type="button" className="btn btn--sm" disabled={at === 0} onClick={() => setPage(at - 1)}>
            {m.review.newer}
          </button>
          <span className="mono">{m.review.pageOf(at + 1, pages)}</span>
          <button type="button" className="btn btn--sm" disabled={at >= pages - 1} onClick={() => setPage(at + 1)}>
            {m.review.older}
          </button>
        </nav>
      ) : null}
    </section>
  );
}
