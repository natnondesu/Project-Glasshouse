import { formatURange, racksOf, type Rack, type ReservedRange, type Revision } from '@glasshouse/domain';
import { useState, type FormEvent } from 'react';
import { useReviewCommit } from '../../store/hooks';

function AcknowledgeForm({ roomId, range, disabled }: { roomId: string; range: ReservedRange; disabled: boolean }) {
  const review = useReviewCommit(roomId);
  const [reason, setReason] = useState('');
  const [by, setBy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    setError(review({ type: 'review/acknowledge', reservedRangeId: range.id, reason, by, at: new Date().toISOString() }));
  };
  return (
    <form className="ack-form" onSubmit={submit}>
      <fieldset disabled={disabled} className="inspector__lock">
        <div className="field">
          <label htmlFor={`${range.id}-reason`} className="field__label">
            Why is it acceptable?
          </label>
          <div className="field__box field__box--multiline">
            <textarea id={`${range.id}-reason`} className="field__input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <div className="ack-form__row">
          <div className="field">
            <label htmlFor={`${range.id}-by`} className="field__label">
              Your name (unverified)
            </label>
            <div className="field__box">
              <input id={`${range.id}-by`} className="field__input" value={by} onChange={(e) => setBy(e.target.value)} />
            </div>
          </div>
          <button type="submit" className="btn">
            Acknowledge
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
  const frozen = revision.state === 'approved';
  const items: { rack: Rack; range: ReservedRange }[] = racksOf(revision.content).flatMap((rack) =>
    rack.reserved.filter((r) => r.demand.kind === 'unknown').map((range) => ({ rack, range })),
  );
  return (
    <section className="review-card glass" aria-labelledby="unknowns-h">
      <h2 id="unknowns-h">Unknown Reserved-range demand</h2>
      {items.length === 0 ? <p className="review-note">No Reserved range has unknown demand.</p> : null}
      <ul className="unknowns">
        {items.map(({ rack, range }) => {
          const ack = revision.acknowledgements.find((a) => a.reservedRangeId === range.id);
          return (
            <li key={range.id} className="unknowns__item">
              {ack ? null : <p className="unknowns__issue">Unknown demand. Acknowledge it to unblock approval.</p>}
              <p className="unknowns__what">
                <strong>{range.label}</strong> <span className="mono">{`${formatURange(range)} · ${rack.name}`}</span>
              </p>
              {ack ? (
                <div className="unknowns__ack">
                  <p>{`Accepted by ${ack.by.name} (unverified): ${ack.reason}`}</p>
                  <button
                    type="button"
                    className="btn btn--sm btn--quiet"
                    disabled={frozen}
                    onClick={() => review({ type: 'review/unacknowledge', reservedRangeId: range.id, at: new Date().toISOString() })}
                  >
                    Withdraw
                  </button>
                </div>
              ) : (
                <AcknowledgeForm roomId={roomId} range={range} disabled={frozen} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
