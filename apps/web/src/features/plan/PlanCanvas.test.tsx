import { createObject, emptyContent, type PlanContent, type Rack } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useViewport } from '../../viewport/useViewport';
import { PlanCanvas } from './PlanCanvas';

function Harness({ content }: { content: PlanContent }) {
  const viewport = useViewport({ w: content.survey.width, d: content.survey.length });
  return <PlanCanvas content={content} issues={[]} selectedId={null} viewport={viewport} preview={null} cursor="default" onFocusObject={() => {}} />;
}

it('draws the footprint and labels racks with name and capacity', () => {
  const base = emptyContent();
  const rack = { ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), name: 'RK-01', w: 0.6, d: 1.07 };
  render(<Harness content={{ ...base, objects: [rack] }} />);
  expect(screen.getByTestId('footprint').getAttribute('d')).toMatch(/^M/);
  expect(screen.getByRole('button', { name: 'RK-01, Rack' })).toBeInTheDocument();
  expect(screen.getByText('0/42U')).toBeInTheDocument();
  expect(screen.getByText('5.00')).toBeInTheDocument();
  expect(screen.getByText('4.00')).toBeInTheDocument();
});

it('shows the clear distance to the nearest wall or object for the selected object and for a placement ghost', () => {
  const base = emptyContent();
  const rack = { ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), id: 'rk', name: 'RK-01', w: 0.6, d: 1.07 };
  function WithSelection({ ghost }: { ghost?: boolean }) {
    const content = { ...base, objects: [rack] };
    const viewport = useViewport({ w: 5, d: 4 });
    const ghostObject = ghost ? { ...(createObject('rack', { x: 3, y: 1 }, []) as Rack), id: 'ghost', name: 'RK-02', w: 0.6, d: 1.07 } : null;
    return <PlanCanvas content={content} issues={[]} selectedId={ghost ? null : 'rk'} viewport={viewport} preview={null} ghost={ghostObject} cursor="default" onFocusObject={() => {}} />;
  }
  const { unmount } = render(<WithSelection />);
  expect(screen.getByTestId('clear-left')).toHaveTextContent('1.00');
  expect(screen.getByTestId('clear-top')).toHaveTextContent('1.00');
  unmount();
  render(<WithSelection ghost />);
  // The ghost's left gap ends at RK-01's right edge: 3 − (1 + 0.6).
  expect(screen.getByTestId('clear-left')).toHaveTextContent('1.40');
});
