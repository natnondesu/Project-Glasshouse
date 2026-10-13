import { createWorkspace, currentRevision, withSample, type Workspace } from '@glasshouse/domain';
import { act, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

const AT = '2026-10-14T00:00:00.000Z';
let server = '';
let mdf = '';

function approveMdf(): void {
  const s = useWorkspaceStore.getState();
  const room = s.workspace.projects[0]!.sites[0]!.rooms[1]!;
  const content = currentRevision(room.plan).content;
  const ex = content.objects.find((o) => o.type === 'existing_rack')!;
  const range = content.objects.flatMap((o) => (o.type === 'rack' ? o.reserved : []))[0]!;
  s.dispatch({ type: 'plan', roomId: room.id, command: { type: 'object/remove', id: ex.id } });
  s.dispatch({ type: 'review', roomId: room.id, command: { type: 'note/resolve', id: room.plan.notes[0]!.id, resolved: true, at: AT } });
  s.dispatch({ type: 'review', roomId: room.id, command: { type: 'review/acknowledge', reservedRangeId: range.id, reason: 'Customer will not share figures', by: 'Somchai', at: AT } });
  s.dispatch({ type: 'review', roomId: room.id, command: { type: 'review/submit', designedBy: 'Ploy', at: AT } });
  const problem = s.dispatch({ type: 'review', roomId: room.id, command: { type: 'review/approve', reviewer: 'Nok', at: AT } });
  if (problem) throw new Error(problem.message);
}

beforeEach(() => {
  resetWorkspaceStore();
  const seeded = withSample(createWorkspace(), AT);
  if (!seeded.ok) throw new Error(seeded.error.message);
  const ws: Workspace = seeded.value;
  useWorkspaceStore.getState().replace(ws);
  useWorkspaceStore.getState().setLoad({ kind: 'ready' });
  [server, mdf] = ws.projects[0]!.sites[0]!.rooms.map((r) => r.id) as [string, string];
});

const open = (roomId: string) => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [`/rooms/${roomId}/install-sheet`] })} />);

it('AC17: prints an Approved revision with a title block on every page, plan, elevations, slot maps and BOM', () => {
  approveMdf();
  const { container } = open(mdf);
  const pages = container.querySelectorAll('.sheet-page');
  expect(pages.length).toBeGreaterThanOrEqual(4);
  for (const page of pages) {
    expect(page.querySelector('.sheet-title')).not.toBeNull();
    expect(page).toHaveTextContent('R01 APPROVED');
    expect(page).toHaveTextContent('Designed by Ploy (unverified)');
    expect(page).toHaveTextContent('Approved by Nok (unverified)');
  }
  expect(screen.getByRole('img', { name: 'MDF-1 plan' })).toBeInTheDocument();
  for (const name of ['RK-01', 'RK-02', 'RK-C1']) expect(screen.getByRole('group', { name: `${name} front elevation, 42U` })).toBeInTheDocument();
  const slotTable = screen.getByRole('table', { name: 'Slot maps' });
  expect(within(slotTable).getByRole('rowgroup', { name: 'CH-01 slot map' }).querySelectorAll('tr')).toHaveLength(6);
  // Long tables carry the title block in <thead> so it repeats on every printed page.
  expect(slotTable.querySelector('thead .sheet-title')).not.toBeNull();
  const bom = screen.getByRole('table', { name: 'Bill of materials' });
  expect(within(bom).getByText('NODE-05')).toBeInTheDocument();
  expect(bom.querySelector('thead .sheet-title')).not.toBeNull();
  expect(within(bom).getByRole('columnheader', { name: 'Category' })).toBeInTheDocument();
  expect(within(bom).getByText(/Customer will not share figures/)).toHaveTextContent('Somchai (unverified)');
  expect(container.querySelectorAll('input, textarea, select, [tabindex]').length).toBe(0);
  for (const page of pages) expect(within(page as HTMLElement).queryAllByRole('button')).toEqual([]);
});

it('gives each rack taller than 44U a page of its own', () => {
  const s = useWorkspaceStore.getState();
  const content = currentRevision(s.workspace.projects[0]!.sites[0]!.rooms[0]!.plan).content;
  s.dispatch({ type: 'review', roomId: server, command: { type: 'review/new-draft', at: AT } });
  for (const r of content.objects) s.dispatch({ type: 'plan', roomId: server, command: { type: 'object/update', id: r.id, patch: { capacityU: 60 } } });
  s.dispatch({ type: 'review', roomId: server, command: { type: 'review/submit', designedBy: 'Ploy', at: AT } });
  const problem = s.dispatch({ type: 'review', roomId: server, command: { type: 'review/approve', reviewer: 'Nok', at: AT } });
  if (problem) throw new Error(problem.message);
  const { container } = open(server);
  const elevationPages = [...container.querySelectorAll('.sheet-page')].filter((p) => p.querySelector('.rack-elev'));
  expect(elevationPages.map((p) => p.querySelectorAll('.rack-elev').length)).toEqual([1, 1]);
});

it('stamps the print date when printing, not when the page was opened', () => {
  const { container } = open(server);
  const printed = () => container.querySelector('.sheet-title__printed')!.textContent;
  const before = printed();
  vi.setSystemTime(new Date('2027-01-05T10:00:00.000Z'));
  act(() => {
    window.dispatchEvent(new Event('beforeprint'));
  });
  expect(printed()).not.toBe(before);
  vi.useRealTimers();
});

it('keeps printing the Approved revision after a new draft starts', () => {
  useWorkspaceStore.getState().dispatch({ type: 'review', roomId: server, command: { type: 'review/new-draft', at: AT } });
  const { container } = open(server);
  expect(container.querySelector('.sheet-page')).toHaveTextContent('R01 APPROVED');
  expect(screen.getByText(/A newer Draft \(R02\) exists/)).toBeInTheDocument();
});

it('AC17: is not available for a room without an Approved revision', () => {
  open(mdf);
  expect(screen.getByRole('heading', { name: 'No Approved revision yet' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open review' })).toHaveAttribute('href', `/rooms/${mdf}/review`);
});
