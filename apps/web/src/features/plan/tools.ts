import type { RoomObjectType } from '@glasshouse/domain';
import type { ComponentType, SVGProps } from 'react';
import {
  IconArea,
  IconCut,
  IconDimension,
  IconDisplayWall,
  IconDoor,
  IconExistingRack,
  IconFloorBox,
  IconFurniture,
  IconIndustrialSocket,
  IconMcb,
  IconMeasure,
  IconPan,
  IconPartition,
  IconPdu,
  IconPrecisionAc,
  IconRack,
  IconSelect,
  IconSlidingDoor,
  IconUps,
  IconWallRack,
  IconWallPlug,
  IconWallSplitAc,
} from '../../ui/icons';

/** What a placement tool drops: an object type, or a door that slides instead of swinging. */
export type PlacementTool = RoomObjectType | 'sliding_door' | 'wall_rack';
export type Tool = 'select' | 'pan' | 'measure' | 'dimension' | 'area' | 'cut' | PlacementTool;
export type ToolGroupId = 'floor' | 'racks' | 'walls' | 'furniture' | 'cooling' | 'measure' | 'power';

/** Wording (label, flyout name, hint) lives in the message catalogues under `tools.spec`. */
interface ToolSpec {
  id: Tool;
  shortcut: string | null;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

interface ToolGroup {
  id: ToolGroupId;
  /** The first tool is the group's default: its icon is the group's face and clicking the face picks it. */
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
  wall_rack: { id: 'wall_rack', shortcut: null, Icon: IconWallRack },
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
  partition: { id: 'partition', shortcut: null, Icon: IconPartition },
  wall_split_ac: { id: 'wall_split_ac', shortcut: null, Icon: IconWallSplitAc },
  precision_ac: { id: 'precision_ac', shortcut: null, Icon: IconPrecisionAc },
  display_wall: { id: 'display_wall', shortcut: null, Icon: IconDisplayWall },
};

export const SOLO_TOOLS: Tool[] = ['select', 'pan'];

export const TOOL_GROUPS: ToolGroup[] = [
  { id: 'floor', tools: ['area', 'cut'] },
  { id: 'racks', tools: ['rack', 'wall_rack', 'existing_rack'] },
  { id: 'walls', tools: ['door', 'sliding_door', 'partition'] },
  { id: 'furniture', tools: ['furniture', 'display_wall'] },
  { id: 'cooling', tools: ['wall_split_ac', 'precision_ac'] },
  { id: 'measure', tools: ['measure', 'dimension'] },
  { id: 'power', tools: ['mcb', 'wall_plug', 'industrial_socket', 'floor_box', 'ups', 'pdu'] },
];

/** Every tool in toolbar order, for shortcuts and lookups. */
const TOOLS: ToolSpec[] = [...SOLO_TOOLS, ...TOOL_GROUPS.flatMap((g) => g.tools)].map((id) => TOOL_SPECS[id]);

export const toolForKey = (key: string): Tool | null =>
  TOOLS.find((t) => t.shortcut !== null && t.shortcut.toLowerCase() === key.toLowerCase())?.id ?? null;

const NON_PLACEMENT = new Set<Tool>(['select', 'pan', 'measure', 'dimension', 'area', 'cut']);
export const isPlacementTool = (tool: Tool): tool is PlacementTool => !NON_PLACEMENT.has(tool);
