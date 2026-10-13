import { isSelfApproved, type Plan } from '@glasshouse/domain';
import { pad2, StatusStamp } from '../../ui/StatusStamp';
import { formatTime } from '../../ui/time';

export function HistoryPanel({ plan }: { plan: Plan }) {
  const revisions = [...plan.revisions].reverse();
  const events = [...plan.history].reverse();
  return (
    <section className="review-card glass" aria-labelledby="history-h">
      <h2 id="history-h">Revisions and history</h2>
      <ul className="revisions">
        {revisions.map((r) => (
          <li key={r.number} className="revisions__item">
            <span className="mono revisions__n">{`R${pad2(r.number)}`}</span>
            <StatusStamp state={r.state} />
            <span className="revisions__who">
              {r.designedBy ? `Designed by ${r.designedBy.name}` : 'Designer not recorded'}
              {r.approvedBy ? ` · approved by ${r.approvedBy.name} ${formatTime(r.approvedAt)}` : ''}
              {r.designedBy || r.approvedBy ? ' (unverified)' : ''}
              {isSelfApproved(r) ? ' · self-approved' : ''}
            </span>
          </li>
        ))}
      </ul>
      <ol className="events">
        {events.map((e, i) => (
          <li key={`${e.at}-${i}`}>
            <span className="events__time mono">{formatTime(e.at)}</span>
            <span className="mono events__rev">{`R${pad2(e.revision)}`}</span>
            <span>{e.action}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
