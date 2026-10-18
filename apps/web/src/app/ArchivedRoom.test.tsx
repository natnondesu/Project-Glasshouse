import { createWorkspace, currentRevision, liveCounts, withSample, type Rack } from '@glasshouse/domain';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Role } from '../auth/authApi';
import { resetAuthStore, useAuthStore } from '../auth/authStore';
import { resetClaimsStore, useClaimsStore } from '../claims/claimsStore';
import { en } from '../i18n/en';
import { useLangStore } from '../i18n/lang';
import { resetWorkspaceStore, useWorkspaceStore } from '../store/workspaceStore';
import { formatDay } from '../ui/time';
import { routes } from './routes';

const AT = '2026-10-18T09:00:00.000Z';
let approved = '';
let draft = '';
let site = '';

const send = (command: Parameters<ReturnType<typeof useWorkspaceStore.getState>['dispatch']>[0]) => {
  const problem = useWorkspaceStore.getState().dispatch(command);
  if (problem) throw new Error(problem.message);
};

beforeEach(() => {
  localStorage.clear();
  resetAuthStore();
  resetClaimsStore();
  resetWorkspaceStore();
  const seeded = withSample(createWorkspace(), '2026-10-16T00:00:00.000Z');
  if (!seeded.ok) throw new Error(seeded.error.message);
  const s = useWorkspaceStore.getState();
  s.replace(seeded.value);
  s.setLoad({ kind: 'ready' });
  const rooms = seeded.value.projects[0]!.sites[0]!.rooms;
  site = seeded.value.projects[0]!.sites[0]!.id;
  approved = rooms.find((r) => r.name === 'Server room A')!.id;
  draft = rooms.find((r) => r.name === 'MDF-1')!.id;
});
afterEach(async () => {
  await act(() => useLangStore.getState().setLang('en'));
});

const open = (path: string) => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
const signInAs = (role: Role): void => useAuthStore.setState({ status: 'signed-in', user: { id: 'u-ada', name: 'Ada', email: 'a@x', role, mustChangePassword: false } });
const banner = () => screen.getByText(/^Archived/, { selector: 'strong' }).closest('[role="status"]') as HTMLElement;

it('says who archived the room and when, and is read-only to the plan', () => {
  send({ type: 'room/archive', roomId: draft, by: 'Few', at: AT });
  open(`/rooms/${draft}/plan`);
  expect(banner()).toHaveTextContent(`Archived by Few on ${formatDay(AT)}. Read-only.`);
  expect(screen.getByLabelText('Width')).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Racks tools' })).toBeNull();
  expect(screen.getByText('Read-only')).toBeInTheDocument();
});

it('leaves the name out when nobody was named', () => {
  send({ type: 'room/archive', roomId: draft, by: '', at: AT });
  open(`/rooms/${draft}/plan`);
  expect(banner()).toHaveTextContent(`Archived on ${formatDay(AT)}. Read-only.`);
});

it('does not offer Start new draft on an archived approved room, and still opens its install sheet', () => {
  send({ type: 'room/archive', roomId: approved, by: 'Few', at: AT });
  open(`/rooms/${approved}/plan`);
  expect(screen.queryByRole('button', { name: 'Start new draft' })).toBeNull();
  expect(screen.queryByText(/R\d\d Approved · read-only/)).toBeNull();
  expect(screen.getByRole('link', { name: /Install sheet/ })).toHaveAttribute('href', `/rooms/${approved}/install-sheet`);
});

it('opens the install sheet of an archived room', () => {
  send({ type: 'room/archive', roomId: approved, by: 'Few', at: AT });
  open(`/rooms/${approved}/install-sheet`);
  expect(screen.getByRole('heading', { level: 1, name: 'Install sheet: Server room A, R01' })).toBeInTheDocument();
  const pages = document.querySelectorAll('.sheet-page');
  expect(pages.length).toBeGreaterThanOrEqual(4);
  for (const page of pages) expect(page).toHaveTextContent('R01 APPROVED');
  expect(screen.getByRole('img', { name: 'Server room A plan' })).toBeInTheDocument();
  expect(screen.getByRole('table', { name: 'Bill of materials' })).toBeInTheDocument();
});

it('lets an admin restore from the banner, and the plan is editable again', async () => {
  const user = userEvent.setup();
  signInAs('admin');
  send({ type: 'room/archive', roomId: draft, by: 'Few', at: AT });
  open(`/rooms/${draft}/plan`);
  await user.click(within(banner()).getByRole('button', { name: 'Restore' }));
  expect(screen.queryByText(/^Archived/, { selector: 'strong' })).toBeNull();
  expect(screen.getByLabelText('Width')).toBeEnabled();
});

it('shows an editor the banner without a way to restore', () => {
  signInAs('editor');
  send({ type: 'room/archive', roomId: draft, by: 'Few', at: AT });
  open(`/rooms/${draft}/plan`);
  expect(banner()).toHaveTextContent('Archived by Few');
  expect(within(banner()).queryByRole('button')).toBeNull();
});

it('names the site to restore first when the room is only archived through it', () => {
  signInAs('admin');
  send({ type: 'site/archive', siteId: site, by: 'Few', at: AT });
  open(`/rooms/${draft}/plan`);
  expect(banner()).toHaveTextContent(`Archived with site Bangna campus by Few on ${formatDay(AT)}. Read-only.`);
  expect(banner()).toHaveTextContent('Restore Site Bangna campus first.');
  expect(within(banner()).queryByRole('button', { name: 'Restore' })).toBeNull();
});

it('takes the editing controls out of Review: no submit, no notes, no new draft', () => {
  send({ type: 'room/archive', roomId: draft, by: 'Few', at: AT });
  open(`/rooms/${draft}/review`);
  expect(screen.queryByRole('button', { name: 'Submit for review' })).toBeNull();
  expect(screen.queryByLabelText('New note')).toBeNull();
  expect(screen.queryByRole('button', { name: /Start new draft/ })).toBeNull();
});

it('leaves an approved archived room’s Review without Start new draft', () => {
  send({ type: 'room/archive', roomId: approved, by: 'Few', at: AT });
  open(`/rooms/${approved}/review`);
  expect(screen.getByRole('link', { name: 'Open Install sheet' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Start new draft' })).toBeNull();
  expect(screen.queryByLabelText('New note')).toBeNull();
});

const firstDeviceId = (): string => {
  const room = useWorkspaceStore.getState().workspace.projects[0]!.sites[0]!.rooms.find((r) => r.id === approved)!;
  const rack = currentRevision(room.plan).content.objects.find((o): o is Rack => o.type === 'rack' && o.devices.length > 0)!;
  return rack.devices[0]!.id;
};

it('leaves the on-site state of equipment editable on an approved room that is not archived', () => {
  open(`/rooms/${approved}/elevation?sel=${firstDeviceId()}`);
  const group = screen.getByRole('group', { name: en.equipment.group });
  expect(within(group).getAllByRole('button').every((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
});

it('locks the on-site state of equipment in an archived room', () => {
  send({ type: 'room/archive', roomId: approved, by: 'Few', at: AT });
  open(`/rooms/${approved}/elevation?sel=${firstDeviceId()}`);
  const group = screen.getByRole('group', { name: en.equipment.group });
  expect(within(group).getAllByRole('button').every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  expect(screen.getByText(en.equipment.archivedNote)).toBeInTheDocument();
});

const widthOf = (roomId: string): number => useWorkspaceStore.getState().workspace.projects[0]!.sites[0]!.rooms.find((r) => r.id === roomId)!.plan.revisions[0]!.content.survey.width;

it('undoes a change in a room that is not archived (the control for the next test)', async () => {
  const user = userEvent.setup();
  const before = widthOf(draft);
  send({ type: 'plan', roomId: draft, command: { type: 'survey/update', patch: { width: 9 } } });
  open(`/rooms/${draft}/plan`);
  await user.keyboard('{Control>}z{/Control}');
  expect(widthOf(draft)).toBe(before);
  expect(screen.queryByText(/didn't go through/)).toBeNull();
});

it('refuses a keyboard undo in an archived room, says why, and leaves the room alone', async () => {
  const user = userEvent.setup();
  send({ type: 'plan', roomId: draft, command: { type: 'survey/update', patch: { width: 9 } } });
  send({ type: 'room/archive', roomId: draft, by: 'Few', at: AT });
  open(`/rooms/${draft}/plan`);
  await user.keyboard('{Control>}z{/Control}');
  expect(widthOf(draft)).toBe(9);
  expect(await screen.findByText(/Room MDF-1 is archived\. Restore it to make changes\./)).toBeInTheDocument();
});

it('says that in Thai too', async () => {
  const user = userEvent.setup();
  send({ type: 'plan', roomId: draft, command: { type: 'survey/update', patch: { width: 9 } } });
  send({ type: 'room/archive', roomId: draft, by: 'Few', at: AT });
  open(`/rooms/${draft}/plan`);
  await act(() => useLangStore.getState().setLang('th'));
  await user.keyboard('{Control>}z{/Control}');
  expect(await screen.findByText(/ห้อง MDF-1 เก็บถาวรอยู่ กู้คืนก่อนจึงจะแก้ไขได้/)).toBeInTheDocument();
  expect(screen.queryByText(/is archived/)).toBeNull();
});

it('words a refused edit to archived work in the viewer’s language', async () => {
  send({ type: 'site/archive', siteId: site, by: 'Few', at: AT });
  const edit = { type: 'plan', roomId: draft, command: { type: 'survey/update', patch: { width: 6 } } } as const;
  expect(useWorkspaceStore.getState().dispatch(edit)?.message).toBe('Room MDF-1 is archived with site Bangna campus. Restore Site Bangna campus to make changes.');
  await act(() => useLangStore.getState().setLang('th'));
  expect(useWorkspaceStore.getState().dispatch(edit)?.message).toBe('ห้อง MDF-1 เก็บถาวรพร้อมไซต์ Bangna campus กู้คืนไซต์ Bangna campus ก่อนจึงจะแก้ไขได้');
  expect(useWorkspaceStore.getState().dispatch({ type: 'room/delete', roomId: draft })?.message).toBe('กู้คืนไซต์ Bangna campus ก่อนจึงจะลบห้อง MDF-1 ได้');
});

it('says on the Review screen of an archived approved room that it is archived, not that a new draft will do', () => {
  send({ type: 'room/archive', roomId: approved, by: 'Few', at: AT });
  open(`/rooms/${approved}/review`);
  expect(screen.getByText(en.archive.reviewNote)).toBeInTheDocument();
  expect(screen.queryByText(/start a new Draft/)).toBeNull();
});

it('drops the Review tab’s blocker count in an archived room, where nothing can be fixed', () => {
  open(`/rooms/${draft}/plan`);
  const tab = screen.getByRole('link', { name: /^Review/ });
  expect(tab.querySelector('.view-tab__badge')).not.toBeNull();
  act(() => send({ type: 'room/archive', roomId: draft, by: 'Few', at: AT }));
  expect(screen.getByRole('link', { name: /^Review/ }).querySelector('.view-tab__badge')).toBeNull();
});

it('counts only what is in use in the header and on the home page', () => {
  const before = liveCounts(useWorkspaceStore.getState().workspace);
  send({ type: 'room/archive', roomId: draft, by: 'Few', at: AT });
  open('/');
  expect(liveCounts(useWorkspaceStore.getState().workspace)).toEqual({ projects: before.projects, rooms: before.rooms - 1 });
  expect(screen.getByText(en.shell.workspaceSummary(before.projects, before.rooms - 1))).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'MDF-1' })).toBeNull();
});

it('keeps an archived room off the home cards, and asks for a project when all are archived', () => {
  for (const p of useWorkspaceStore.getState().workspace.projects) send({ type: 'project/archive', projectId: p.id, by: '', at: AT });
  open('/');
  expect(screen.getByRole('heading', { level: 1, name: 'Start with a project' })).toBeInTheDocument();
  expect(screen.getByText('0 projects · 0 rooms', { exact: false })).toBeInTheDocument();
});

it('refuses to archive a room someone else is editing, in the viewer’s language', async () => {
  signInAs('admin');
  useClaimsStore.getState().setClaims([{ roomId: draft, userId: 'u-ploy', name: 'Ploy', since: AT, lastEditAt: new Date().toISOString() }]);
  expect(useWorkspaceStore.getState().dispatch({ type: 'room/archive', roomId: draft, by: 'Ada', at: AT })).toMatchObject({ code: 'room_busy', message: "Ploy is editing MDF-1. Try again when they're done.", targets: [draft] });
  expect(useWorkspaceStore.getState().dispatch({ type: 'site/archive', siteId: site, by: 'Ada', at: AT })).toMatchObject({ code: 'room_busy' });
  await act(() => useLangStore.getState().setLang('th'));
  expect(useWorkspaceStore.getState().dispatch({ type: 'room/archive', roomId: draft, by: 'Ada', at: AT })?.message).toBe('Ploy กำลังแก้ไข MDF-1 ลองใหม่เมื่อเขาแก้เสร็จแล้ว');
  useClaimsStore.getState().setClaims([{ roomId: draft, userId: 'u-ada', name: 'Ada', since: AT, lastEditAt: AT }]);
  expect(useWorkspaceStore.getState().dispatch({ type: 'room/archive', roomId: draft, by: 'Ada', at: AT })).toBeNull();
});

it('speaks Thai in the banner', async () => {
  send({ type: 'room/archive', roomId: draft, by: 'Few', at: AT });
  open(`/rooms/${draft}/plan`);
  await act(() => useLangStore.getState().setLang('th'));
  expect(await screen.findByText(/^เก็บถาวร โดย Few เมื่อ/)).toHaveTextContent('อ่านได้อย่างเดียว');
});
