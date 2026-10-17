import { formatURange, racksOf, type Rack, type ReservedRange, type Revision } from '@glasshouse/domain';
import { useState, type FormEvent } from 'react';
import { useReviewCommit } from '../../store/hooks';
import { useCan } from '../../auth/useCan';
import { useT } from '../../i18n';
import { usePeople } from '../../people/peopleStore';
import { personLabel } from '../../ui/person';

function AcknowledgeForm({ roomId, range, disabled }: { roomId: string; range: ReservedRange; disabled: boolean }) {
  const review = useReviewCommit(roomId);
  const m = useT();
  const can = useCan();
  const [reason, setReason] = useState('');
  const [by, setBy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    setError(review({ type: 'review/acknowledge', reservedRangeId: range.id, reason, by: can.me?.name ?? by, ...(can.me ? { byId: can.me.id } : {}), at: new Date().toISOString() }));
  };
  return (
    <form className="ack-form" onSubmit={submit}>
      <fieldset disabled={disabled} className="inspector__lock">
        <div className="field">
          <label htmlFor={`${range.id}-reason`} className="field__label">
            {m.review.why}
          </label>
          <div className="field__box field__box--multiline">
            <textarea id={`${range.id}-reason`} className="field__input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <div className="ack-form__row">
          {can.verifiedNames ? null : (
            <div className="field">
              <label htmlFor={`${range.id}-by`} className="field__label">
                {m.review.yourName}
              </label>
              <div className="field__box">
                <input id={`${range.id}-by`} className="field__input" value={by} onChange={(e) => setBy(e.target.value)} />
              </div>
            </div>
          )}
          <button type="submit" className="btn">
            {m.review.acknowledge}
          </button>
        </div>
      </fieldset>
      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function UnknownsPanel({ roomId, revision }: { roomId: string; revision: Revision }) {
  const review = useReviewCommit(roomId);
  const m = useT();
  const people = usePeople();
  const can = useCan();
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const frozen = revision.state === 'approved';
  const items: { rack: Rack; range: ReservedRange }[] = racksOf(revision.content).flatMap((rack) =>
    rack.reserved.filter((r) => r.demand.kind === 'unknown').map((range) => ({ rack, range })),
  );
  return (
    <section className="review-card glass" aria-labelledby="unknowns-h">
      <h2 id="unknowns-h">{m.review.unknowns}</h2>
      {items.length === 0 ? <p className="review-note">{m.review.noUnknowns}</p> : null}
      <ul className="unknowns">
        {items.map(({ rack, range }) => {
          const ack = revision.acknowledgements.find((a) => a.reservedRangeId === range.id);
          return (
            <li key={range.id} className="unknowns__item">
              {ack ? null : <p className="unknowns__issue">{m.review.unknownIssue}</p>}
              <p className="unknowns__what">
                <strong>{range.label}</strong> <span className="mono">{`${formatURange(range)} · ${rack.name}`}</span>
              </p>
              {ack ? (
                <div className="unknowns__ack">
                  <p>{m.review.acceptedBy(personLabel(m, ack.by, people), ack.reason)}</p>
                  <button
                    type="button"
                    className="btn btn--sm btn--quiet"
                    disabled={frozen || !can.review}
                    onClick={() => setWithdrawError(review({ type: 'review/unacknowledge', reservedRangeId: range.id, at: new Date().toISOString() }))}
                  >
                    {m.review.withdraw}
                  </button>
                </div>
              ) : can.review ? (
                <AcknowledgeForm roomId={roomId} range={range} disabled={frozen} />
              ) : (
                <p className="review-note">{m.review.reviewersOnlyUnknowns}</p>
              )}
            </li>
          );
        })}
      </ul>
      {withdrawError ? (
        <p role="alert" className="field__error">
          {withdrawError}
        </p>
      ) : null}
    </section>
  );
}
