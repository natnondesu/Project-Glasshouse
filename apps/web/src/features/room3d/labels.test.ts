import { expect, it } from 'vitest';
import { DEFAULT_LABEL_KINDS, LABEL_KINDS, initialLabelKinds, labelKindOf } from './labels';

it('groups every power source under one label kind', () => {
  for (const t of ['mcb', 'wall_plug', 'industrial_socket', 'floor_box', 'ups', 'pdu'] as const) expect(labelKindOf(t)).toBe('power');
  expect(labelKindOf('existing_rack')).toBe('existing');
  expect(labelKindOf('door')).toBe('door');
});

it('carries the old "on hover" choice over as no labels shown', () => {
  expect(initialLabelKinds('"hover"')).toEqual([]);
  expect(initialLabelKinds('"always"')).toEqual(DEFAULT_LABEL_KINDS);
  expect(initialLabelKinds(null)).toEqual(DEFAULT_LABEL_KINDS);
});

it('files the new objects under kinds a viewer can switch', () => {
  expect(labelKindOf('partition')).toBe('door');
  expect(labelKindOf('wall_split_ac')).toBe('cooling');
  expect(labelKindOf('precision_ac')).toBe('cooling');
  expect(labelKindOf('display_wall')).toBe('furniture');
  expect(LABEL_KINDS).toContain('cooling');
});
