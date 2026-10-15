import { approvalBlockerItems, currentRevision, isSelfApproved, type Plan } from '@glasshouse/domain';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useT } from '../../i18n';
import { useReviewCommit } from '../../store/hooks';
import { pad2, StatusStamp } from '../../ui/StatusStamp';
import { formatTime } from '../../ui/time';
import { blockerText } from '../plan/issueText';

const now = (): string => new Date().toISOString();
const sameName = (a: string, b: string): boolean => a.trim() !== '' && a.trim().toLowerCase() === b.trim().toLowerCase();

export function ApprovalPanel({ roomId, plan }: { roomId: string; plan: Plan }) {
  const revision = currentRevision(plan);
  const review = useReviewCommit(roomId);
  const blockers = approvalBlockerItems(plan);
  const m = useT();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Submit and Approve freeze the plan for good, so each asks once, in place, with what it will do.
  const [confirming, setConfirming] = useState(false);
  const rev = pad2(revision.number);

  const act = (problem: string | null): void => {
    setError(problem);
    setConfirming(false);
    if (problem === null) setName('');
  };
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (!confirming) return setConfirming(true);
    act(review({ type: 'review/submit', designedBy: name, at: now() }));
  };
  const approve = (e: FormEvent): void => {
    e.preventDefault();
    if (!confirming) return setConfirming(true);
    act(review({ type: 'review/approve', reviewer: name, at: now() }));
  };
  const newDraft = (): void => act(review({ type: 'review/new-draft', at: now() }));
  const cancel = (
    <button type="button" className="btn btn--quiet" onClick={() => setConfirming(false)}>
      {m.common.cancel}
    </button>
  );

  if (revision.state === 'approved') {
    return (
      <section className="review-card glass" aria-labelledby="approval-h">
        <h2 id="approval-h" className="visually-hidden">
          {m.review.revision(rev)}
        </h2>
        <div className="approval-stamp" role="status">
          <span className="approval-stamp__word">{m.review.stamp}</span>
          <span className="approval-stamp__rev mono">{m.review.stampRev(rev)}</span>
          <span className="approval-stamp__when mono">{formatTime(revision.approvedAt)}</span>
          {revision.approvedBy ? <span className="approval-stamp__by">{m.review.stampBy(revision.approvedBy.name)}</span> : null}
          {isSelfApproved(revision) ? <span className="stamp stamp--warn">{m.review.selfApproved}</span> : null}
        </div>
        <dl className="review-facts">
          <dt>{m.review.designedBy}</dt>
          <dd>{revision.designedBy ? m.review.unverified(revision.designedBy.name) : '—'}</dd>
          <dt>{m.review.submitted}</dt>
          <dd>{formatTime(revision.submittedAt)}</dd>
        </dl>
        <p className="review-note">{m.review.approvedNote}</p>
        <div className="review-form__actions">
          <Link to={`/rooms/${roomId}/install-sheet`} className="btn btn--ink">
            {m.review.openSheet}
          </Link>
          <button type="button" className="btn" onClick={newDraft}>
            {m.review.startDraft}
          </button>
        </div>
        {error ? (
          <p role="alert" className="field__error">
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="review-card glass" aria-labelledby="approval-h">
      <header className="review-card__head">
        <h2 id="approval-h">{m.review.revision(rev)}</h2>
        <StatusStamp state={revision.state} />
      </header>
      <dl className="review-facts">
        <dt>{m.review.designedBy}</dt>
        <dd>{revision.designedBy ? m.review.unverified(revision.designedBy.name) : '—'}</dd>
        <dt>{m.review.submitted}</dt>
        <dd>{formatTime(revision.submittedAt)}</dd>
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
          {confirming ? (
            <div className="review-confirm" role="group" aria-label={m.review.confirmSubmit}>
              <p>{m.review.submitConfirm(rev, blockers.length)}</p>
              <div className="review-form__actions">
                <button type="submit" className="btn btn--ink">
                  {m.review.confirmSubmit}
                </button>
                {cancel}
              </div>
            </div>
          ) : (
            <>
              <button type="submit" className="btn btn--ink">
                {m.review.submit}
              </button>
              <p className="review-note">{m.review.submitNote}</p>
            </>
          )}
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
          {confirming ? (
            <div className="review-confirm" role="group" aria-label={m.review.confirmApprove}>
              <p>{m.review.approveConfirm(rev, name.trim() || m.review.unnamedReviewer)}</p>
              {revision.designedBy && sameName(revision.designedBy.name, name) ? <p className="review-confirm__warn">{m.review.selfApproveWarn}</p> : null}
              <div className="review-form__actions">
                <button type="submit" className="btn btn--ink">
                  {m.review.confirmApprove}
                </button>
                {cancel}
              </div>
            </div>
          ) : (
            <div className="review-form__actions">
              <button type="submit" className="btn btn--ink" disabled={blockers.length > 0} aria-describedby={blockers.length > 0 ? 'approve-blocked' : undefined}>
                {m.review.approve}
              </button>
              <button type="button" className="btn" onClick={newDraft}>
                {m.review.startDraft}
              </button>
            </div>
          )}
          {blockers.length > 0 && !confirming ? (
            <p id="approve-blocked" className="review-note">
              {m.review.approveBlocked(blockers.length)}
            </p>
          ) : null}
        </form>
      ) : null}

      {blockers.length > 0 ? (
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
      )}
      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
