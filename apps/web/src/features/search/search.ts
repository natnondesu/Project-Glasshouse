import { formatURange, racksOf, type PlanContent, type Template } from '@glasshouse/domain';
import { TYPE_LABEL } from '../plan/labels';

export type HitKind = 'object' | 'device' | 'node' | 'reserved' | 'feed';

export interface SearchHit {
  key: string;
  kind: HitKind;
  name: string;
  detail: string;
  /** The object on the plan (the rack, for anything inside one). */
  objectId: string;
  /** The device, node or reserved range for the elevation; null for plan-only objects. */
  elementId: string | null;
}

interface Entry extends SearchHit {
  /** Lower-cased searchable text besides the name. */
  text: string;
}

export const MAX_HITS = 8;

const templateText = (content: PlanContent, id: string, version: number): string => {
  const tpl: Template | undefined = content.templatesUsed.find((x) => x.id === id && x.version === version);
  return tpl ? `${tpl.label} ${tpl.model}` : '';
};
const templateLabel = (content: PlanContent, id: string, version: number): string =>
  content.templatesUsed.find((x) => x.id === id && x.version === version)?.label ?? 'Device';

function entries(content: PlanContent, stateOf: (id: string) => string): Entry[] {
  const out: Entry[] = [];
  const name = (id: string): string => content.objects.find((o) => o.id === id)?.name ?? '';
  for (const o of content.objects) {
    out.push({ key: o.id, kind: 'object', name: o.name, detail: TYPE_LABEL[o.type], objectId: o.id, elementId: null, text: `${TYPE_LABEL[o.type]} ${o.notes}` });
  }
  for (const rack of racksOf(content)) {
    for (const d of rack.devices) {
      const model = templateLabel(content, d.templateId, d.templateVersion);
      out.push({
        key: d.id,
        kind: 'device',
        name: d.name,
        detail: `${d.kind === 'chassis' ? 'Chassis' : 'Device'} · ${model} in ${rack.name}, ${formatURange(d)}`,
        objectId: rack.id,
        elementId: d.id,
        text: `${templateText(content, d.templateId, d.templateVersion)} ${d.config} ${d.notes} ${d.kind === 'chassis' ? 'chassis' : d.category} ${stateOf(d.id)}`,
      });
      if (d.kind !== 'chassis') continue;
      for (const n of d.nodes) {
        out.push({
          key: n.id,
          kind: 'node',
          name: n.name,
          detail: `Node · slot ${n.slot} of ${d.name} in ${rack.name}`,
          objectId: rack.id,
          elementId: n.id,
          text: `node ${templateText(content, n.templateId, n.templateVersion)} ${n.config} ${n.notes} ${stateOf(n.id)}`,
        });
      }
    }
    for (const r of rack.reserved) {
      out.push({ key: r.id, kind: 'reserved', name: r.label, detail: `Reserved range · ${formatURange(r)} in ${rack.name}`, objectId: rack.id, elementId: r.id, text: `reserved ${r.notes}` });
    }
  }
  for (const f of content.feeds) {
    const source = name(f.sourceId);
    out.push({
      key: f.id,
      kind: 'feed',
      name: `${name(f.rackId)} ${f.label}`,
      detail: `Power feed · from ${source}${f.way ? `, way ${f.way}` : ''}`,
      objectId: f.rackId,
      elementId: null,
      text: `power feed ${source}`,
    });
  }
  return out;
}

const NAME_EXACT = 100;
const NAME_LEADING = 60;
const NAME_CONTAINS = 40;
const ELSEWHERE = 10;

/**
 * Full-text search over everything in a room. Every word must appear in the item's name or its other
 * text; name matches rank first. Room-scoped: the views that use it all show one room.
 */
export function searchRoom(content: PlanContent, query: string, limit = MAX_HITS, stateOf: (id: string) => string = () => ''): SearchHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const phrase = words.join(' ');
  return entries(content, stateOf)
    .flatMap((e) => {
      const nameLc = e.name.toLowerCase();
      const all = `${nameLc} ${e.text.toLowerCase()}`;
      if (!words.every((w) => all.includes(w))) return [];
      const score = nameLc === phrase ? NAME_EXACT : nameLc.startsWith(phrase) ? NAME_LEADING : words.some((w) => nameLc.includes(w)) ? NAME_CONTAINS : ELSEWHERE;
      return [{ e, score }];
    })
    .sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name))
    .slice(0, limit)
    .map(({ e }) => {
      const { text: _text, ...hit } = e;
      return hit;
    });
}
