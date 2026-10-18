import { createObject, emptyContent, type PlanContent, type Rack, type RoomObject } from '@glasshouse/domain';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { useViewport } from '../../viewport/useViewport';
import { Inspector } from './Inspector';
import { PlanCanvas } from './PlanCanvas';

const mcb = (id: string, name: string, y: number): RoomObject => ({ ...createObject('mcb', { x: 0, y }, []), id, name, angle: 90 });
const rack: Rack = { ...(createObject('rack', { x: 2, y: 1.5 }, []) as Rack), id: 'rk', name: 'RK-01' };

function content(withFeeds = true): PlanContent {
  return {
    ...emptyContent(),
    objects: [mcb('m1', 'MCB-01', 1), mcb('m2', 'MCB-02', 2.5), rack],
    feeds: withFeeds ? [{ id: 'f1', targetId: 'rk', sourceId: 'm1', label: 'Feed A' }, { id: 'f2', targetId: 'rk', sourceId: 'm2', label: 'Feed B' }] : [],
  };
}

function Canvas() {
  const c = content();
  const viewport = useViewport({ w: c.survey.width, d: c.survey.length });
  return <PlanCanvas content={c} issues={[]} selectedId={null} viewport={viewport} preview={null} cursor="default" onFocusObject={() => {}} />;
}

it('draws each feed from its panel to the rack, tagged with its letter', () => {
  const { container } = render(<Canvas />);
  expect(container.querySelectorAll('.feed__run')).toHaveLength(2);
  expect([...container.querySelectorAll('.feed__tag')].map((t) => t.textContent)).toEqual(['A', 'B']);
});

it('adds, re-sources and removes a rack’s power feeds from its inspector', async () => {
  const user = userEvent.setup();
  const commit = vi.fn<(command: unknown, coalesceKey?: string) => string | null>(() => null);
  const c = content();
  render(<Inspector content={c} selected={rack} commit={commit} onDeleted={() => {}} />);
  const feeds = screen.getByRole('group', { name: 'Power feeds' });
  expect(within(feeds).getByLabelText('Feed A source')).toHaveValue('m1');
  await user.selectOptions(within(feeds).getByLabelText('Feed A source'), 'm2');
  expect(commit).toHaveBeenLastCalledWith({ type: 'feed/update', id: 'f1', patch: { sourceId: 'm2' } });
  await user.click(within(feeds).getByRole('button', { name: 'Remove Feed B' }));
  expect(commit).toHaveBeenLastCalledWith({ type: 'feed/remove', id: 'f2' });
  await user.click(within(feeds).getByRole('button', { name: 'Add power feed' }));
  expect(commit.mock.lastCall?.[0]).toMatchObject({ type: 'feed/add', feed: { targetId: 'rk', sourceId: 'm1', label: 'Feed C' } });
});

it('asks for a power source before a feed can be added, and lists what a panel feeds', () => {
  const noPanels: PlanContent = { ...emptyContent(), objects: [rack] };
  const { unmount } = render(<Inspector content={noPanels} selected={rack} commit={() => null} onDeleted={() => {}} />);
  expect(screen.getByRole('button', { name: 'Add power feed' })).toBeDisabled();
  expect(screen.getByText(/Place a power source/)).toBeInTheDocument();
  unmount();
  const c = content();
  render(<Inspector content={c} selected={c.objects[0]!} commit={() => null} onDeleted={() => {}} />);
  expect(screen.getByRole('list', { name: 'Feeds out of MCB-01' })).toHaveTextContent('RK-01 · Feed A');
});

it('picks the MCB way for a feed from the rack, and opens the panel manager from the panel', async () => {
  const user = userEvent.setup();
  const commit = vi.fn<(command: unknown, coalesceKey?: string) => string | null>(() => null);
  const c: PlanContent = { ...content(), feeds: [{ id: 'f1', targetId: 'rk', sourceId: 'm1', label: 'Feed A', way: 2 }] };
  const { unmount } = render(<Inspector content={c} selected={rack} commit={commit} onDeleted={() => {}} />);
  expect(screen.getByLabelText('Feed A way')).toHaveValue('2');
  await user.selectOptions(screen.getByLabelText('Feed A way'), '5');
  expect(commit).toHaveBeenLastCalledWith({ type: 'feed/update', id: 'f1', patch: { way: 5 } });
  unmount();
  const onManagePanel = vi.fn();
  render(<Inspector content={c} selected={c.objects[0]!} commit={commit} onDeleted={() => {}} onManagePanel={onManagePanel} />);
  await user.click(screen.getByRole('button', { name: 'Manage ways' }));
  expect(onManagePanel).toHaveBeenCalledWith('m1');
});

it('feeds a power source from another one, and lists what each source powers', async () => {
  const user = userEvent.setup();
  const commit = vi.fn<(command: unknown, coalesceKey?: string) => string | null>(() => null);
  const ups: RoomObject = { ...createObject('ups', { x: 3, y: 3 }, []), id: 'u1', name: 'UPS-01' };
  const c: PlanContent = { ...content(false), objects: [...content(false).objects, ups], feeds: [{ id: 'f1', targetId: 'rk', sourceId: 'u1', label: 'Feed A' }] };
  render(<Inspector content={c} selected={ups} commit={commit} onDeleted={() => {}} />);
  const input = screen.getByRole('group', { name: 'Power input' });
  expect(within(input).getByLabelText('Fed from')).toHaveValue('');
  // A source can't feed itself, so UPS-01 isn't offered.
  expect(within(within(input).getByLabelText('Fed from')).queryByRole('option', { name: 'UPS-01' })).toBeNull();
  await user.selectOptions(within(input).getByLabelText('Fed from'), 'm1');
  expect(commit).toHaveBeenLastCalledWith({ type: 'feed/add', feed: expect.objectContaining({ targetId: 'u1', sourceId: 'm1', label: 'Feed A' }) });
  expect(screen.getByRole('list', { name: 'Feeds out of UPS-01' })).toHaveTextContent('RK-01 · Feed A');
});

it('re-sources or disconnects an existing input', async () => {
  const user = userEvent.setup();
  const commit = vi.fn<(command: unknown, coalesceKey?: string) => string | null>(() => null);
  const ups: RoomObject = { ...createObject('ups', { x: 3, y: 3 }, []), id: 'u1', name: 'UPS-01' };
  const c: PlanContent = { ...content(false), objects: [...content(false).objects, ups], feeds: [{ id: 'in', targetId: 'u1', sourceId: 'm1', label: 'Feed A' }] };
  render(<Inspector content={c} selected={ups} commit={commit} onDeleted={() => {}} />);
  const input = screen.getByRole('group', { name: 'Power input' });
  expect(within(input).getByLabelText('Fed from')).toHaveValue('m1');
  await user.selectOptions(within(input).getByLabelText('Fed from'), 'm2');
  expect(commit).toHaveBeenLastCalledWith({ type: 'feed/update', id: 'in', patch: { sourceId: 'm2' } });
  await user.selectOptions(within(input).getByLabelText('Fed from'), '');
  expect(commit).toHaveBeenLastCalledWith({ type: 'feed/remove', id: 'in' });
});

const unused = (c: PlanContent, id: string): PlanContent => ({
  ...c,
  objects: c.objects.map((o) => (o.id === id && o.type === 'mcb' ? { ...o, panel: { ...(o.panel ?? { phase: 'three' as const, ways: [] }), inUse: false } } : o)),
});

it('shows a panel that is not in use disabled in the feed source picker, and never adds a feed to it', async () => {
  const user = userEvent.setup();
  const commit = vi.fn<(command: unknown, coalesceKey?: string) => string | null>(() => null);
  const c = unused(content(), 'm1');
  render(<Inspector content={c} selected={rack} commit={commit} onDeleted={() => {}} />);
  const feeds = screen.getByRole('group', { name: 'Power feeds' });
  expect(within(within(feeds).getByLabelText('Feed B source')).getByRole('option', { name: 'MCB-01 (not in use)' })).toBeDisabled();
  await user.click(within(feeds).getByRole('button', { name: 'Add power feed' }));
  expect(commit.mock.lastCall?.[0]).toMatchObject({ type: 'feed/add', feed: { sourceId: 'm2' } });
});

it('marks a panel not in use on a feed already wired to it', () => {
  const c = unused(content(), 'm2');
  render(<Inspector content={c} selected={rack} commit={() => null} onDeleted={() => {}} />);
  const select = within(screen.getByRole('group', { name: 'Power feeds' })).getByLabelText('Feed B source');
  expect(within(select).getByRole('option', { name: 'MCB-02 (not in use)' })).toBeDisabled();
  expect(within(select).getByRole('option', { name: 'MCB-01' })).toBeEnabled();
  expect(select).toHaveValue('m2');
});

it('disables adding a feed when every panel is not in use', () => {
  const c = unused(unused(content(false), 'm1'), 'm2');
  render(<Inspector content={c} selected={rack} commit={() => null} onDeleted={() => {}} />);
  expect(screen.getByRole('button', { name: 'Add power feed' })).toBeDisabled();
});

it('says a panel is not in use in its inspector', () => {
  const c = unused(content(false), 'm1');
  render(<Inspector content={c} selected={c.objects.find((o) => o.id === 'm1')!} commit={() => null} onDeleted={() => {}} />);
  expect(screen.getByText('Not in use')).toBeInTheDocument();
});

it('offers an input choice of a panel not in use disabled on a UPS', () => {
  const ups: RoomObject = { ...createObject('ups', { x: 4, y: 3 }, []), id: 'u', name: 'UPS-01' };
  const c = unused({ ...content(false), objects: [...content(false).objects, ups] }, 'm1');
  render(<Inspector content={c} selected={ups} commit={() => null} onDeleted={() => {}} />);
  const input = screen.getByRole('group', { name: 'Power input' }).querySelector('select')!;
  expect(within(input).getByRole('option', { name: 'MCB-01 (not in use)' })).toBeDisabled();
  expect(within(input).getByRole('option', { name: 'MCB-02' })).toBeEnabled();
});

it('disables the way picker of a feed wired to a panel not in use, and says why', () => {
  const base = content();
  const ways = Array.from({ length: 12 }, () => ({ ratingA: 16, label: '' }));
  const c: PlanContent = {
    ...base,
    objects: base.objects.map((o) => (o.id === 'm1' && o.type === 'mcb' ? { ...o, panel: { phase: 'three' as const, ways, inUse: false } } : o)),
    feeds: [{ id: 'f1', targetId: 'rk', sourceId: 'm1', label: 'Feed A', way: 2 }],
  };
  render(<Inspector content={c} selected={rack} commit={() => null} onDeleted={() => {}} />);
  const way = screen.getByLabelText('Feed A way');
  expect(way).toBeDisabled();
  expect(way).toHaveAttribute('title', 'Mark this panel in use to wire feeds to its ways.');
  expect(way).toHaveValue('2');
});
