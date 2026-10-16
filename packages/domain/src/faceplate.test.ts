import { describe, expect, it } from 'vitest';
import { faceplateBlocks } from './faceplate';
import type { PortGroup } from './model/types';
import { expandPorts } from './ports';

const sw: PortGroup[] = [
  { count: 8, prefix: 'Gi1/0/', start: 1, media: 'rj45', speed: '1G', rows: 2 },
  { count: 2, prefix: 'Te1/1/', start: 1, media: 'sfp_plus', speed: '10G' },
];
const names = (rows: ({ name: string } | null)[][]) => rows.map((r) => r.map((p) => (p ? p.name.replace(/^.*\//, '') : '—')));

describe('faceplateBlocks', () => {
  it('draws each group as a block: two rows odd on top by default, one row otherwise', () => {
    const blocks = faceplateBlocks(sw, expandPorts(sw));
    expect(blocks.map((b) => b.label)).toEqual(['Gi1/0/', 'Te1/1/']);
    expect(names(blocks[0]!.rows)).toEqual([['1', '3', '5', '7'], ['2', '4', '6', '8']]);
    expect(names(blocks[1]!.rows)).toEqual([['1', '2']]);
  });

  it('numbers left to right along the top, then the bottom, when asked', () => {
    const g: PortGroup[] = [{ ...sw[0]!, count: 5, order: 'linear' }];
    expect(names(faceplateBlocks(g, expandPorts(g))[0]!.rows)).toEqual([['1', '2', '3'], ['4', '5']]);
  });

  it('uses the device’s own ports: a removed one leaves the block, an added one gets a block of its own', () => {
    const ports = expandPorts(sw).filter((p) => p.name !== 'Gi1/0/3');
    const blocks = faceplateBlocks(sw, [...ports, { name: 'mgmt0', media: 'rj45', speed: '1G' }]);
    // Jack 3's place stays empty: 5 and 7 don't slide left.
    expect(names(blocks[0]!.rows)).toEqual([['1', '—', '5', '7'], ['2', '4', '6', '8']]);
    expect(blocks.map((b) => b.label)).toEqual(['Gi1/0/', 'Te1/1/', 'mgmt']);
  });

  it('without a template, falls back to blocks by name prefix in one row', () => {
    const ports = [...expandPorts([{ count: 2, prefix: 'eth', start: 0, media: 'rj45', speed: '1G' }]), { name: 'ipmi', media: 'rj45' as const, speed: '1G' }];
    expect(faceplateBlocks(undefined, ports).map((b) => [b.label, b.rows[0]!.map((p) => p?.name)])).toEqual([['eth', ['eth0', 'eth1']], ['', ['ipmi']]]);
  });
});
