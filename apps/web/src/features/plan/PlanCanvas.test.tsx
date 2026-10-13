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
  const rack = { ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), name: 'RK-01' };
  render(<Harness content={{ ...base, objects: [rack] }} />);
  expect(screen.getByTestId('footprint').getAttribute('d')).toMatch(/^M/);
  expect(screen.getByRole('button', { name: 'RK-01, Rack' })).toBeInTheDocument();
  expect(screen.getByText('0/42U')).toBeInTheDocument();
  expect(screen.getByText('5.00')).toBeInTheDocument();
  expect(screen.getByText('4.00')).toBeInTheDocument();
});
