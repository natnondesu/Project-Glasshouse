export const FLOOR_STEP_M = 0.1;
export const DRAG_STEP_M = 0.1;
export const TYPED_STEP_M = 0.01;
export const U_HEIGHT_M = 0.04445;
export const RACK_FRAME_ALLOWANCE_M = 0.18;

function decimalsOf(step: number): number {
  const text = String(step);
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

export function roundTo(value: number, step: number): number {
  const rounded = Math.round(value / step) * step;
  return Number(rounded.toFixed(decimalsOf(step)));
}

export const snapFloor = (m: number): number => roundTo(m, FLOOR_STEP_M);
export const snapDrag = (m: number): number => roundTo(m, DRAG_STEP_M);
export const snapTyped = (m: number): number => roundTo(m, TYPED_STEP_M);

export function normalizeAngle(deg: number): number {
  const wrapped = ((deg % 360) + 360) % 360;
  const rounded = roundTo(wrapped, 0.01);
  return rounded === 360 ? 0 : rounded;
}

export function rackAutoHeightM(capacityU: number): number {
  return roundTo(capacityU * U_HEIGHT_M + RACK_FRAME_ALLOWANCE_M, 0.01);
}

export const formatMetres = (m: number): string => m.toFixed(2);
