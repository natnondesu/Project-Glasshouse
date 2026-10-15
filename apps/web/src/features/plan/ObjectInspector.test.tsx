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
