import { approvalBlockers, currentRevision, isSelfApproved, type Plan } from '@glasshouse/domain';
import { useState, type FormEvent } from 'react';
import { useReviewCommit } from '../../store/hooks';
import { pad2, StatusStamp } from '../../ui/StatusStamp';
import { formatTime } from '../../ui/time';

const now = (): string => new Date().toISOString();

export function ApprovalPanel({ roomId, plan }: { roomId: string; plan: Plan }) {
  const revision = currentRevision(plan);
  const review = useReviewCommit(roomId);
  const blockers = approvalBlockers(plan);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const act = (problem: string | null): void => {
    setError(problem);
    if (problem === null) setName('');
  };
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    act(review({ type: 'review/submit', designedBy: name, at: now() }));
  };
  const approve = (e: FormEvent): void => {
    e.preventDefault();
    act(review({ type: 'review/approve', reviewer: name, at: now() }));
  };
  const newDraft = (): void => act(review({ type: 'review/new-draft', at: now() }));

  return (
    <section className="review-card glass" aria-labelledby="approval-h">
      <header className="review-card__head">
        <h2 id="approval-h">{`Revision ${pad2(revision.number)}`}</h2>
        <StatusStamp state={revision.state} />
        {isSelfApproved(revision) ? <span className="stamp stamp--warn">Self-approved</span> : null}
      </header>
      <dl className="review-facts">
        <dt>Designed by</dt>
        <dd>{revision.designedBy ? `${revision.designedBy.name} (unverified)` : '—'}</dd>
        <dt>Submitted</dt>
        <dd>{formatTime(revision.submittedAt)}</dd>
        <dt>Approved by</dt>
        <dd>{revision.approvedBy ? `${revision.approvedBy.name} (unverified)` : '—'}</dd>
        <dt>Approved</dt>
        <dd>{formatTime(revision.approvedAt)}</dd>
      </dl>

      {revision.state === 'draft' ? (
        <form className="review-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="designer" className="field__label">
              Designed by (optional, unverified)
            </label>
            <div className="field__box">
              <input id="designer" className="field__input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
          </div>
          <button type="submit" className="btn btn--ink">
            Submit for review
          </button>
          <p className="review-note">Submitting freezes this Revision as a Snapshot. The checks don't have to pass yet.</p>
        </form>
      ) : null}

      {revision.state === 'in_review' ? (
        <form className="review-form" onSubmit={approve}>
          <div className="field">
            <label htmlFor="reviewer" className="field__label">
              Reviewer name (unverified)
            </label>
            <div className="field__box">
              <input id="reviewer" className="field__input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
          </div>
          <div className="review-form__actions">
            <button type="submit" className="btn btn--ink" disabled={blockers.length > 0}>
              Approve revision
            </button>
            <button type="button" className="btn" onClick={newDraft}>
              Start new draft
            </button>
          </div>
        </form>
      ) : null}

      {revision.state === 'approved' ? (
        <div className="review-form">
          <p className="review-note">Approved Revisions never change. To make changes, start a new Draft.</p>
          <button type="button" className="btn btn--ink" onClick={newDraft}>
            Start new draft
          </button>
        </div>
      ) : null}

      {revision.state !== 'approved' ? (
        blockers.length > 0 ? (
          <div className="blockers">
            <h3>Approval is blocked by</h3>
            <ul>
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="review-ready">Ready for approval: no blocking issues.</p>
        )
      ) : null}
      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
