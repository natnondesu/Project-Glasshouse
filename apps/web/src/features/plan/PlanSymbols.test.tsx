import { createObject, emptyContent, type Issue, type PlanContent, type Rack, type RoomObject } from '@glasshouse/domain';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useViewport } from '../../viewport/useViewport';
import { PlanCanvas } from './PlanCanvas';
import type { Preview } from './layers';
import { ALL_LAYERS, type PlanLayers } from './ViewMenu';

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

function Scene({ objects, issues = [], selectedId = null, preview = null, layers }: { objects: RoomObject[]; issues?: Issue[]; selectedId?: string | null; preview?: Preview | null; layers?: PlanLayers }) {
  const content: PlanContent = { ...emptyContent(), survey: { ...emptyContent().survey, width: 10, length: 10, floorAreas: [{ id: 'a', x: 0, y: 0, w: 10, d: 10 }] }, objects };
  // jsdom has no layout: fix the zoom so drawn sizes are predictable (100 px per metre).
  const viewport = { ...useViewport({ w: 10, d: 10 }), view: { scale: 100, tx: 0, ty: 0 } };
  return <PlanCanvas content={content} issues={issues} selectedId={selectedId} viewport={viewport} preview={preview} layers={layers} cursor="default" onFocusObject={() => {}} />;
}

const warn = (code: Issue['code'], targets: string[]): Issue => ({ key: `${code}:${targets.join(':')}`, code, severity: 'warn', message: 'm', hint: 'h', params: {}, targets });

describe('partition, air conditioning and display wall on the plan', () => {
  it('draws a partition as a solid wall under everything else, even when it was added after a door', () => {
    const door = at(createObject('door', { x: 3.55, y: 4 }, []), 'door', { angle: 0 });
    const wall = at(createObject('partition', { x: 3, y: 4 }, []), 'wall');
    const { container } = render(<Scene objects={[door, wall]} />);
    const order = [...container.querySelectorAll('[data-object-id]')].map((g) => g.getAttribute('data-object-id'));
    expect(order.indexOf('wall')).toBeLessThan(order.indexOf('door'));
    expect(container.querySelector('[data-object-id="wall"]')).toHaveClass('obj--partition');
  });

  it('names a partition along its line, beside it', () => {
    const wall = at(createObject('partition', { x: 3, y: 4 }, []), 'wall', { name: 'PT-01' });
    const { container } = render(<Scene objects={[wall]} />);
    const label = container.querySelector('[data-object-id="wall"] .obj__label--along');
    expect(label?.textContent).toBe('PT-01');
  });

  it('draws a wall split AC dashed like other overhead items, with its vent and the air blowing out of the front', () => {
    const ac = at(createObject('wall_split_ac', { x: 3, y: 0 }, []), 'ac');
    const { container } = render(<Scene objects={[ac]} />);
    const g = container.querySelector('[data-object-id="ac"]')!;
    expect(g).toHaveClass('obj--wall_split_ac');
    expect(g.querySelector('.ac__louvre')).not.toBeNull();
    expect(g.querySelectorAll('.ac__flow')).toHaveLength(3);
  });

  it('draws a precision AC with its fan and a front band, and keeps its name clear of the fan', () => {
    const pac = at(createObject('precision_ac', { x: 3, y: 3 }, []), 'pac');
    const { container } = render(<Scene objects={[pac]} />);
    const g = container.querySelector('[data-object-id="pac"]')!;
    expect(g.querySelector('.pac__fan')).not.toBeNull();
    expect(g.querySelector('.src__front')).not.toBeNull();
    const fan = g.querySelector('.pac__fan')!;
    const label = g.querySelector('.obj__label')!;
    expect(Number(label.getAttribute('y'))).toBeGreaterThan(Number(fan.getAttribute('cy')) + Number(fan.getAttribute('r')));
    // ...and above the heavy front band.
    const front = g.querySelector('.src__front')!.getAttribute('d')!;
    expect(Number(label.getAttribute('y')) + 6).toBeLessThan(Number(/^M[\d.-]+ ([\d.-]+)/.exec(front)![1]));
  });

  it('draws a display wall as tiles with a heavy screen face', () => {
    const dw = at(createObject('display_wall', { x: 3, y: 0 }, []), 'dw');
    const { container } = render(<Scene objects={[dw]} />);
    const g = container.querySelector('[data-object-id="dw"]')!;
    expect(g.querySelector('.dw__screen')).not.toBeNull();
    expect(g.querySelectorAll('.dw__tile')).toHaveLength(2);
  });
});

describe('zones in front of air conditioning and the display wall', () => {
  const ac = at(createObject('wall_split_ac', { x: 3, y: 0 }, []), 'ac');
  const rack = at(createObject('rack', { x: 3, y: 0.6 }, []), 'rk');

  it('shows the zone only while the unit is selected', () => {
    expect(render(<Scene objects={[ac]} />).container.querySelector('.env-zone')).toBeNull();
    const selected = render(<Scene objects={[ac]} selectedId="ac" />).container;
    expect(selected.querySelector('.env-zone')).not.toBeNull();
    expect(selected.querySelector('.env-zone--warn')).toBeNull();
  });

  it('shows the zone, marked as a warning, when a rule about it fires', () => {
    const { container } = render(<Scene objects={[ac, rack]} issues={[warn('wall_ac_airflow', ['rk', 'ac'])]} />);
    expect(container.querySelector('.env-zone--warn')).not.toBeNull();
    // The rack involved is marked too, so the warning can be found on the drawing.
    expect(container.querySelector('[data-object-id="rk"]')).toHaveClass('is-warned');
    expect(container.querySelector('[data-object-id="ac"]')).toHaveClass('is-warned');
  });

  it('marks the objects of a condensate warning, which has no zone of its own', () => {
    const { container } = render(<Scene objects={[ac, rack]} issues={[warn('wall_ac_drip', ['rk', 'ac'])]} />);
    expect(container.querySelector('.env-zone')).toBeNull();
    expect(container.querySelector('[data-object-id="rk"]')).toHaveClass('is-warned');
  });

  it('says what the zone is for and how deep, when the zone is wide enough to hold it', () => {
    const { container } = render(<Scene objects={[ac]} selectedId="ac" />);
    // 0.90 m across is too narrow for one line at this zoom: the name sits over the figure.
    expect(container.querySelectorAll('.env-zone__label tspan').length).toBe(2);
    expect(container.querySelector('.env-zone__label')?.textContent).toBe('Airflow1.00 m');
  });

  it('goes with the clearance zones layer', () => {
    const { container } = render(<Scene objects={[ac]} selectedId="ac" layers={{ ...ALL_LAYERS, clearance: false }} />);
    expect(container.querySelector('.env-zone')).toBeNull();
  });

  it('covers the 1.00 m in front of a precision AC and 1.50 m in front of a display wall', () => {
    const pac = at(createObject('precision_ac', { x: 3, y: 3 }, []), 'pac');
    const dw = at(createObject('display_wall', { x: 5, y: 0 }, []), 'dw');
    const { container } = render(<Scene objects={[pac, dw]} selectedId="pac" />);
    expect(container.querySelector('.env-zone')).not.toBeNull();
    expect(render(<Scene objects={[dw]} selectedId="dw" />).container.querySelector('.env-zone__label')?.textContent).toBe('Viewing 1.50 m');
  });

  it('covers 1.00 m in front of a precision AC: the area reaches 1.00 m past its front face, and says so on two lines', () => {
    const pac = at(createObject('precision_ac', { x: 3, y: 3 }, []), 'pac');
    const { container } = render(<Scene objects={[pac]} selectedId="pac" />);
    const ys = [...(container.querySelector('.env-zone__area')?.getAttribute('d') ?? '').matchAll(/[ML]\s*([-\d.]+)[ ,]([-\d.]+)/g)].map((m) => Number(m[2]));
    // Front face at y = 3.80 m, 100 px per metre.
    expect(Math.min(...ys)).toBeCloseTo(380, 0);
    expect(Math.max(...ys)).toBeCloseTo(480, 0);
    expect(container.querySelector('.env-zone__label')?.textContent).toBe('Service1.00 m');
  });

  it('draws the zone label in a layer of its own, above the objects and the distances, so its halo cuts any line under it', () => {
    const dw = at(createObject('display_wall', { x: 3, y: 0 }, []), 'dw');
    const { container } = render(<Scene objects={[dw]} selectedId="dw" />);
    const label = container.querySelector('.env-zone__label')!;
    expect(label.closest('.env-zone')).toBeNull();
    const layer = label.closest('.env-labels')!;
    expect(layer).not.toBeNull();
    const objectsLayer = container.querySelector('[data-object-id="dw"]')!;
    expect(objectsLayer.compareDocumentPosition(layer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('puts the label near the far edge of the zone, inset about 10 px, not in the middle', () => {
    const dw = at(createObject('display_wall', { x: 3, y: 0 }, []), 'dw');
    const { container } = render(<Scene objects={[dw]} selectedId="dw" />);
    const ys = [...(container.querySelector('.env-zone__area')?.getAttribute('d') ?? '').matchAll(/[ML]\s*([-\d.]+)[ ,]([-\d.]+)/g)].map((m) => Number(m[2]));
    const far = Math.max(...ys);
    const labelY = Number(container.querySelector('.env-zone__label')?.getAttribute('y'));
    expect(far - labelY).toBeCloseTo(10, 0);
  });

  it('keeps a sideways zone label inside the zone', () => {
    const dw = at(createObject('display_wall', { x: 0, y: 3 }, []), 'dw', { angle: 90 });
    const { container } = render(<Scene objects={[dw]} selectedId="dw" />);
    const xs = [...(container.querySelector('.env-zone__area')?.getAttribute('d') ?? '').matchAll(/[ML]\s*([-\d.]+)[ ,]([-\d.]+)/g)].map((m) => Number(m[1]));
    const label = container.querySelector('.env-zone__label');
    if (label) expect(Number(label.getAttribute('x'))).toBeLessThanOrEqual(Math.max(...xs));
  });
});

describe('drawing a partition', () => {
  it('shows only the two end handles on a selected partition, which is a few pixels thick', () => {
    const wall = at(createObject('partition', { x: 3, y: 4 }, []), 'wall');
    const { container } = render(<Scene objects={[wall]} selectedId="wall" />);
    expect([...container.querySelectorAll('[data-handle]')].map((h) => h.getAttribute('data-handle')).sort()).toEqual(['e', 'w']);
  });

  it('previews the wall being dragged out, with its length', () => {
    const wall = at(createObject('partition', { x: 3, y: 4 }, []), 'draft', { w: 3.2 });
    const { container } = render(<Scene objects={[]} preview={{ kind: 'wall', object: wall }} />);
    expect(container.querySelector('.wall-preview')).not.toBeNull();
    expect(container.querySelector('.wall-preview__length')?.textContent).toBe('3.20 m');
  });
});
