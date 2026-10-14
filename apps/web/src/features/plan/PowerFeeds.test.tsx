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
    feeds: withFeeds ? [{ id: 'f1', rackId: 'rk', sourceId: 'm1', label: 'Feed A' }, { id: 'f2', rackId: 'rk', sourceId: 'm2', label: 'Feed B' }] : [],
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
  expect(commit.mock.lastCall?.[0]).toMatchObject({ type: 'feed/add', feed: { rackId: 'rk', sourceId: 'm1', label: 'Feed C' } });
});

it('asks for an MCB panel before a feed can be added, and lists what a panel feeds', () => {
  const noPanels: PlanContent = { ...emptyContent(), objects: [rack] };
  const { unmount } = render(<Inspector content={noPanels} selected={rack} commit={() => null} onDeleted={() => {}} />);
  expect(screen.getByRole('button', { name: 'Add power feed' })).toBeDisabled();
  expect(screen.getByText('Place an MCB panel on the plan to connect this rack.')).toBeInTheDocument();
  unmount();
  const c = content();
  render(<Inspector content={c} selected={c.objects[0]!} commit={() => null} onDeleted={() => {}} />);
  expect(screen.getByRole('list', { name: 'Racks fed from MCB-01' })).toHaveTextContent('RK-01 · Feed A');
});
