import { createObject, emptyContent, type PlanContent, type Rack, type RoomObject } from '@glasshouse/domain';
import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useViewport } from '../../viewport/useViewport';
import { PlanCanvas } from './PlanCanvas';

function Harness({ objects }: { objects: RoomObject[] }) {
  const content: PlanContent = { ...emptyContent(), survey: { ...emptyContent().survey, width: 10, length: 10, floorAreas: [{ id: 'a', x: 0, y: 0, w: 10, d: 10 }] }, objects };
  const viewport = useViewport({ w: 10, d: 10 });
  return <PlanCanvas content={content} issues={[]} selectedId={null} viewport={viewport} preview={null} cursor="default" onFocusObject={() => {}} />;
}

const at = (o: RoomObject, id: string, extra: Partial<RoomObject> = {}): RoomObject => ({ ...o, id, ...extra }) as RoomObject;

it('shows a rack name whole, under the rack when it cannot fit inside, and on hover', () => {
  const rack = at(createObject('rack', { x: 4, y: 2 }, []), 'rk', { name: 'Deepvision Rack 01', w: 3, d: 2 } as Partial<Rack>);
  const { container } = render(<Harness objects={[rack]} />);
  const label = container.querySelector('[data-object-id="rk"] .obj__label')!;
  expect(label).toHaveClass('obj__label--outside');
  expect(label.textContent).toBe('Deepvision Rack 01');
  expect(container.querySelector('[data-object-id="rk"] .obj__hover')!.textContent).toBe('Deepvision Rack 01');
});

it('gives every object a hover name tag, even ones too small for a label', () => {
  const mcb = at(createObject('mcb', { x: 0, y: 4 }, []), 'm', { name: 'MCB-01' });
  const { container } = render(<Harness objects={[mcb]} />);
  expect(container.querySelector('[data-object-id="m"] .obj__hover')!.textContent).toBe('MCB-01');
});

it('draws an MCB panel symbol and a real door with leaf and swing that follows the hinge', () => {
  const mcb = at(createObject('mcb', { x: 0, y: 4 }, []), 'm');
  const left = at(createObject('door', { x: 3, y: 0 }, []), 'dl');
  const right = at(createObject('door', { x: 6, y: 0 }, []), 'dr', { hinge: 'right' });
  const { container } = render(<Harness objects={[mcb, left, right]} />);
  expect(container.querySelector('[data-object-id="m"] .mcb__bolt')).not.toBeNull();
  for (const id of ['dl', 'dr']) {
    expect(container.querySelector(`[data-object-id="${id}"] .door__leaf`)).not.toBeNull();
    expect(container.querySelector(`[data-object-id="${id}"] .door__swing`)).not.toBeNull();
  }
  const leafX = (id: string) => Number(container.querySelector(`[data-object-id="${id}"] .door__leaf`)!.getAttribute('x1'));
  const bodyX = (id: string) => container.querySelector(`[data-object-id="${id}"] .obj__body`)!.getAttribute('d')!;
  // Left hinge sits at the door's left end, right hinge at its right end.
  const xs = (d: string) => [...d.matchAll(/[ML]([\d.-]+) /g)].map((m) => Number(m[1]));
  expect(leafX('dl')).toBeCloseTo(Math.min(...xs(bodyX('dl'))), 0);
  expect(leafX('dr')).toBeCloseTo(Math.max(...xs(bodyX('dr'))), 0);
});

it('draws a sliding door with its track, the leaf parked on the side it slides to, and no swing', () => {
  const left = at(createObject('door', { x: 3, y: 0 }, []), 'sl', { opening: 'slide' });
  const right = at(createObject('door', { x: 6, y: 0 }, []), 'sr', { opening: 'slide', hinge: 'right' });
  const { container } = render(<Harness objects={[left, right]} />);
  const xs = (sel: string) => [...container.querySelector(sel)!.getAttribute('d')!.matchAll(/[ML]([\d.-]+) /g)].map((m) => Number(m[1]));
  for (const id of ['sl', 'sr']) {
    expect(container.querySelector(`[data-object-id="${id}"] .door__swing`)).toBeNull();
    expect(container.querySelector(`[data-object-id="${id}"] .door__track`)).not.toBeNull();
    expect(container.querySelector(`[data-object-id="${id}"] .door__arrow`)).not.toBeNull();
  }
  const mid = (id: string) => {
    const body = xs(`[data-object-id="${id}"] .obj__body`);
    return (Math.min(...body) + Math.max(...body)) / 2;
  };
  const leafMid = (id: string) => {
    const leaf = xs(`[data-object-id="${id}"] .door__leaf--slide`);
    return (leaf[0]! + leaf[1]!) / 2;
  };
  expect(leafMid('sl')).toBeLessThan(mid('sl'));
  expect(leafMid('sr')).toBeGreaterThan(mid('sr'));
});
