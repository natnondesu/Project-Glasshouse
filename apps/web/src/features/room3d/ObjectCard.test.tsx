import { createObject, type SimpleObject } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ObjectCard } from './ObjectCard';

const mcb = (inUse?: false): SimpleObject => ({ ...(createObject('mcb', { x: 0, y: 1 }, []) as SimpleObject), id: 'm', name: 'MCB-01', ...(inUse === false ? { panel: { phase: 'three' as const, ways: [{ ratingA: 16, label: '' }], inUse } } : {}) });

it('says an MCB panel is in use', () => {
  render(<ObjectCard object={mcb()} onManageWays={() => {}} />);
  expect(screen.getByText('Status').nextElementSibling).toHaveTextContent('In use');
});

it('says an MCB panel is not in use', () => {
  render(<ObjectCard object={mcb(false)} onManageWays={() => {}} />);
  expect(screen.getByText('Status').nextElementSibling).toHaveTextContent('Not in use');
});

it('has no status row for other objects', () => {
  render(<ObjectCard object={createObject('ups', { x: 1, y: 1 }, [])} onManageWays={() => {}} />);
  expect(screen.queryByText('Status')).toBeNull();
});

it('shows the main breaker when one is set', () => {
  const o = { ...mcb(), panel: { phase: 'three' as const, ways: [{ ratingA: 16, label: '' }], mainRatingA: 100 } };
  render(<ObjectCard object={o} onManageWays={() => {}} />);
  expect(screen.getByText('Main breaker').nextElementSibling).toHaveTextContent('100 A');
});

it('offers "View ways" instead of "Manage ways" on a frozen revision, and still opens them', async () => {
  const onManageWays = vi.fn();
  render(<ObjectCard object={mcb()} onManageWays={onManageWays} readOnly />);
  expect(screen.queryByRole('button', { name: 'Manage ways' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'View ways' }));
  expect(onManageWays).toHaveBeenCalled();
});
