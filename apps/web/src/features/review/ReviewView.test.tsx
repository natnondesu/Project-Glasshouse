import { createObject, currentRevision, findRoom, type Rack, type Template } from '@glasshouse/domain';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { routes } from '../../app/routes';
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

beforeEach(() => seed());

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
