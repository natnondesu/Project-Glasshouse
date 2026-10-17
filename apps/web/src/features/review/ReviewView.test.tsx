import { createObject, currentRevision, findRoom, type Rack, type ReviewCommand, type Template } from '@glasshouse/domain';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { resetAuthStore, useAuthStore } from '../../auth/authStore';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

const revision = () => currentRevision(findRoom(useWorkspaceStore.getState().workspace, 'r')!.room.plan);

function seed({ device = true, reserved = false } = {}): void {
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  const t = (id: string) => s.workspace.catalog.find((x) => x.id === id) as Template;
  s.dispatch({ type: 'project/create', id: 'p', name: 'P' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'S' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', floorAreaId: 'fa-r', name: 'MDF-1' });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), id: 'rk', name: 'RK-01' } } });
  if (device) s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'srv', rackId: 'rk', bottomU: 1, template: t('tpl-server-2u') } });
  if (reserved) {
    s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'reserved/add', rackId: 'rk', range: { id: 'rsv', label: 'Customer core', bottomU: 10, heightU: 4, demand: { kind: 'unknown' }, notes: '' } } });
  }
}
const open = () => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/review'] })} />);

const AT = '2026-10-15T09:00:00.000Z';
const signInAs = (role: 'viewer' | 'editor' | 'reviewer' | 'admin', id = 'me'): void =>
  useAuthStore.setState({ status: 'signed-in', user: { id, name: 'Nok R.', email: 'n@x', role, mustChangePassword: false } });
const review = (command: ReviewCommand): void => {
  const problem = useWorkspaceStore.getState().dispatch({ type: 'review', roomId: 'r', command });
  if (problem) throw new Error(problem.message);
};

beforeEach(() => {
  resetAuthStore();
  seed();
});

it('AC13/AC16: submits and approves after confirming, flags self-approval, and stamps the approval', async () => {
  const user = userEvent.setup();
  open();
  await user.type(screen.getByLabelText('Designed by (optional, unverified)'), 'Ploy');
  await user.click(screen.getByRole('button', { name: 'Submit for review' }));
  // Freezing asks once, in place, saying what it does.
  expect(revision()).toMatchObject({ state: 'draft' });
  expect(screen.getByRole('group', { name: 'Confirm submit' })).toHaveTextContent('Nothing blocks approval.');
  await user.click(screen.getByRole('button', { name: 'Confirm submit' }));
  expect(revision()).toMatchObject({ state: 'in_review', designedBy: { name: 'Ploy' } });
  expect(screen.getByText('Ready for approval: no blocking issues.')).toBeInTheDocument();
  await user.type(screen.getByLabelText('Reviewer name (unverified)'), 'ploy');
  await user.click(screen.getByRole('button', { name: 'Approve revision' }));
  expect(screen.getByText(/The reviewer is also the designer/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Confirm approval' }));
  expect(revision()).toMatchObject({ state: 'approved', approvedBy: { name: 'ploy' } });
  expect(screen.getByRole('status')).toHaveTextContent('APPROVED');
  expect(screen.getByText('Self-approved')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open Install sheet' })).toHaveClass('btn--ink');
  await user.click(screen.getByRole('button', { name: 'Start new draft' }));
  expect(revision()).toMatchObject({ number: 2, state: 'draft' });
});

describe('approval fingerprint', () => {
  const approveWith = (approvedHash: string | undefined): void => {
    review({ type: 'review/submit', designedBy: 'Ploy', at: AT });
    review({ type: 'review/approve', reviewer: 'Nok', at: AT });
    const { workspace, replace } = useWorkspaceStore.getState();
    replace({
      ...workspace,
      projects: workspace.projects.map((p) => ({
        ...p,
        sites: p.sites.map((s) => ({
          ...s,
          rooms: s.rooms.map((r) => ({ ...r, plan: { ...r.plan, revisions: r.plan.revisions.map(({ approvedHash: _dropped, ...rev }) => (approvedHash ? { ...rev, approvedHash } : rev)) } })),
        })),
      })),
    });
  };

  it('shows the short fingerprint on an approved revision', () => {
    approveWith('ab'.repeat(32));
    open();
    expect(screen.getByRole('status')).toHaveTextContent('Fingerprint abababababab');
  });

  it('shows no fingerprint for a revision approved before fingerprints existed', () => {
    approveWith(undefined);
    open();
    expect(screen.getByRole('status')).toHaveTextContent('APPROVED');
    expect(screen.queryByText(/Fingerprint/)).toBeNull();
  });
});

it('cancels a submit without changing anything', async () => {
  const user = userEvent.setup();
  open();
  await user.click(screen.getByRole('button', { name: 'Submit for review' }));
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(revision()).toMatchObject({ state: 'draft' });
  expect(screen.getByRole('button', { name: 'Submit for review' })).toBeInTheDocument();
});

it('shows blockers and keeps approval disabled until they clear', async () => {
  const user = userEvent.setup();
  seed({ device: false });
  open();
  await user.click(screen.getByRole('button', { name: 'Submit for review' }));
  expect(screen.getByRole('group', { name: 'Confirm submit' })).toHaveTextContent('1 item still blocks approval.');
  await user.click(screen.getByRole('button', { name: 'Confirm submit' }));
  expect(screen.getByText('Add at least one Device before approval.')).toBeInTheDocument();
  const approve = screen.getByRole('button', { name: 'Approve revision' });
  expect(approve).toBeDisabled();
  expect(approve).toHaveAccessibleDescription('Approval waits for the 1 item listed below.');
});

it('AC14: acknowledges unknown reserved demand with a reason and a name', async () => {
  const user = userEvent.setup();
  seed({ reserved: true });
  open();
  expect(screen.getByText('Reserved range U10–U13 in RK-01 has unknown demand.')).toBeInTheDocument();
  await user.type(screen.getByLabelText('Why is it acceptable?'), 'Customer will not share figures');
  await user.type(screen.getByLabelText('Your name (unverified)'), 'Somchai');
  await user.click(screen.getByRole('button', { name: 'Acknowledge' }));
  expect(revision().acknowledgements).toHaveLength(1);
  expect(screen.getByText(/Accepted by Somchai \(unverified\)/)).toBeInTheDocument();
  expect(screen.queryByText('Reserved range U10–U13 in RK-01 has unknown demand.')).toBeNull();
});

it('adds a note on the current revision with who wrote it, never holding approval, even after approval', async () => {
  const user = userEvent.setup();
  open();
  await user.type(screen.getByLabelText('New note'), 'Confirm the PDU model');
  await user.type(screen.getByLabelText('Your name (optional, unverified)'), 'Ploy');
  await user.click(screen.getByRole('button', { name: 'Add note' }));
  const notes = screen.getByRole('region', { name: 'Notes on R01' });
  expect(notes).toHaveTextContent('Confirm the PDU model');
  expect(notes).toHaveTextContent('Ploy (unverified)');
  expect(screen.queryByRole('checkbox', { name: 'Confirm the PDU model' })).toBeNull();
  // The Review badge counts only what holds approval.
  expect(screen.getByRole('link', { name: 'Review' })).toBeInTheDocument();
});

it('discards a draft after confirming, back to the approved revision, and logs it', async () => {
  const user = userEvent.setup();
  const s = useWorkspaceStore.getState();
  s.dispatch({ type: 'review', roomId: 'r', command: { type: 'review/submit', designedBy: 'Ploy', at: '2026-10-15T09:00:00.000Z' } });
  s.dispatch({ type: 'review', roomId: 'r', command: { type: 'review/approve', reviewer: 'Nok', at: '2026-10-15T09:00:00.000Z' } });
  s.dispatch({ type: 'review', roomId: 'r', command: { type: 'review/new-draft', at: '2026-10-15T09:00:00.000Z' } });
  open();
  await user.click(screen.getByRole('button', { name: 'Discard draft R02' }));
  expect(screen.getByRole('group', { name: 'Discard draft' })).toHaveTextContent('goes back to R01 (Approved)');
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(revision()).toMatchObject({ number: 2, state: 'draft' });
  await user.click(screen.getByRole('button', { name: 'Discard draft R02' }));
  await user.click(screen.getByRole('button', { name: 'Discard draft' }));
  expect(revision()).toMatchObject({ number: 1, state: 'approved' });
  expect(screen.getByRole('status')).toHaveTextContent('APPROVED');
  expect(screen.getByText('Discarded Draft revision 2; back to revision 1')).toBeInTheDocument();
});

it("offers no discard on a room's first draft", () => {
  open();
  expect(screen.queryByRole('button', { name: /^Discard draft/ })).toBeNull();
});

it('pages a long history 20 at a time, newest first', async () => {
  const user = userEvent.setup();
  const s = useWorkspaceStore.getState();
  for (let i = 0; i < 25; i += 1) s.dispatch({ type: 'review', roomId: 'r', command: { type: 'note/add', id: `n${i}`, text: `Note ${i}`, at: `2026-10-15T09:${String(i).padStart(2, '0')}:00.000Z` } });
  open();
  const events = () => within(screen.getByRole('list', { name: 'What happened, newest first' })).getAllByRole('listitem');
  expect(events()).toHaveLength(20);
  expect(screen.getByRole('button', { name: 'Newer' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Older' }));
  expect(events()).toHaveLength(5);
  expect(screen.getByRole('button', { name: 'Older' })).toBeDisabled();
});

describe('signed in on the shared server', () => {
  it('approves as the signed-in reviewer without asking for a name', async () => {
    const user = userEvent.setup();
    review({ type: 'review/submit', designedBy: 'Ploy S.', byId: 'other', at: AT });
    signInAs('reviewer');
    open();
    expect(screen.queryByLabelText('Reviewer name (unverified)')).toBeNull();
    expect(screen.getByText('Ploy S.')).toBeInTheDocument();
    expect(screen.queryByText(/unverified/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Approve revision' }));
    expect(screen.getByRole('group', { name: 'Confirm approval' })).toHaveTextContent('Approve R01 as Nok R.');
    await user.click(screen.getByRole('button', { name: 'Confirm approval' }));
    expect(revision()).toMatchObject({ state: 'approved', approvedBy: { name: 'Nok R.' } });
  });

  it('submits as the signed-in editor without asking for a name', async () => {
    const user = userEvent.setup();
    signInAs('editor');
    open();
    expect(screen.queryByLabelText('Designed by (optional, unverified)')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Submit for review' }));
    await user.click(screen.getByRole('button', { name: 'Confirm submit' }));
    expect(revision()).toMatchObject({ state: 'in_review', designedBy: { name: 'Nok R.' } });
  });

  it('keeps a reviewer from approving their own submission', () => {
    review({ type: 'review/submit', designedBy: 'Nok R.', byId: 'me', at: AT });
    signInAs('reviewer');
    open();
    expect(screen.getByRole('button', { name: 'Approve revision' })).toBeDisabled();
    expect(screen.getByText('You submitted this revision. Another reviewer has to approve it.')).toBeInTheDocument();
  });

  it('tells an editor only reviewers approve, and offers no approve button', () => {
    review({ type: 'review/submit', designedBy: 'Ploy S.', byId: 'other', at: AT });
    signInAs('editor');
    open();
    expect(screen.getByText('Only reviewers can approve.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve revision' })).toBeNull();
  });

  it('gives a viewer no way to submit, add notes or start a draft', () => {
    signInAs('viewer');
    open();
    expect(screen.queryByRole('button', { name: 'Submit for review' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add note' })).toBeNull();
  });

  it('shows who accepted unknown demand, without "(unverified)", and asks no name from a reviewer', async () => {
    const user = userEvent.setup();
    seed({ reserved: true });
    signInAs('reviewer');
    open();
    expect(screen.queryByLabelText('Your name (unverified)')).toBeNull();
    await user.type(screen.getByLabelText('Why is it acceptable?'), 'Customer will not share figures');
    await user.click(screen.getByRole('button', { name: 'Acknowledge' }));
    expect(revision().acknowledgements[0]).toMatchObject({ by: { name: 'Nok R.' } });
  });

  it('replaces the acknowledge form with a note for an editor', () => {
    seed({ reserved: true });
    signInAs('editor');
    open();
    expect(screen.getByText('Only reviewers can accept unknown demand.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull();
  });

  it('adds notes without a name field and shows verified authors plainly', async () => {
    const user = userEvent.setup();
    review({ type: 'note/add', id: 'n0', text: 'From a colleague', by: 'Ploy S.', byId: 'other', at: AT });
    signInAs('editor');
    open();
    expect(screen.queryByLabelText('Your name (optional, unverified)')).toBeNull();
    await user.type(screen.getByLabelText('New note'), 'Confirm the PDU model');
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    const notes = screen.getByRole('region', { name: 'Notes on R01' });
    expect(notes).toHaveTextContent('Ploy S. ·');
    expect(notes).toHaveTextContent('Nok R. ·');
    expect(notes).not.toHaveTextContent('unverified');
  });

  it('leaves "(unverified)" off history lines for verified people', () => {
    review({ type: 'review/submit', designedBy: 'Ploy S.', byId: 'other', at: AT });
    review({ type: 'review/approve', reviewer: 'Nok R.', byId: 'me', at: AT });
    signInAs('viewer');
    open();
    const history = screen.getByRole('region', { name: 'Revisions and history' });
    expect(history).toHaveTextContent('Approved by Nok R.');
    expect(history).not.toHaveTextContent('unverified');
  });

  it('labels each person on the revision list on their own', () => {
    review({ type: 'review/submit', designedBy: 'Ploy', at: AT });
    review({ type: 'review/approve', reviewer: 'Nok P.', byId: 'me', at: AT });
    signInAs('viewer');
    open();
    const row = within(screen.getByRole('region', { name: 'Revisions and history' })).getAllByRole('listitem')[0]!;
    expect(row).toHaveTextContent('Designed by Ploy (unverified) · approved by Nok P.');
    expect(row).not.toHaveTextContent('Nok P. (unverified)');
  });
});
