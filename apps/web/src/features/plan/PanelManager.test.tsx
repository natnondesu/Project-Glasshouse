import { createObject, emptyContent, seedTemplates, type PlanContent, type Rack, type RoomObject } from '@glasshouse/domain';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { PanelManager } from './PanelManager';

const server = seedTemplates().find((t) => t.id === 'tpl-server-4u')!;
const rack: Rack = {
  ...(createObject('rack', { x: 2, y: 1.5 }, []) as Rack),
  id: 'rk',
  name: 'RK-01',
  devices: [{ kind: 'device', id: 's', templateId: server.id, templateVersion: server.version, name: 'SRV-01', category: 'server', bottomU: 1, heightU: 4, depthMm: 800, demand: { kind: 'known', watts: 780 }, config: '', notes: '' }],
};
const panel: RoomObject = { ...createObject('mcb', { x: 0, y: 1 }, []), id: 'm', name: 'MCB-01' };
const content = (): PlanContent => ({
  ...emptyContent(),
  objects: [panel, rack],
  feeds: [
    { id: 'fa', targetId: 'rk', sourceId: 'm', label: 'Feed A', way: 1 },
    { id: 'fb', targetId: 'rk', sourceId: 'm', label: 'Feed B' },
  ],
});

beforeEach(() => localStorage.clear());

it('lists every way with its phase, rating and the feed on it, with load against the rating', () => {
  render(<PanelManager panel={panel} content={content()} commit={() => null} onClose={() => {}} />);
  const dialog = screen.getByRole('dialog', { name: 'MCB-01 ways' });
  const rows = within(dialog).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(12);
  expect(rows.slice(0, 4).map((r) => within(r).getAllByRole('cell')[1]!.textContent)).toEqual(['L1', 'L2', 'L3', 'L1']);
  expect(within(rows[0]!).getByLabelText('Way 1 feed')).toHaveValue('fa');
  expect(rows[0]).toHaveTextContent('3.4 / 16 A');
  expect(within(dialog).getByText('1 feed from this panel has no way yet.')).toBeInTheDocument();
});

it('assigns feeds to ways and sets ratings, labels, phase and way count', async () => {
  const user = userEvent.setup();
  const commit = vi.fn<(command: unknown, coalesceKey?: string) => string | null>(() => null);
  render(<PanelManager panel={panel} content={content()} commit={commit} onClose={() => {}} />);
  await user.selectOptions(screen.getByLabelText('Way 2 feed'), 'fb');
  expect(commit).toHaveBeenLastCalledWith({ type: 'feed/update', id: 'fb', patch: { way: 2 } });
  await user.selectOptions(screen.getByLabelText('Way 1 feed'), '');
  expect(commit).toHaveBeenLastCalledWith({ type: 'feed/update', id: 'fa', patch: { way: null } });
  await user.selectOptions(screen.getByLabelText('Way 3 rating'), '32');
  expect(commit).toHaveBeenLastCalledWith({ type: 'panel/way', id: 'm', way: 3, patch: { ratingA: 32 } });
  await user.type(screen.getByLabelText('Way 3 label'), 'Row 1{Enter}');
  expect(commit).toHaveBeenLastCalledWith({ type: 'panel/way', id: 'm', way: 3, patch: { label: 'Row 1' } });
  await user.click(screen.getByRole('button', { name: 'Single-phase' }));
  expect(commit).toHaveBeenLastCalledWith({ type: 'panel/configure', id: 'm', patch: { phase: 'single' } });
  await user.selectOptions(screen.getByLabelText('Ways'), '18');
  expect(commit).toHaveBeenLastCalledWith({ type: 'panel/configure', id: 'm', patch: { wayCount: 18 } });
});

it('shows a rejected change and closes', async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(<PanelManager panel={panel} content={content()} commit={() => 'Way 10 has Feed A of RK-01. Move it before removing ways.'} onClose={onClose} />);
  await user.selectOptions(screen.getByLabelText('Ways'), '6');
  expect(screen.getByRole('alert')).toHaveTextContent('Move it before removing ways.');
  await user.click(screen.getByRole('button', { name: 'Close MCB-01 ways' }));
  expect(onClose).toHaveBeenCalled();
});
