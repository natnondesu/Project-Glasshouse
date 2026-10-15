import { CATEGORY_LABEL } from './catalog';
import { racksOf } from './devices';
import { currentRevision, type RoomLocation } from './lookup';
import type { Demand, Id, PlanContent, Revision } from './model/types';
import { formatURange } from './occupancy';
import { portMix } from './ports';
import { EQUIPMENT_STATE_LABEL, equipmentStateOf } from './equipmentState';

export interface BomRow {
  project: string;
  site: string;
  room: string;
  rack: string;
  chassis: string;
  slot: string;
  kind: 'Device' | 'Chassis' | 'Node';
  state: string;
  name: string;
  model: string;
  category: string;
  position: string;
  heightU: string;
  depthMm: string;
  demandW: string;
  ports: string;
  config: string;
  notes: string;
}

export const BOM_COLUMNS: readonly { key: keyof BomRow; header: string }[] = [
  { key: 'project', header: 'Project' },
  { key: 'site', header: 'Site' },
  { key: 'room', header: 'Room' },
  { key: 'rack', header: 'Rack' },
  { key: 'chassis', header: 'Parent chassis' },
  { key: 'slot', header: 'Slot' },
  { key: 'kind', header: 'Type' },
  { key: 'state', header: 'State' },
  { key: 'name', header: 'Name' },
  { key: 'model', header: 'Template / model' },
  { key: 'category', header: 'Category' },
  { key: 'position', header: 'Position' },
  { key: 'heightU', header: 'Height (U)' },
  { key: 'depthMm', header: 'Depth (mm)' },
  { key: 'demandW', header: 'Demand (W)' },
  { key: 'ports', header: 'Ports' },
  { key: 'config', header: 'Configuration' },
  { key: 'notes', header: 'Notes' },
];

function templateText(content: PlanContent, id: Id, version: number): string {
  const t = content.templatesUsed.find((x) => x.id === id && x.version === version);
  if (!t) return '';
  return t.model ? `${t.label} (${t.model})` : t.label;
}

const demandText = (d: Demand): string => (d.kind === 'known' ? String(d.watts) : 'unknown');

export const bomRows = (loc: RoomLocation): BomRow[] => bomRowsFor(loc, currentRevision(loc.room.plan));

export function bomRowsFor(loc: RoomLocation, revision: Revision): BomRow[] {
  const content = revision.content;
  const where = { project: loc.project.name, site: loc.site.name, room: loc.room.name };
  const racks = [...racksOf(content)].sort((a, b) => a.name.localeCompare(b.name));
  return racks.flatMap((rack) =>
    [...rack.devices]
      .sort((a, b) => a.bottomU - b.bottomU)
      .flatMap((d): BomRow[] => {
        const position = formatURange(d);
        const row: BomRow = {
          ...where,
          rack: rack.name,
          chassis: '',
          slot: '',
          kind: d.kind === 'chassis' ? 'Chassis' : 'Device',
          state: EQUIPMENT_STATE_LABEL[equipmentStateOf(loc.room.plan, d.id)],
          name: d.name,
          model: templateText(content, d.templateId, d.templateVersion),
          category: CATEGORY_LABEL[d.kind === 'chassis' ? 'chassis' : d.category],
          position,
          heightU: String(d.heightU),
          depthMm: String(d.depthMm),
          demandW: demandText(d.demand),
          ports: portMix(d.ports ?? []),
          config: d.config,
          notes: d.notes,
        };
        if (d.kind !== 'chassis') return [row];
        const nodes = [...d.nodes]
          .sort((a, b) => a.slot - b.slot)
          .map(
            (n): BomRow => ({
              ...where,
              rack: rack.name,
              chassis: d.name,
              slot: String(n.slot),
              kind: 'Node',
              state: EQUIPMENT_STATE_LABEL[equipmentStateOf(loc.room.plan, n.id)],
              name: n.name,
              model: templateText(content, n.templateId, n.templateVersion),
              category: CATEGORY_LABEL.server,
              position,
              heightU: '0',
              depthMm: '',
              demandW: demandText(n.demand),
              ports: portMix(n.ports ?? []),
              config: n.config,
              notes: n.notes,
            }),
          );
        return [row, ...nodes];
      }),
  );
}

/** Cells starting with = + - @ would run as formulas in a spreadsheet; a leading quote keeps them as text. */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function bomCsv(rows: BomRow[]): string {
  const header = BOM_COLUMNS.map((c) => csvCell(c.header)).join(',');
  const body = rows.map((r) => BOM_COLUMNS.map((c) => csvCell(r[c.key])).join(','));
  return `${[header, ...body].join('\r\n')}\r\n`;
}
