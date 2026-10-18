import { createObject, createWorkspace, currentRevision, withSample, type PlanCommand, type Rack, type Workspace } from '@glasshouse/domain';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

it('puts the small mono-ink mark, 24 px or less, beside the title on every page so it prints in black and white', () => {
  approveMdf();
  const { container } = open(mdf);
  const marks = container.querySelectorAll('.sheet-title__mark');
  expect(marks.length).toBeGreaterThanOrEqual(4);
  for (const mark of marks) {
    expect(mark).toHaveAttribute('src', '/brand/glasshouse-mark-small-mono-ink.svg');
    expect(mark).toHaveAttribute('alt', '');
    expect(Number(mark.getAttribute('height'))).toBeLessThanOrEqual(24);
  }
});

it('AC17: prints an Approved revision with a title block on every page, plan, elevations, slot maps and BOM', () => {
  approveMdf();
  const { container } = open(mdf);
  const pages = container.querySelectorAll('.sheet-page');
  expect(pages.length).toBeGreaterThanOrEqual(4);
  expect(screen.getByRole('heading', { level: 1, name: 'Install sheet: MDF-1, R01' })).toBeInTheDocument();
  expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(pages.length);
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
  // RK-01, RK-02 and the wall rack RK-03.
  expect(elevationPages.map((p) => p.querySelectorAll('.rack-elev').length)).toEqual([1, 1, 1]);
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

it('prints the short fingerprint in every title block, and none for a revision approved without one', () => {
  approveMdf();
  const hashed = (hash: string | undefined) => {
    const ws = useWorkspaceStore.getState().workspace;
    useWorkspaceStore.getState().replace({
      ...ws,
      projects: ws.projects.map((p) => ({
        ...p,
        sites: p.sites.map((s) => ({
          ...s,
          rooms: s.rooms.map((r) => (r.id !== mdf ? r : { ...r, plan: { ...r.plan, revisions: r.plan.revisions.map(({ approvedHash: _dropped, ...rev }) => (hash ? { ...rev, approvedHash: hash } : rev)) } })),
        })),
      })),
    });
  };
  hashed('ab'.repeat(32));
  const first = open(mdf);
  const pages = first.container.querySelectorAll('.sheet-page');
  for (const page of pages) expect(page).toHaveTextContent('Fingerprintabababababab');
  first.unmount();
  hashed(undefined);
  const second = open(mdf);
  expect(second.container).not.toHaveTextContent('Fingerprint');
});

it('keeps printing the Approved revision after a new draft starts', () => {
  useWorkspaceStore.getState().dispatch({ type: 'review', roomId: server, command: { type: 'review/new-draft', at: AT } });
  const { container } = open(server);
  expect(container.querySelector('.sheet-page')).toHaveTextContent('R01 APPROVED');
  expect(screen.getByText(/R02 \(draft\) is newer/)).toBeInTheDocument();
});

it('AC17: is not available for a room without an Approved revision', () => {
  open(mdf);
  expect(screen.getByRole('heading', { name: 'No Approved revision yet' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open review' })).toHaveAttribute('href', `/rooms/${mdf}/review`);
});

it('prints an older approved revision chosen from the picker', async () => {
  const s = useWorkspaceStore.getState();
  s.dispatch({ type: 'review', roomId: server, command: { type: 'review/new-draft', at: AT } });
  s.dispatch({ type: 'review', roomId: server, command: { type: 'review/submit', designedBy: 'Ploy', at: AT } });
  const problem = s.dispatch({ type: 'review', roomId: server, command: { type: 'review/approve', reviewer: 'Nok', at: AT } });
  if (problem) throw new Error(problem.message);
  const router = createMemoryRouter(routes, { initialEntries: [`/rooms/${server}/install-sheet`] });
  const { container } = render(<RouterProvider router={router} />);
  expect(container.querySelector('.sheet-page')).toHaveTextContent('R02 APPROVED');
  const picker = screen.getByLabelText('Approved revision');
  await userEvent.setup().selectOptions(picker, '1');
  expect(router.state.location.search).toBe('?rev=1');
  expect(container.querySelector('.sheet-page')).toHaveTextContent('R01 APPROVED');
});

it('lists which panel feeds each rack, and draws the runs on the plan', () => {
  const { container } = open(server);
  const feeds = screen.getByRole('rowgroup', { name: 'Power feeds' });
  expect(feeds).toHaveTextContent('RK-01Feed AMCB-01');
  expect(feeds).toHaveTextContent('RK-01Feed BMCB-02');
  // A UPS fed from MCB-02 carries RK-02's B feed: a chain of two runs.
  expect(feeds).toHaveTextContent('UPS-01Feed AMCB-02');
  expect(feeds).toHaveTextContent('RK-02Feed BUPS-01');
  expect(feeds).toHaveTextContent('RK-03Feed AMCB-02');
  expect(container.querySelectorAll('.sheet-plan .feed__run').length).toBe(6);
});

it('prints the cable schedule of the approved server room', () => {
  open(server);
  const table = screen.getByRole('table', { name: 'Cable schedule' });
  expect(table.querySelector('thead .sheet-title')).not.toBeNull();
  const row = within(table).getByText('C-001').closest('tr')!;
  // The bonded storage server: both ends name their LAG.
  // Seven columns, each end one cell (device over its rack), so a big room still fits A4 portrait.
  expect([...table.querySelectorAll('thead tr:last-child th')].map((th) => th.textContent)).toEqual(['Label', 'From', 'Port', 'To', 'Port', 'Cable', 'VLAN']);
  expect([...row.querySelectorAll('td')].map((td) => [...td.childNodes].map((n) => n.textContent).join(' / '))).toEqual(['C-001', 'SRV-01 / RK-01', 'eth0 (bond0)', 'ACC-01 / RK-01', 'Gi1/0/1 (Po11)', 'Cat 6', '20']);
  expect(within(table).getByText('UPL-11').closest('tr')).toHaveTextContent('Fibre OM4');
  expect(within(table).getByText('UPL-11').closest('tr')).toHaveTextContent('Trunk all · native 99');
});

describe('room fittings', () => {
  function approvedRoom(withFittings: boolean, extras: Record<string, object> = {}): string {
    const s = useWorkspaceStore.getState();
    const siteId = s.workspace.projects[0]!.sites[0]!.id;
    s.dispatch({ type: 'room/create', siteId, id: 'fit', floorAreaId: 'fa-fit', name: 'Command' });
    const server = s.workspace.catalog.find((t) => t.id === 'tpl-server-2u')!;
    s.dispatch({ type: 'plan', roomId: 'fit', command: { type: 'object/add', object: { ...(createObject('rack', { x: 4, y: 1.5 }, []) as Rack), id: 'rk', name: 'RK-01', clearance: { front: 0, rear: 0 } } } });
    s.dispatch({ type: 'plan', roomId: 'fit', command: { type: 'device/place', id: 'srv', rackId: 'rk', bottomU: 1, template: server } });
    if (withFittings) {
      const add = (object: ReturnType<typeof createObject>, id: string, name: string, extra: object = {}) => {
        const problem = s.dispatch({ type: 'plan', roomId: 'fit', command: { type: 'object/add', object: { ...object, id, name, ...extra } } });
        if (problem) throw new Error(problem.message);
      };
      add(createObject('partition', { x: 2, y: 3 }, []), 'pt', 'PT-01');
      add(createObject('wall_split_ac', { x: 1, y: 0 }, []), 'ac', 'AC-01', extras.ac);
      add(createObject('precision_ac', { x: 3, y: 0.5 }, []), 'pac', 'PAC-01', extras.pac);
      add(createObject('display_wall', { x: 1, y: 3.8 }, []), 'dw', 'DW-01', { wallBottomM: 1, ...extras.dw });
    }
    s.dispatch({ type: 'review', roomId: 'fit', command: { type: 'review/submit', designedBy: 'Ploy', at: AT } });
    const problem = s.dispatch({ type: 'review', roomId: 'fit', command: { type: 'review/approve', reviewer: 'Nok', at: AT } });
    if (problem) throw new Error(problem.message);
    return 'fit';
  }

  it('lists partitions, air conditioning and display walls with size, height, fixing and the space to keep clear, under a title block', () => {
    open(approvedRoom(true));
    const table = screen.getByRole('table', { name: 'Room fittings' });
    expect(table.querySelector('thead .sheet-title')).not.toBeNull();
    expect([...table.querySelectorAll('thead tr:last-child th')].map((th) => th.textContent)).toEqual(['Name', 'Type', 'Size (m)', 'Height (m)', 'Fixing', 'Keep clear']);
    const row = (name: string) => [...within(table).getByText(name).closest('tr')!.querySelectorAll('td')].map((td) => td.textContent);
    expect(row('PT-01')).toEqual(['PT-01', 'Partition', '2.00 × 0.10', '2.40', 'On the floor', '']);
    expect(row('AC-01')).toEqual(['AC-01', 'Wall split AC', '0.90 × 0.25', '0.30', 'On the wall, bottom at 2.20 m', 'Airflow 1.00 m']);
    expect(row('PAC-01')).toEqual(['PAC-01', 'Precision AC', '0.80 × 0.80', '1.95', 'On the floor', 'Service 1.00 m']);
    expect(row('DW-01')).toEqual(['DW-01', 'Display wall', '3.00 × 0.15', '1.70', 'On the wall, bottom at 1.00 m', 'Viewing 1.50 m']);
  });

  it('marks a keep-clear depth that was changed from the default, and says None when it is 0', () => {
    open(approvedRoom(true, { pac: { keepClearM: 0.6 }, ac: { keepClearM: 0 } }));
    const table = screen.getByRole('table', { name: 'Room fittings' });
    const clear = (name: string) => within(table).getByText(name).closest('tr')!.querySelectorAll('td')[5]!.textContent;
    expect(clear('PAC-01')).toBe('Service 0.60 m (set)');
    expect(clear('AC-01')).toBe('None (set)');
    expect(clear('DW-01')).toBe('Viewing 1.50 m');
  });

  it('reads a depth equal to the default plainly, even when it was typed in', () => {
    open(approvedRoom(true, { pac: { keepClearM: 1 }, dw: { keepClearM: 1.5 } }));
    const table = screen.getByRole('table', { name: 'Room fittings' });
    const clear = (name: string) => within(table).getByText(name).closest('tr')!.querySelectorAll('td')[5]!.textContent;
    expect(clear('PAC-01')).toBe('Service 1.00 m');
    expect(clear('DW-01')).toBe('Viewing 1.50 m');
  });

  it('prints no fittings page for a room without any', () => {
    open(approvedRoom(false));
    expect(screen.queryByRole('table', { name: 'Room fittings' })).toBeNull();
  });
});
