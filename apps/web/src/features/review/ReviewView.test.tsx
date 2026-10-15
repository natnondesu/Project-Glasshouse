import { createObject, currentRevision, findRoom, type Rack, type Template } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
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
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', name: 'MDF-1' });
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

it('adds and resolves review notes', async () => {
  const user = userEvent.setup();
  open();
  await user.type(screen.getByLabelText('New review note'), 'Confirm the PDU model');
  await user.click(screen.getByRole('button', { name: 'Add note' }));
  expect(screen.getByText('1 review note is unresolved.')).toBeInTheDocument();
  await user.click(screen.getByRole('checkbox', { name: 'Confirm the PDU model' }));
  expect(screen.queryByText('1 review note is unresolved.')).toBeNull();
  expect(screen.getByRole('link', { name: 'Review' })).toBeInTheDocument();
});
