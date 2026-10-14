import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { HintLayer } from './HintLayer';

it('shows a hint for icon-only buttons on hover and focus, and none for buttons with text', async () => {
  const user = userEvent.setup();
  render(
    <>
      <HintLayer />
      <button type="button" aria-label="Rename RK-01" title="Rename">
        <svg aria-hidden="true" />
      </button>
      <button type="button">Save template</button>
    </>,
  );
  await user.hover(screen.getByRole('button', { name: 'Rename RK-01' }));
  expect(screen.getByRole('tooltip')).toHaveTextContent('Rename RK-01');
  // The native title would show a second, slower tooltip on top.
  expect(screen.getByRole('button', { name: 'Rename RK-01' })).not.toHaveAttribute('title');
  await user.unhover(screen.getByRole('button', { name: 'Rename RK-01' }));
  expect(screen.queryByRole('tooltip')).toBeNull();
  await user.hover(screen.getByRole('button', { name: 'Save template' }));
  expect(screen.queryByRole('tooltip')).toBeNull();
  await user.tab();
  expect(screen.getByRole('tooltip')).toHaveTextContent('Rename RK-01');
});
