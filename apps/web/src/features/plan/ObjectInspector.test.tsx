import { createObject, emptyContent, type Rack } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { Inspector } from './Inspector';

it('edits rack fields through plan commands and shows rejections', async () => {
  const user = userEvent.setup();
  const rack = { ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), name: 'RK-01' };
  const commit = vi.fn<(command: unknown, coalesceKey?: string) => string | null>(() => null);
  render(<Inspector content={{ ...emptyContent(), objects: [rack] }} selected={rack} commit={commit} onDeleted={() => {}} />);

  expect(screen.getByRole('heading', { name: 'RK-01' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Customer' }));
  expect(commit).toHaveBeenLastCalledWith({ type: 'object/update', id: rack.id, patch: { owner: 'customer' } }, undefined);

  await user.click(screen.getByRole('button', { name: 'Rotate 45° clockwise' }));
  expect(commit.mock.lastCall?.[0]).toEqual({ type: 'object/rotate', id: rack.id, by: 45 });

  commit.mockReturnValue('Capacity must be a whole number from 1 to 60 U.');
  const capacity = screen.getByLabelText('Capacity');
  await user.clear(capacity);
  await user.type(capacity, '61');
  expect(screen.getByText('Capacity must be a whole number from 1 to 60 U.')).toBeInTheDocument();
  expect(capacity).toHaveValue('61');
});

it('shows the survey when nothing is selected', () => {
  render(<Inspector content={emptyContent()} selected={null} commit={() => null} onDeleted={() => {}} />);
  expect(screen.getByRole('heading', { name: 'Survey' })).toBeInTheDocument();
  expect(screen.getByLabelText('Width')).toHaveValue('5.00');
});

it('sets which end a door is hinged on', async () => {
  const user = userEvent.setup();
  const door = { ...createObject('door', { x: 1, y: 0 }, []), name: 'D-01' };
  const commit = vi.fn<(command: unknown, coalesceKey?: string) => string | null>(() => null);
  render(<Inspector content={{ ...emptyContent(), objects: [door] }} selected={door} commit={commit} onDeleted={() => {}} />);
  expect(screen.getByRole('button', { name: 'Left' })).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('button', { name: 'Right' }));
  expect(commit).toHaveBeenLastCalledWith({ type: 'object/update', id: door.id, patch: { hinge: 'right' } }, undefined);
});

it('turns a door into a sliding door and asks which side it slides to', async () => {
  const user = userEvent.setup();
  const door = { ...createObject('door', { x: 1, y: 0 }, []), name: 'D-01', opening: 'slide' as const };
  const commit = vi.fn<(command: unknown, coalesceKey?: string) => string | null>(() => null);
  render(<Inspector content={{ ...emptyContent(), objects: [door] }} selected={door} commit={commit} onDeleted={() => {}} />);
  expect(screen.getByRole('button', { name: 'Sliding' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('group', { name: 'Side the door slides to' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Swing' }));
  expect(commit).toHaveBeenLastCalledWith({ type: 'object/update', id: door.id, patch: { opening: 'swing' } }, undefined);
});

it('hangs a rack on the wall with no rear clearance, sets its height, and stands it back on the floor', async () => {
  const user = userEvent.setup();
  const rack = { ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), name: 'RK-01' };
  const commit = vi.fn<(command: unknown, coalesceKey?: string) => string | null>(() => null);
  const { rerender } = render(<Inspector content={{ ...emptyContent(), objects: [rack] }} selected={rack} commit={commit} onDeleted={() => {}} />);
  await user.click(screen.getByRole('button', { name: 'Wall' }));
  expect(commit).toHaveBeenLastCalledWith({ type: 'object/update', id: rack.id, patch: { wallBottomM: 1.2, clearance: { rear: 0 } } }, undefined);
  const hung = { ...rack, wallBottomM: 1.2 };
  rerender(<Inspector content={{ ...emptyContent(), objects: [hung] }} selected={hung} commit={commit} onDeleted={() => {}} />);
  expect(screen.getByLabelText('Bottom at')).toHaveValue('1.20');
  await user.click(screen.getByRole('button', { name: 'Floor' }));
  expect(commit).toHaveBeenLastCalledWith({ type: 'object/update', id: rack.id, patch: { wallBottomM: null } }, undefined);
});

const make = (type: 'partition' | 'wall_split_ac' | 'precision_ac' | 'display_wall') => ({ ...createObject(type, { x: 1, y: 1 }, []), name: 'X-01' });
const show = (object: ReturnType<typeof make>, commit = vi.fn<(command: unknown, coalesceKey?: string) => string | null>(() => null)) => {
  render(<Inspector content={{ ...emptyContent(), objects: [object] }} selected={object} commit={commit} onDeleted={() => {}} />);
  return commit;
};

it('calls a partition’s sides Length and Thickness', () => {
  show(make('partition'));
  expect(screen.getByLabelText('Length')).toHaveValue('2.00');
  expect(screen.getByLabelText('Thickness')).toHaveValue('0.10');
  expect(screen.queryByLabelText('Width')).toBeNull();
  expect(screen.queryByLabelText('Height above floor')).toBeNull();
  expect(screen.getByText(/Doors snap into it/)).toBeInTheDocument();
});

it('keeps Width and Depth for the cabinet and the screen', () => {
  show(make('precision_ac'));
  expect(screen.getByLabelText('Width')).toHaveValue('0.80');
  expect(screen.getByLabelText('Depth')).toHaveValue('0.80');
  expect(screen.queryByLabelText('Height above floor')).toBeNull();
  expect(screen.getByText(/where it is serviced/)).toBeInTheDocument();
});

it('sets how high a wall split AC or a display wall hangs, from the floor to its bottom', async () => {
  const user = userEvent.setup();
  const commit = show(make('wall_split_ac'));
  const height = screen.getByLabelText('Height above floor');
  expect(height).toHaveValue('2.20');
  await user.clear(height);
  await user.type(height, '2.4');
  await user.tab();
  expect(commit).toHaveBeenLastCalledWith({ type: 'object/update', id: expect.any(String), patch: { wallBottomM: 2.4 } }, expect.stringContaining('wallBottom'));
});

it('shows a display wall’s default height when the file stored none', () => {
  const { wallBottomM: _stored, ...bare } = make('display_wall');
  show(bare as ReturnType<typeof make>);
  expect(screen.getByLabelText('Height above floor')).toHaveValue('0.80');
  expect(screen.getByText(/takes no power/)).toBeInTheDocument();
});

it.each([
  ['wall_split_ac', '1.00', 'Airflow in front of the AC'],
  ['precision_ac', '1.00', 'Service access in front'],
  ['display_wall', '1.50', 'Viewing area in front'],
] as const)('offers a Keep clear depth for a %s, with its default as the placeholder and a hint', (type, fallback, hint) => {
  show(make(type));
  const field = screen.getByLabelText('Keep clear');
  expect(field).toHaveValue('');
  expect(field).toHaveAttribute('placeholder', fallback);
  expect(screen.getByText(hint)).toBeInTheDocument();
});

it('sets, zeroes and clears the Keep clear depth', async () => {
  const user = userEvent.setup();
  const commit = show(make('precision_ac'));
  const field = screen.getByLabelText('Keep clear');
  await user.type(field, '0.5');
  expect(commit).toHaveBeenLastCalledWith({ type: 'object/update', id: expect.any(String), patch: { keepClearM: 0.5 } }, expect.stringContaining('keepClear'));
  await user.clear(field);
  expect(commit).toHaveBeenLastCalledWith({ type: 'object/update', id: expect.any(String), patch: { keepClearM: null } }, expect.stringContaining('keepClear'));
  await user.type(field, '0');
  expect(commit).toHaveBeenLastCalledWith({ type: 'object/update', id: expect.any(String), patch: { keepClearM: 0 } }, expect.stringContaining('keepClear'));
});

it('says there is no zone when Keep clear is 0, and shows a stored depth', () => {
  show({ ...make('display_wall'), keepClearM: 0 } as ReturnType<typeof make>);
  expect(screen.getByLabelText('Keep clear')).toHaveValue('0.00');
  expect(screen.getByText('No keep-clear zone')).toBeInTheDocument();
  expect(screen.queryByText('Viewing area in front')).toBeNull();
});

it('has no Keep clear field for a partition or a rack', () => {
  show(make('partition'));
  expect(screen.queryByLabelText('Keep clear')).toBeNull();
});
