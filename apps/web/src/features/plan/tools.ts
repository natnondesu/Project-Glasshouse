import type { RoomObjectType } from '@glasshouse/domain';
import type { ComponentType, SVGProps } from 'react';
import {
  IconArea,
  IconCut,
  IconDimension,
  IconDoor,
  IconExistingRack,
  IconFloorBox,
  IconFurniture,
  IconIndustrialSocket,
  IconMcb,
  IconMeasure,
  IconPan,
  IconPdu,
  IconRack,
  IconSelect,
  IconSlidingDoor,
  IconUps,
  IconWallPlug,
} from '../../ui/icons';

/** What a placement tool drops: an object type, or a door that slides instead of swinging. */
export type PlacementTool = RoomObjectType | 'sliding_door';
export type Tool = 'select' | 'pan' | 'measure' | 'dimension' | 'area' | 'cut' | PlacementTool;
export type ToolGroupId = 'floor' | 'objects' | 'measure' | 'power';

/** Wording (label, flyout name, hint) lives in the message catalogues under `tools.spec`. */
export interface ToolSpec {
  id: Tool;
  shortcut: string | null;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export interface ToolGroup {
  id: ToolGroupId;
  tools: Tool[];
}

export const TOOL_SPECS: Record<Tool, ToolSpec> = {
  select: { id: 'select', shortcut: 'V', Icon: IconSelect },
  pan: { id: 'pan', shortcut: 'H', Icon: IconPan },
  area: { id: 'area', shortcut: 'A', Icon: IconArea },
  cut: { id: 'cut', shortcut: 'C', Icon: IconCut },
  rack: { id: 'rack', shortcut: null, Icon: IconRack },
  door: { id: 'door', shortcut: null, Icon: IconDoor },
  sliding_door: { id: 'sliding_door', shortcut: null, Icon: IconSlidingDoor },
  existing_rack: { id: 'existing_rack', shortcut: null, Icon: IconExistingRack },
  furniture: { id: 'furniture', shortcut: null, Icon: IconFurniture },
  measure: { id: 'measure', shortcut: 'M', Icon: IconMeasure },
  dimension: { id: 'dimension', shortcut: 'D', Icon: IconDimension },
  mcb: { id: 'mcb', shortcut: 'P', Icon: IconMcb },
  wall_plug: { id: 'wall_plug', shortcut: null, Icon: IconWallPlug },
  industrial_socket: { id: 'industrial_socket', shortcut: null, Icon: IconIndustrialSocket },
  floor_box: { id: 'floor_box', shortcut: null, Icon: IconFloorBox },
  ups: { id: 'ups', shortcut: null, Icon: IconUps },
  pdu: { id: 'pdu', shortcut: null, Icon: IconPdu },
};

export const SOLO_TOOLS: Tool[] = ['select', 'pan'];

export const TOOL_GROUPS: ToolGroup[] = [
  { id: 'floor', tools: ['area', 'cut'] },
  { id: 'objects', tools: ['rack', 'door', 'sliding_door', 'existing_rack', 'furniture'] },
  { id: 'measure', tools: ['measure', 'dimension'] },
  { id: 'power', tools: ['mcb', 'wall_plug', 'industrial_socket', 'floor_box', 'ups', 'pdu'] },
];

/** Every tool in toolbar order, for shortcuts and lookups. */
export const TOOLS: ToolSpec[] = [...SOLO_TOOLS, ...TOOL_GROUPS.flatMap((g) => g.tools)].map((id) => TOOL_SPECS[id]);

export const toolForKey = (key: string): Tool | null =>
  TOOLS.find((t) => t.shortcut !== null && t.shortcut.toLowerCase() === key.toLowerCase())?.id ?? null;

const NON_PLACEMENT = new Set<Tool>(['select', 'pan', 'measure', 'dimension', 'area', 'cut']);
export const isPlacementTool = (tool: Tool): tool is PlacementTool => !NON_PLACEMENT.has(tool);
