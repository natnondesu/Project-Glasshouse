import { known, seedTemplates, unknownDemand, type Chassis } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { SlotMap } from './SlotMap';

const base = { templateId: 'tpl-node', templateVersion: 1, config: '', notes: '' };
const chassis: Chassis = {
  ...base,
  templateId: 'tpl-chassis-6u',
  id: 'ch',
  name: 'CH-01',
  demand: known(20),
  kind: 'chassis',
  bottomU: 5,
  heightU: 6,
  depthMm: 780,
  slotCount: 5,
  slotsPerRow: 5,
  nodes: [
    { ...base, id: 'n1', name: 'NODE-01', demand: known(150), slot: 1 },
    { ...base, id: 'n2', name: 'NODE-02', demand: unknownDemand(), slot: 2 },
  ],
};

it('shows filled and empty slots with the assembly total', () => {
  render(<SlotMap chassis={chassis} catalog={seedTemplates()} commit={() => null} onSelect={() => {}} />);
  expect(screen.getByText('2 of 5 filled')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Slot 2: NODE-02' })).toHaveTextContent('? W');
  expect(screen.getAllByRole('button', { name: /^Add node to slot/ })).toHaveLength(3);
  expect(screen.getByText('170 W + 1 unknown')).toBeInTheDocument();
});

it('inserts into an empty slot and selects a filled one', async () => {
  const user = userEvent.setup();
  const commit = vi.fn<(command: unknown) => string | null>(() => null);
  const onSelect = vi.fn();
  render(<SlotMap chassis={chassis} catalog={seedTemplates()} commit={commit} onSelect={onSelect} />);
  await user.click(screen.getByRole('button', { name: 'Add node to slot 3' }));
  expect(commit.mock.lastCall?.[0]).toMatchObject({ type: 'node/insert', chassisId: 'ch', slot: 3, template: { id: 'tpl-node' } });
  expect(onSelect).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Slot 1: NODE-01' }));
  expect(onSelect).toHaveBeenCalledWith('n1');
});

it('explains when the catalog has no node template', async () => {
  const user = userEvent.setup();
  render(<SlotMap chassis={chassis} catalog={seedTemplates().filter((t) => t.mounting === 'rack')} commit={() => null} onSelect={() => {}} />);
  await user.click(screen.getByRole('button', { name: 'Add node to slot 3' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Add a Node template to the Catalog first.');
});
