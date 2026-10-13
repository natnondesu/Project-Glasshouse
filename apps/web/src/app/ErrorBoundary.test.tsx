import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): never {
  throw new Error('unable to complete output ring');
}

it('shows the error and a workspace download instead of a blank screen', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  render(
    <ErrorBoundary label="the plan">
      <Boom />
    </ErrorBoundary>,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('Glasshouse hit a problem drawing the plan.');
  expect(screen.getByText('unable to complete output ring')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Download workspace' })).toBeInTheDocument();
});
