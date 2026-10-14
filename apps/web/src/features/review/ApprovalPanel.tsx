import { approvalBlockerItems, currentRevision, isSelfApproved, type Plan } from '@glasshouse/domain';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useReviewCommit } from '../../store/hooks';
import { pad2, StatusStamp } from '../../ui/StatusStamp';
import { formatTime } from '../../ui/time';
import { useT } from '../../i18n';
import { blockerText } from '../plan/issueText';

const now = (): string => new Date().toISOString();

export function ApprovalPanel({ roomId, plan }: { roomId: string; plan: Plan }) {
  const revision = currentRevision(plan);
  const review = useReviewCommit(roomId);
  const blockers = approvalBlockerItems(plan);
  const m = useT();
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
        <h2 id="approval-h">{m.review.revision(pad2(revision.number))}</h2>
        <StatusStamp state={revision.state} />
        {isSelfApproved(revision) ? <span className="stamp stamp--warn">{m.review.selfApproved}</span> : null}
      </header>
      <dl className="review-facts">
        <dt>{m.review.designedBy}</dt>
        <dd>{revision.designedBy ? m.review.unverified(revision.designedBy.name) : '—'}</dd>
        <dt>{m.review.submitted}</dt>
        <dd>{formatTime(revision.submittedAt)}</dd>
        <dt>{m.review.approvedBy}</dt>
        <dd>{revision.approvedBy ? m.review.unverified(revision.approvedBy.name) : '—'}</dd>
        <dt>{m.review.approved}</dt>
        <dd>{formatTime(revision.approvedAt)}</dd>
      </dl>

      {revision.state === 'draft' ? (
        <form className="review-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="designer" className="field__label">
              {m.review.designerField}
            </label>
            <div className="field__box">
              <input id="designer" className="field__input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
          </div>
          <button type="submit" className="btn btn--ink">
            {m.review.submit}
          </button>
          <p className="review-note">{m.review.submitNote}</p>
        </form>
      ) : null}

      {revision.state === 'in_review' ? (
        <form className="review-form" onSubmit={approve}>
          <div className="field">
            <label htmlFor="reviewer" className="field__label">
              {m.review.reviewerField}
            </label>
            <div className="field__box">
              <input id="reviewer" className="field__input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
          </div>
          <div className="review-form__actions">
            <button type="submit" className="btn btn--ink" disabled={blockers.length > 0}>
              {m.review.approve}
            </button>
            <button type="button" className="btn" onClick={newDraft}>
              {m.review.startDraft}
            </button>
          </div>
        </form>
      ) : null}

      {revision.state === 'approved' ? (
        <div className="review-form">
          <p className="review-note">{m.review.approvedNote}</p>
          <Link to={`/rooms/${roomId}/install-sheet`} className="btn">
            {m.review.openSheet}
          </Link>
          <button type="button" className="btn btn--ink" onClick={newDraft}>
            {m.review.startDraft}
          </button>
        </div>
      ) : null}

      {revision.state !== 'approved' ? (
        blockers.length > 0 ? (
          <div className="blockers">
            <h3>{m.review.blockedBy}</h3>
            <ul>
              {blockers.map((b, i) => (
                <li key={`${b.code}-${i}`}>{blockerText(m, b)}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="review-ready">{m.review.ready}</p>
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
