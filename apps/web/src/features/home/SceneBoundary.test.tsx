import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SceneBoundary } from './SceneBoundary';

function Broken(): never {
  throw new Error('chunk failed');
}

it('keeps a failed 3D to its own panel with a message, instead of taking the page', () => {
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  render(
    <div>
      <h1>MDF-1</h1>
      <SceneBoundary message="The 3D view couldn't load here." reload="Reload page">
        <Broken />
      </SceneBoundary>
    </div>,
  );
  expect(screen.getByRole('heading', { name: 'MDF-1' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent("The 3D view couldn't load here.");
  expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
  quiet.mockRestore();
});
