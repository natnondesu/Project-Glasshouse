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
  IconUps,
  IconWallPlug,
} from '../../ui/icons';

export type Tool = 'select' | 'pan' | 'measure' | 'dimension' | 'area' | 'cut' | RoomObjectType;
export type ToolGroupId = 'floor' | 'objects' | 'measure' | 'power';

export interface ToolSpec {
  id: Tool;
  /** Accessible name and hint title, e.g. "Place UPS". */
  label: string;
  /** Short name in a group flyout, e.g. "UPS". */
  name: string;
  hint: string;
  shortcut: string | null;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export interface ToolGroup {
  id: ToolGroupId;
  label: string;
  tools: Tool[];
}

export const TOOL_SPECS: Record<Tool, ToolSpec> = {
  select: { id: 'select', label: 'Select', name: 'Select', hint: 'Select, move and resize objects. Click empty floor to clear.', shortcut: 'V', Icon: IconSelect },
  pan: { id: 'pan', label: 'Pan', name: 'Pan', hint: 'Drag to move the view. Space+drag or two-finger scroll also pan.', shortcut: 'H', Icon: IconPan },
  area: { id: 'area', label: 'Add floor area', name: 'Add floor area', hint: 'Drag a rectangle to add floor to the room.', shortcut: 'A', Icon: IconArea },
  cut: { id: 'cut', label: 'Cut out', name: 'Cut out', hint: 'Drag a rectangle to remove floor, for columns and notches.', shortcut: 'C', Icon: IconCut },
  rack: { id: 'rack', label: 'Place rack', name: 'Rack', hint: 'Click to place a rack you will fill with devices.', shortcut: null, Icon: IconRack },
  door: { id: 'door', label: 'Place door', name: 'Door', hint: 'Click to place a door; set its hinge side in the inspector.', shortcut: null, Icon: IconDoor },
  existing_rack: { id: 'existing_rack', label: 'Place existing rack', name: 'Existing rack', hint: 'A rack already in the room that this plan does not change.', shortcut: null, Icon: IconExistingRack },
  furniture: { id: 'furniture', label: 'Place furniture', name: 'Furniture', hint: 'Desks, cabinets and other obstacles.', shortcut: null, Icon: IconFurniture },
  measure: { id: 'measure', label: 'Measure', name: 'Measure', hint: 'Click two points for a temporary measurement. Hover an object for its wall gaps.', shortcut: 'M', Icon: IconMeasure },
  dimension: { id: 'dimension', label: 'Dimension', name: 'Dimension', hint: 'Saved dimension: click two points, then where the line goes. It follows the objects.', shortcut: 'D', Icon: IconDimension },
  mcb: { id: 'mcb', label: 'Place MCB panel', name: 'MCB panel', hint: 'Wall-mounted distribution board with ways you can assign feeds to.', shortcut: 'P', Icon: IconMcb },
  wall_plug: { id: 'wall_plug', label: 'Place wall plug', name: 'Wall plug', hint: 'A standard wall socket.', shortcut: null, Icon: IconWallPlug },
  industrial_socket: { id: 'industrial_socket', label: 'Place industrial socket', name: 'Industrial socket (IEC 60309)', hint: 'A 16–32 A commando socket, typical for rack PDUs.', shortcut: null, Icon: IconIndustrialSocket },
  floor_box: { id: 'floor_box', label: 'Place floor box', name: 'Floor box', hint: 'An outlet in the floor; feeds run straight across to the rack.', shortcut: null, Icon: IconFloorBox },
  ups: { id: 'ups', label: 'Place UPS', name: 'UPS', hint: 'A standing UPS that racks can draw from.', shortcut: null, Icon: IconUps },
  pdu: { id: 'pdu', label: 'Place 3rd-party PDU', name: '3rd-party PDU', hint: "A floor-standing PDU owned by the site or a third party.", shortcut: null, Icon: IconPdu },
};

export const SOLO_TOOLS: Tool[] = ['select', 'pan'];

export const TOOL_GROUPS: ToolGroup[] = [
  { id: 'floor', label: 'Floor', tools: ['area', 'cut'] },
  { id: 'objects', label: 'Objects', tools: ['rack', 'door', 'existing_rack', 'furniture'] },
  { id: 'measure', label: 'Measure', tools: ['measure', 'dimension'] },
  { id: 'power', label: 'Power source', tools: ['mcb', 'wall_plug', 'industrial_socket', 'floor_box', 'ups', 'pdu'] },
];

/** Every tool in toolbar order, for shortcuts and lookups. */
export const TOOLS: ToolSpec[] = [...SOLO_TOOLS, ...TOOL_GROUPS.flatMap((g) => g.tools)].map((id) => TOOL_SPECS[id]);

export const toolForKey = (key: string): Tool | null =>
  TOOLS.find((t) => t.shortcut !== null && t.shortcut.toLowerCase() === key.toLowerCase())?.id ?? null;

const NON_PLACEMENT = new Set<Tool>(['select', 'pan', 'measure', 'dimension', 'area', 'cut']);
export const isPlacementTool = (tool: Tool): tool is RoomObjectType => !NON_PLACEMENT.has(tool);
