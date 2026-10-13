import type { Demand } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { DemandField } from './DemandField';

it('switches to Known without inventing a zero, then commits typed watts', async () => {
  const user = userEvent.setup();
  const onCommit = vi.fn<(d: Demand) => string | null>(() => null);
  render(<DemandField id="d" label="Demand" value={{ kind: 'unknown' }} onCommit={onCommit} />);
  expect(screen.getByText('Blocks approval until the watts are known.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Known' }));
  expect(onCommit).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText('Demand in watts'), '0');
  expect(onCommit).toHaveBeenLastCalledWith({ kind: 'known', watts: 0 });
});

it('commits Unknown explicitly and shows a custom hint', async () => {
  const user = userEvent.setup();
  const onCommit = vi.fn<(d: Demand) => string | null>(() => null);
  render(<DemandField id="d" label="Demand" value={{ kind: 'known', watts: 150 }} onCommit={onCommit} unknownHint="A reviewer must acknowledge this." />);
  expect(screen.getByLabelText('Demand in watts')).toHaveValue('150');
  await user.click(screen.getByRole('button', { name: 'Unknown' }));
  expect(onCommit).toHaveBeenLastCalledWith({ kind: 'unknown' });
  expect(screen.getByText('A reviewer must acknowledge this.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Unknown' })).toHaveAttribute('aria-pressed', 'true');
});
