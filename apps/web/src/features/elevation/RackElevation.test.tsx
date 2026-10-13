import { createObject, known, unknownDemand, type Chassis, type PlacedDevice, type Rack } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { RackElevation } from './RackElevation';

const base = { templateId: 't', templateVersion: 1, config: '', notes: '' };
const chassis: Chassis = {
  ...base,
  id: 'ch',
  name: 'CH-01',
  demand: known(20),
  kind: 'chassis',
  bottomU: 5,
  heightU: 6,
  depthMm: 780,
  slotCount: 5,
  slotsPerRow: 5,
  nodes: [{ ...base, id: 'n2', name: 'NODE-01', demand: unknownDemand(), slot: 2 }],
};
const server: PlacedDevice = { ...base, id: 'srv', name: 'SRV-01', demand: known(450), kind: 'device', category: 'compute', bottomU: 20, heightU: 2, depthMm: 780 };
const rack: Rack = {
  ...(createObject('rack', { x: 1, y: 1 }, []) as Rack),
  id: 'rk',
  name: 'RK-01',
  devices: [chassis, server],
  reserved: [{ id: 'r', label: 'Customer core', bottomU: 1, heightU: 4, demand: unknownDemand(), notes: '' }],
};

it('draws devices, the reserved range and U numbers on both rails', () => {
  render(<RackElevation rack={rack} active selectedId={null} flagged={new Set()} onSelect={() => {}} onActivate={() => {}} onDropTemplate={() => {}} />);
  expect(screen.getByRole('button', { name: 'CH-01, U5–U10' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'SRV-01, U20–U21' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reserved range U1–U4, Customer core' })).toBeInTheDocument();
  expect(screen.getAllByText('42')).toHaveLength(2);
  expect(screen.getByText('12/42U')).toBeInTheDocument();
  expect(screen.getByText('470 W + 2 unknown')).toBeInTheDocument();
});

it('selects devices and nodes, and activates the rack from its caption', async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  const onActivate = vi.fn();
  render(<RackElevation rack={rack} active={false} selectedId="srv" flagged={new Set(['srv'])} onSelect={onSelect} onActivate={onActivate} onDropTemplate={() => {}} />);
  await user.click(screen.getByRole('button', { name: 'SRV-01, U20–U21' }));
  expect(onSelect).toHaveBeenLastCalledWith('srv');
  await user.click(screen.getByText('Slot 2: NODE-01'));
  expect(onSelect).toHaveBeenLastCalledWith('n2');
  await user.click(screen.getByRole('button', { name: 'RK-01' }));
  expect(onActivate).toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'SRV-01, U20–U21' })).toHaveClass('is-selected', 'is-flagged');
});
