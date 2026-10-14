import { Link } from 'react-router';
import { isSelfApproved, type Plan } from '@glasshouse/domain';
import { pad2, StatusStamp } from '../../ui/StatusStamp';
import { formatTime } from '../../ui/time';
import { useT } from '../../i18n';
import { historyText } from '../plan/issueText';

export function HistoryPanel({ plan, roomId }: { plan: Plan; roomId: string }) {
  const m = useT();
  const currentNumber = plan.revisions[plan.revisions.length - 1]?.number;
  const revisions = [...plan.revisions].reverse();
  const events = [...plan.history].reverse();
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
              {r.designedBy || r.approvedBy ? m.review.unverifiedTail : ''}
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
      <ol className="events">
        {events.map((e, i) => (
          <li key={`${e.at}-${i}`}>
            <span className="events__time mono">{formatTime(e.at)}</span>
            <span className="mono events__rev">{`R${pad2(e.revision)}`}</span>
            <span>{historyText(m, e)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
