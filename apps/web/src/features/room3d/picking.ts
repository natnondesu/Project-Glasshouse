/**
 * For decoration that must never be clicked (outlines, labels, highlight rings): three.js would otherwise
 * pick lines up to 1 m away and sprites wherever they overlap something else.
 */
export const NO_PICK = (): void => undefined;

/** Lines that are pickable at all only count within 2 cm. */
export const LINE_PICK_THRESHOLD_M = 0.02;
