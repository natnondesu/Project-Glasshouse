import { describe, expect, it } from 'vitest';
import { createSurvey } from './factories';
import { snapToWall } from './walls';

describe('snapToWall', () => {
  const survey = { ...createSurvey(), width: 6, length: 5, floorAreas: [{ id: 'a', x: 0, y: 0, w: 6, d: 5 }] };

  it('puts a panel flat against the nearest wall, facing into the room', () => {
    expect(snapToWall(survey, [3, 0.3], 0.5, 0.2)).toEqual({ x: 2.75, y: 0, angle: 0 });
    expect(snapToWall(survey, [3, 4.8], 0.5, 0.2)).toEqual({ x: 2.75, y: 4.8, angle: 180 });
    expect(snapToWall(survey, [0.2, 2], 0.5, 0.2)).toEqual({ x: 0, y: 1.75, angle: 270 });
    expect(snapToWall(survey, [5.9, 2], 0.5, 0.2)).toEqual({ x: 5.8, y: 1.75, angle: 90 });
  });
});
