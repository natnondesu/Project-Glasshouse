import type { RoomObjectType } from '@glasshouse/domain';
import type { ComponentType, SVGProps } from 'react';
import { IconArea, IconCut, IconDoor, IconExistingRack, IconFurniture, IconMcb, IconPan, IconRack, IconSelect } from '../../ui/icons';

export type Tool = 'select' | 'pan' | 'area' | 'cut' | RoomObjectType;

export interface ToolSpec {
  id: Tool;
  label: string;
  shortcut: string | null;
  group: 'navigate' | 'floor' | 'place';
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export const TOOLS: ToolSpec[] = [
  { id: 'select', label: 'Select', shortcut: 'V', group: 'navigate', Icon: IconSelect },
  { id: 'pan', label: 'Pan', shortcut: 'H', group: 'navigate', Icon: IconPan },
  { id: 'area', label: 'Add floor area', shortcut: 'A', group: 'floor', Icon: IconArea },
  { id: 'cut', label: 'Cut out', shortcut: 'C', group: 'floor', Icon: IconCut },
  { id: 'rack', label: 'Place rack', shortcut: null, group: 'place', Icon: IconRack },
  { id: 'door', label: 'Place door', shortcut: null, group: 'place', Icon: IconDoor },
  { id: 'mcb', label: 'Place MCB panel', shortcut: null, group: 'place', Icon: IconMcb },
  { id: 'existing_rack', label: 'Place existing rack', shortcut: null, group: 'place', Icon: IconExistingRack },
  { id: 'furniture', label: 'Place furniture', shortcut: null, group: 'place', Icon: IconFurniture },
];

export const toolForKey = (key: string): Tool | null =>
  TOOLS.find((t) => t.shortcut !== null && t.shortcut.toLowerCase() === key.toLowerCase())?.id ?? null;

export const isPlacementTool = (tool: Tool): tool is RoomObjectType =>
  tool !== 'select' && tool !== 'pan' && tool !== 'area' && tool !== 'cut';
