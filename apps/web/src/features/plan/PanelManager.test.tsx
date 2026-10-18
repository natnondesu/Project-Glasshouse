import { createObject, defaultPanel, emptyContent, seedTemplates, type PanelConfig, type PlanContent, type Rack, type RoomObject, type SimpleObject } from '@glasshouse/domain';
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
const panelWith = (patch: Partial<PanelConfig> = {}, ways?: number): RoomObject => {
  const base = defaultPanel();
  const config: PanelConfig = { ...base, ...(ways ? { ways: Array.from({ length: ways }, () => ({ ratingA: 16, label: '' })) } : {}), ...patch };
  return { ...(createObject('mcb', { x: 0, y: 1 }, []) as SimpleObject), id: 'm', name: 'MCB-01', panel: config };
};
const panel = panelWith();
const content = (p: RoomObject = panel): PlanContent => ({
  ...emptyContent(),
  objects: [p, rack],
  feeds: [
    { id: 'fa', targetId: 'rk', sourceId: 'm', label: 'Feed A', way: 1 },
    { id: 'fb', targetId: 'rk', sourceId: 'm', label: 'Feed B' },
  ],
});
const show = (p: RoomObject = panel, commit: (c: unknown) => string | null = () => null) => render(<PanelManager panel={p} content={content(p)} commit={commit} onClose={() => {}} />);
const tile = (name: RegExp) => screen.getByRole('button', { name });
const cell = (el: HTMLElement) => ({ column: el.style.gridColumnStart, row: el.style.gridRowStart });

beforeEach(() => localStorage.clear());

it('draws every way as a breaker tile named with its rating, phase and feed', () => {
  show();
  const face = screen.getByRole('group', { name: 'MCB-01 breakers' });
  expect(within(face).getAllByRole('button')).toHaveLength(12);
  expect(tile(/^Way 1,/)).toHaveAccessibleName('Way 1, 16 A, L1, Feed A of RK-01');
  expect(tile(/^Way 2,/)).toHaveAccessibleName('Way 2, 16 A, L2, spare');
});

it('includes a way label in the tile name', () => {
  const p = panelWith({ ways: [{ ratingA: 32, label: 'Row 1' }, { ratingA: 16, label: '' }] });
  show(p);
  expect(tile(/^Way 1,/)).toHaveAccessibleName('Way 1, 32 A, L1, Feed A of RK-01, Row 1');
});

it('lays a small panel out in one row, left to right', () => {
  show();
  expect(cell(tile(/^Way 1,/))).toEqual({ column: '1', row: '1' });
  expect(cell(tile(/^Way 12,/))).toEqual({ column: '12', row: '1' });
});

it('lays a 14-way panel out in two columns, odd left and even right, then sequential', () => {
  const { unmount } = show(panelWith({}, 14));
  expect(cell(tile(/^Way 1,/))).toEqual({ column: '1', row: '1' });
  expect(cell(tile(/^Way 2,/))).toEqual({ column: '2', row: '1' });
  expect(cell(tile(/^Way 14,/))).toEqual({ column: '2', row: '7' });
  unmount();
  show(panelWith({ numbering: 'sequential' }, 14));
  expect(cell(tile(/^Way 2,/))).toEqual({ column: '1', row: '2' });
  expect(cell(tile(/^Way 8,/))).toEqual({ column: '2', row: '1' });
});

it('lays a column panel out down one column', () => {
  show(panelWith({ layout: 'column' }));
  expect(cell(tile(/^Way 3,/))).toEqual({ column: '1', row: '3' });
});

it('shows the main breaker above the ways when one is set', () => {
  show(panelWith({ mainRatingA: 100 }));
  const main = screen.getByRole('img', { name: 'Main breaker, 100 A' });
  const face = screen.getByRole('group', { name: 'MCB-01 breakers' });
  expect(face.firstElementChild).toContainElement(main);
  expect(within(face).getAllByRole('button')).toHaveLength(12);
});

it('keeps a 48-way panel in a scroll area of its own', () => {
  show(panelWith({}, 48));
  expect(screen.getAllByRole('button', { name: /^Way \d+,/ })).toHaveLength(48);
  expect(screen.getByRole('group', { name: 'MCB-01 breakers' }).closest('.panel-mgr__scroll')).not.toBeNull();
});

it('edits the picked way: feed, rating and label', async () => {
  const user = userEvent.setup();
  const commit = vi.fn<(command: unknown) => string | null>(() => null);
  show(panel, commit);
  expect(screen.getByLabelText('Way 1 feed')).toHaveValue('fa');
  await user.click(tile(/^Way 2,/));
  await user.selectOptions(screen.getByLabelText('Way 2 feed'), 'fb');
  expect(commit).toHaveBeenLastCalledWith({ type: 'feed/update', id: 'fb', patch: { way: 2 } });
  await user.click(tile(/^Way 1,/));
  await user.selectOptions(screen.getByLabelText('Way 1 feed'), '');
  expect(commit).toHaveBeenLastCalledWith({ type: 'feed/update', id: 'fa', patch: { way: null } });
  await user.click(tile(/^Way 3,/));
  await user.selectOptions(screen.getByLabelText('Way 3 rating'), '32');
  expect(commit).toHaveBeenLastCalledWith({ type: 'panel/way', id: 'm', way: 3, patch: { ratingA: 32 } });
  await user.type(screen.getByLabelText('Way 3 label'), 'Row 1{Enter}');
  expect(commit).toHaveBeenLastCalledWith({ type: 'panel/way', id: 'm', way: 3, patch: { label: 'Row 1' } });
  expect(screen.getByRole('button', { name: /^Way 3,/ })).toHaveAttribute('aria-pressed', 'true');
});

it('shows the load against the rating for a way with a feed', () => {
  show();
  expect(screen.getByRole('region', { name: 'Way 1 · L1' })).toHaveTextContent('3.4 / 16 A');
});

it('moves between tiles with the arrow keys, following the arrangement', async () => {
  const user = userEvent.setup();
  show(panelWith({}, 14));
  tile(/^Way 1,/).focus();
  await user.keyboard('{ArrowRight}');
  expect(tile(/^Way 2,/)).toHaveFocus();
  await user.keyboard('{ArrowDown}');
  expect(tile(/^Way 4,/)).toHaveFocus();
  await user.keyboard('{ArrowLeft}{ArrowUp}');
  expect(tile(/^Way 1,/)).toHaveFocus();
});

it('sets phase, way count, layout, numbering and the main breaker', async () => {
  const user = userEvent.setup();
  const commit = vi.fn<(command: unknown) => string | null>(() => null);
  show(panelWith({ layout: 'two_column' }), commit);
  await user.click(screen.getByRole('button', { name: 'Single-phase' }));
  expect(commit).toHaveBeenLastCalledWith({ type: 'panel/configure', id: 'm', patch: { phase: 'single' } });
  await user.selectOptions(screen.getByLabelText('Ways'), '18');
  expect(commit).toHaveBeenLastCalledWith({ type: 'panel/configure', id: 'm', patch: { wayCount: 18 } });
  await user.selectOptions(screen.getByLabelText('Layout'), 'One column');
  expect(commit).toHaveBeenLastCalledWith({ type: 'panel/configure', id: 'm', patch: { layout: 'column' } });
  await user.selectOptions(screen.getByLabelText('Numbering'), 'Down left, then right');
  expect(commit).toHaveBeenLastCalledWith({ type: 'panel/configure', id: 'm', patch: { numbering: 'sequential' } });
  await user.type(screen.getByLabelText('Main breaker'), '100{Enter}');
  expect(commit).toHaveBeenLastCalledWith({ type: 'panel/configure', id: 'm', patch: { mainRatingA: 100 } });
});

it('clears the main breaker when the field is emptied', async () => {
  const user = userEvent.setup();
  const commit = vi.fn<(command: unknown) => string | null>(() => null);
  show(panelWith({ mainRatingA: 63 }), commit);
  await user.clear(screen.getByLabelText('Main breaker'));
  await user.tab();
  expect(commit).toHaveBeenLastCalledWith({ type: 'panel/configure', id: 'm', patch: { mainRatingA: null } });
});

it('offers numbering only for two columns', () => {
  const { unmount } = show(panelWith({ layout: 'row' }));
  expect(screen.queryByLabelText('Numbering')).toBeNull();
  unmount();
  show(panelWith({ layout: 'two_column' }));
  expect(screen.getByLabelText('Numbering')).toBeInTheDocument();
});

it('reads the derived layout in the Layout select until one is picked', () => {
  const { unmount } = show();
  expect(screen.getByLabelText('Layout')).toHaveValue('row');
  unmount();
  show(panelWith({}, 14));
  expect(screen.getByLabelText('Layout')).toHaveValue('two_column');
});

it('has an In use switch, on by default, that marks the panel in use or not', async () => {
  const user = userEvent.setup();
  const commit = vi.fn<(command: unknown) => string | null>(() => null);
  const { unmount } = show(panel, commit);
  const sw = screen.getByRole('switch', { name: 'In use' });
  expect(sw).toBeChecked();
  await user.click(sw);
  expect(commit).toHaveBeenLastCalledWith({ type: 'panel/configure', id: 'm', patch: { inUse: false } });
  unmount();
  show(panelWith({ inUse: false }), commit);
  expect(screen.getByRole('switch', { name: 'In use' })).not.toBeChecked();
  await user.click(screen.getByRole('switch', { name: 'In use' }));
  expect(commit).toHaveBeenLastCalledWith({ type: 'panel/configure', id: 'm', patch: { inUse: true } });
});

it('warns, listing the feeds, when a panel not in use still has feeds', () => {
  show(panelWith({ inUse: false }));
  expect(screen.getByRole('status')).toHaveTextContent('2 feeds are still wired to this panel: Feed A of RK-01, Feed B of RK-01');
});

it('has no warning for a panel in use, or a panel not in use with no feeds', () => {
  const { unmount } = show();
  expect(screen.queryByRole('status')).toBeNull();
  unmount();
  const p = panelWith({ inUse: false });
  render(<PanelManager panel={p} content={{ ...content(p), feeds: [] }} commit={() => null} onClose={() => {}} />);
  expect(screen.queryByRole('status')).toBeNull();
});

it('draws a panel not in use greyed', () => {
  show(panelWith({ inUse: false }));
  expect(screen.getByRole('group', { name: 'MCB-01 breakers' })).toHaveClass('is-off');
});

it('says how many feeds have no way yet', () => {
  show();
  expect(screen.getByText('1 feed from this panel has no way yet.')).toBeInTheDocument();
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

it('keeps one breaker tile in the tab order, following the picked way', async () => {
  const user = userEvent.setup();
  show();
  const tabbable = () => screen.getAllByRole('button', { name: /^Way \d+,/ }).filter((b) => b.tabIndex === 0).map((b) => b.getAttribute('data-way'));
  expect(tabbable()).toEqual(['1']);
  await user.click(tile(/^Way 5,/));
  expect(tabbable()).toEqual(['5']);
});

it('keeps tiles selectable on a frozen revision, and locks only the edit controls', async () => {
  const user = userEvent.setup();
  const commit = vi.fn<(command: unknown) => string | null>(() => null);
  render(<PanelManager panel={panel} content={content()} commit={commit} onClose={() => {}} readOnly />);
  await user.click(tile(/^Way 3,/));
  expect(tile(/^Way 3,/)).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('heading', { name: 'Way 3 · L3' })).toBeInTheDocument();
  for (const control of [screen.getByRole('switch', { name: 'In use' }), screen.getByLabelText('Ways'), screen.getByLabelText('Way 3 rating'), screen.getByLabelText('Way 3 label'), screen.getByLabelText('Way 3 feed')]) {
    expect(control).toBeDisabled();
  }
  expect(screen.getByRole('button', { name: 'Close MCB-01 ways' })).toBeEnabled();
});

it('disables the way feed picker on a panel not in use and says why', () => {
  show(panelWith({ inUse: false }));
  expect(screen.getByLabelText('Way 1 feed')).toBeDisabled();
  expect(screen.getByText('Mark this panel in use to wire feeds to its ways.')).toBeInTheDocument();
  expect(screen.getByLabelText('Way 1 rating')).toBeEnabled();
});
