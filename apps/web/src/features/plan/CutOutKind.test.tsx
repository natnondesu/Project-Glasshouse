import { emptyContent, type PlanContent } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { useViewport } from '../../viewport/useViewport';
import { buildScene } from '../room3d/scene';
import { Inspector } from './Inspector';
import { PlanCanvas } from './PlanCanvas';

const withCuts = (): PlanContent => {
  const base = emptyContent();
  return { ...base, survey: { ...base.survey, cutOuts: [{ id: 'col', x: 1, y: 1, w: 0.4, d: 0.4 }, { id: 'shaft', x: 3, y: 2, w: 0.6, d: 0.6, kind: 'void' }] } };
};

function Canvas() {
  const c = withCuts();
  const viewport = useViewport({ w: c.survey.width, d: c.survey.length });
  return <PlanCanvas content={c} issues={[]} selectedId={null} viewport={viewport} preview={null} cursor="default" onFocusObject={() => {}} />;
}

it('switches a cut-out between wall/column and void', async () => {
  const user = userEvent.setup();
  const commit = vi.fn<(command: unknown, coalesceKey?: string) => string | null>(() => null);
  render(<Inspector content={withCuts()} selected={null} commit={commit} onDeleted={() => {}} />);
  expect(screen.getByRole('group', { name: 'Cut-out 1 kind' })).toHaveTextContent('Wall / column');
  expect(screen.getByRole('button', { name: 'Cut-out 1: Wall / column' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Cut-out 2: Void' })).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('button', { name: 'Cut-out 1: Void' }));
  expect(commit).toHaveBeenLastCalledWith({ type: 'floor/update', id: 'col', patch: { kind: 'void' } });
});

it('draws walls/columns solid and voids as a marked opening; only solid ones stand up in 3D', () => {
  const { container } = render(<Canvas />);
  expect(container.querySelectorAll('.cut-out--solid')).toHaveLength(1);
  expect(container.querySelectorAll('.cut-out--void')).toHaveLength(1);
  expect(container.querySelector('.cut-out__void-label')?.textContent).toBe('VOID');
  expect(buildScene(withCuts()).columns.map((c) => c.id)).toEqual(['col']);
});
