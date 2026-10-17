import { currentRevision, exportProjectFile, findRoom } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

const width = () => currentRevision(findRoom(useWorkspaceStore.getState().workspace, 'r')!.room.plan).content.survey.width;
let exported = '';

beforeEach(() => {
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  s.dispatch({ type: 'project/create', id: 'p', name: 'Northgate' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'Site A' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', floorAreaId: 'fa-r', name: 'MDF-1' });
  const file = exportProjectFile(useWorkspaceStore.getState().workspace, 'p', '2026-10-14T00:00:00.000Z');
  if (!file.ok) throw new Error(file.error.message);
  exported = JSON.stringify(file.value);
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'survey/update', patch: { width: 7 } } });
});

const open = () => render(<RouterProvider router={createMemoryRouter(routes)} />);

it('AC15: shows the conflict and takes the incoming room only when chosen', async () => {
  const user = userEvent.setup();
  open();
  await user.upload(screen.getByLabelText('Choose a project file'), new File([exported], 'northgate.glasshouse.json', { type: 'application/json' }));
  const dialog = await screen.findByRole('dialog', { name: 'Import “Northgate”' });
  expect(dialog).toHaveTextContent('0 new rooms · 1 room already here · 0 new templates');
  expect(dialog).toHaveTextContent('MDF-1');
  await user.click(screen.getByRole('button', { name: 'MDF-1: take incoming' }));
  await user.click(screen.getByRole('button', { name: 'Import' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(width()).toBe(5);
});

it('keeps mine by default and can import as a copy', async () => {
  const user = userEvent.setup();
  open();
  await user.upload(screen.getByLabelText('Choose a project file'), new File([exported], 'n.json'));
  await screen.findByRole('dialog');
  await user.click(screen.getByRole('button', { name: 'Import as a copy' }));
  await user.click(screen.getByRole('button', { name: 'Import' }));
  expect(useWorkspaceStore.getState().workspace.projects.map((p) => p.name)).toEqual(['Northgate', 'Northgate (copy)']);
  expect(width()).toBe(7);
});

it('explains files that are not project files and changes nothing', async () => {
  const user = userEvent.setup();
  open();
  const before = useWorkspaceStore.getState().workspace;
  await user.upload(screen.getByLabelText('Choose a project file'), new File(['{"hello":1}'], 'x.json'));
  expect(await screen.findByRole('alert')).toHaveTextContent("This isn't a Glasshouse project file.");
  expect(useWorkspaceStore.getState().workspace).toBe(before);
});

it('is a native modal dialog that closes on Escape and returns focus to the import button', async () => {
  const user = userEvent.setup();
  open();
  const button = screen.getByRole('button', { name: 'Import project file' });
  button.focus();
  await user.upload(screen.getByLabelText('Choose a project file'), new File([exported], 'n.json'));
  const dialog = await screen.findByRole('dialog');
  expect(dialog.tagName).toBe('DIALOG');
  dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
  expect(await screen.findByRole('button', { name: 'Import project file' })).toHaveFocus();
  expect(screen.queryByRole('dialog')).toBeNull();
});
