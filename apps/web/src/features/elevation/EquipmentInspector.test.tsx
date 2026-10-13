import { applyPlanCommand, createObject, emptyContent, seedTemplates, type PlanCommand, type PlanContent, type Rack, type Template } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import { CatalogPalette } from './CatalogPalette';
import { EquipmentInspector } from './EquipmentInspector';

const catalog = seedTemplates();
const tpl = (id: string) => catalog.find((t) => t.id === id) as Template;
const a = { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), id: 'ra', name: 'RK-01' };
const b = { ...(createObject('rack', { x: 2, y: 0.6 }, []) as Rack), id: 'rb', name: 'RK-02' };
function build(...cmds: PlanCommand[]): PlanContent {
  return [{ type: 'object/add', object: a } as PlanCommand, { type: 'object/add', object: b } as PlanCommand, ...cmds].reduce((c, cmd) => {
    const r = applyPlanCommand(c, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, emptyContent());
}
const content = build(
  { type: 'device/place', id: 'srv', rackId: 'ra', bottomU: 20, template: tpl('tpl-server-2u') },
  { type: 'device/place', id: 'ch', rackId: 'ra', bottomU: 5, template: tpl('tpl-chassis-6u') },
  { type: 'node/insert', id: 'n1', chassisId: 'ch', slot: 1, template: tpl('tpl-node') },
);
const show = (selectedId: string | null, commit = vi.fn<(c: unknown, k?: string) => string | null>(() => null), onSelect = vi.fn()) => {
  render(
    <MemoryRouter>
      <EquipmentInspector content={content} roomId="room" selectedId={selectedId} activeRack={content.objects[0] as Rack} catalog={catalog} commit={commit} onSelect={onSelect} />
    </MemoryRouter>,
  );
  return { commit, onSelect };
};

it('edits a device: move to another rack, unknown demand, remove after confirmation', async () => {
  const user = userEvent.setup();
  const { commit, onSelect } = show('srv');
  expect(screen.getByRole('heading', { name: 'SRV-01' })).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('Rack'), 'RK-02');
  expect(commit.mock.lastCall?.[0]).toEqual({ type: 'device/move', id: 'srv', rackId: 'rb', bottomU: 20 });
  await user.click(screen.getByRole('button', { name: 'Unknown' }));
  expect(commit.mock.lastCall?.[0]).toEqual({ type: 'device/update', id: 'srv', patch: { demand: { kind: 'unknown' } } });
  await user.click(screen.getByRole('button', { name: 'Remove SRV-01' }));
  await user.click(screen.getByRole('button', { name: 'Remove' }));
  expect(commit.mock.lastCall?.[0]).toEqual({ type: 'device/remove', id: 'srv' });
  expect(onSelect).toHaveBeenCalledWith(null);
});

it('shows the slot map for a chassis and node details for a node', () => {
  show('ch');
  expect(screen.getByText('1 of 5 filled')).toBeInTheDocument();
  expect(screen.getByLabelText('Chassis overhead in watts')).toHaveValue('20');
});

it('shows a node with a way back to its chassis', async () => {
  const user = userEvent.setup();
  const { onSelect } = show('n1');
  expect(screen.getByRole('heading', { name: 'NODE-01' })).toBeInTheDocument();
  expect(screen.getByText('Slot 1 of CH-01 · RK-01 U5–U10')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Back to CH-01' }));
  expect(onSelect).toHaveBeenCalledWith('ch');
});

it('adds a reserved range from the rack summary', async () => {
  const user = userEvent.setup();
  const { commit, onSelect } = show(null);
  expect(screen.getByRole('heading', { name: 'RK-01' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Add reserved range' }));
  expect(commit.mock.lastCall?.[0]).toMatchObject({ type: 'reserved/add', rackId: 'ra', range: { label: 'Reserved', bottomU: 1, heightU: 1, demand: { kind: 'unknown' } } });
  expect(onSelect).toHaveBeenCalledWith(expect.any(String));
});

it('lists the catalog with add buttons for rack templates only', async () => {
  const user = userEvent.setup();
  const onAdd = vi.fn();
  render(
    <MemoryRouter>
      <CatalogPalette catalog={catalog} activeRack={a} onAdd={onAdd} />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('button', { name: 'Add Server 4U to RK-01' }));
  expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'tpl-server-4u' }));
  expect(screen.queryByRole('button', { name: 'Add Node server to RK-01' })).toBeNull();
});
