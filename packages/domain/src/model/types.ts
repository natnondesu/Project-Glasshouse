export type Id = string;
export type Metres = number;
export type Millimetres = number;
export type Units = number;
export type Watts = number;

/** Demand is either known or explicitly unknown — never an implied zero. */
export type Demand = { kind: 'known'; watts: Watts } | { kind: 'unknown' };

/** `misc` is for passive rack gear: patch panels, cable management, blanking panels, shelves. */
export type Category = 'compute' | 'storage' | 'network' | 'power' | 'chassis' | 'misc';
export type Mounting = 'rack' | 'slot';

export interface Template {
  id: Id;
  version: number;
  label: string;
  model: string;
  category: Category;
  mounting: Mounting;
  heightU: Units;
  depthMm: Millimetres;
  demand: Demand;
  color: string;
  defaultConfig: string;
  slotCount: number | null;
  slotsPerRow: number | null;
  illustrative: boolean;
  /** Network ports every device from this template starts with, as compact groups. */
  ports?: PortGroup[];
}

export type PortMedia = 'rj45' | 'sfp' | 'sfp_plus' | 'qsfp';

/** `count` ports named prefix+start, prefix+(start+1)…: "48 × RJ45 1G named Gi1/0/1–48". */
export interface PortGroup {
  count: number;
  prefix: string;
  start: number;
  media: PortMedia;
  speed: string;
}

/** A device's own port. Names are unique per device and are how links refer to it. */
export interface Port {
  name: string;
  media: PortMedia;
  speed: string;
  /** Unset: not configured. */
  vlan?: PortVlan;
}

/** A room VLAN; the VLAN ID is its identity, as on the switches. */
export interface Vlan {
  vid: number;
  name: string;
}

/** Access carries one VLAN untagged; a trunk carries `allowed` tagged, plus `native` untagged. */
export type PortVlan = { mode: 'access'; vid: number } | { mode: 'trunk'; allowed: number[] | 'all'; native: number | null };

export type CableType = 'cat6' | 'cat6a' | 'om3' | 'om4' | 'os2' | 'dac' | 'aoc';

export interface PortRef {
  deviceId: Id;
  port: string;
}

/** One cable between two ports, either end on a device, chassis or node. */
export interface NetLink {
  id: Id;
  a: PortRef;
  b: PortRef;
  label: string;
  cable: CableType | null;
}

/** A cut-out is either a void (no floor: a shaft or opening) or solid (a wall or column). */
export type CutOutKind = 'void' | 'solid';

export interface Rect {
  id: Id;
  x: Metres;
  y: Metres;
  w: Metres;
  d: Metres;
  /** Cut-outs only; absent means solid. */
  kind?: CutOutKind;
}

/** width/length are the room's bounding canvas; the Footprint is floorAreas minus cutOuts. */
export interface Survey {
  width: Metres;
  length: Metres;
  floorAreas: Rect[];
  cutOuts: Rect[];
  powerBudget: Watts;
  designLimitPct: number;
  networkHandoff: string;
  notes: string;
}

/** x/y is the top-left of the rotated object's axis-aligned bounding box. */
export interface ObjectBase {
  id: Id;
  name: string;
  x: Metres;
  y: Metres;
  w: Metres;
  d: Metres;
  angle: number;
  height: Metres | null;
  notes: string;
}

export type RackOwner = 'oxygenai' | 'customer';

export interface DeviceBase {
  id: Id;
  templateId: Id;
  templateVersion: number;
  name: string;
  demand: Demand;
  config: string;
  notes: string;
  /** Copied from the template when placed, then the device's own; absent means none. */
  ports?: Port[];
}

export interface PlacedDevice extends DeviceBase {
  kind: 'device';
  category: Category;
  bottomU: Units;
  heightU: Units;
  depthMm: Millimetres;
}

export interface Node extends DeviceBase {
  slot: number;
}

/** A Chassis's own `demand` is its chassis-only overhead; each Node carries its own Demand. */
export interface Chassis extends DeviceBase {
  kind: 'chassis';
  bottomU: Units;
  heightU: Units;
  depthMm: Millimetres;
  slotCount: number;
  slotsPerRow: number;
  nodes: Node[];
}

export type RackDevice = PlacedDevice | Chassis;

export interface ReservedRange {
  id: Id;
  label: string;
  bottomU: Units;
  heightU: Units;
  demand: Demand;
  notes: string;
}

export interface Rack extends ObjectBase {
  type: 'rack';
  capacityU: Units;
  usableDepthMm: Millimetres;
  owner: RackOwner;
  clearance: { front: Metres; rear: Metres };
  devices: RackDevice[];
  reserved: ReservedRange[];
}

export type SimpleObjectType = 'existing_rack' | 'door' | 'mcb' | 'furniture' | 'wall_plug' | 'industrial_socket' | 'floor_box' | 'ups' | 'pdu';

export type PanelPhase = 'single' | 'three';

export interface PanelWay {
  /** Breaker rating in amps. */
  ratingA: number;
  label: string;
}

/** An MCB panel's ways (breaker slots). Absent on the object means the default panel. */
export interface PanelConfig {
  phase: PanelPhase;
  ways: PanelWay[];
}

export type DoorHinge = 'left' | 'right';

export interface SimpleObject extends ObjectBase {
  type: SimpleObjectType;
  /** Doors only: the end the leaf hangs from, seen from the swing side. Absent means left. */
  hinge?: DoorHinge;
  /** MCB panels only. */
  panel?: PanelConfig;
}

export type RoomObject = Rack | SimpleObject;
export type RoomObjectType = RoomObject['type'];

export interface UnverifiedName {
  name: string;
  at: string;
}

export interface AcknowledgedUnknown {
  reservedRangeId: Id;
  reason: string;
  by: UnverifiedName;
}

/**
 * One end of a persistent Dimension. An object anchor is stored in the object's own frame
 * (u, v as fractions of w and d from its centre), so the dimension follows moves, rotations and resizes.
 */
export type DimensionAnchor = { kind: 'point'; x: Metres; y: Metres } | { kind: 'object'; objectId: Id; u: number; v: number };

export interface Dimension {
  id: Id;
  a: DimensionAnchor;
  b: DimensionAnchor;
  /** Perpendicular distance of the dimension line from the measured points; positive along (−Δy, Δx) of a→b. */
  offset: Metres;
}

/** A rack's power connection to an MCB panel. A rack may have several (A and B feeds). */
export interface PowerFeed {
  id: Id;
  /** What it powers: a rack, or another power source (a UPS fed from an MCB, a PDU from a UPS…). */
  targetId: Id;
  /** The power source it is fed from. */
  sourceId: Id;
  label: string;
  /** The MCB way (1-based) this feed is wired to; only for MCB sources. */
  way?: number;
}

export interface PlanContent {
  survey: Survey;
  objects: RoomObject[];
  templatesUsed: Template[];
  dimensions: Dimension[];
  feeds: PowerFeed[];
  links: NetLink[];
  vlans: Vlan[];
}

export type RevisionState = 'draft' | 'in_review' | 'approved';

export interface Revision {
  number: number;
  state: RevisionState;
  content: PlanContent;
  designedBy: UnverifiedName | null;
  approvedBy: UnverifiedName | null;
  submittedAt: string | null;
  approvedAt: string | null;
  acknowledgements: AcknowledgedUnknown[];
}

export interface ReviewNote {
  id: Id;
  text: string;
  resolved: boolean;
  createdAt: string;
}

export type HistoryCode = 'submitted' | 'approved' | 'new_draft' | 'draft_discarded' | 'acknowledged' | 'unacknowledged' | 'note_added' | 'note_resolved' | 'note_reopened';

export interface HistoryEvent {
  revision: number;
  /** English wording as recorded; events from before 2026-10 have only this. */
  action: string;
  at: string;
  /** Lets the UI word the event in the viewer's language. */
  code?: HistoryCode;
  params?: Record<string, string | number>;
}

/** The last Revision is the current one; a Plan always has at least one. */
/** What is physically true on site for a piece of equipment. Absent means planned. */
export type EquipmentState = 'planned' | 'deployed' | 'maintenance';

export interface Plan {
  revisions: Revision[];
  notes: ReviewNote[];
  history: HistoryEvent[];
  /** Per device, chassis or node; outside revisions so it can change after approval. */
  equipmentState: Record<Id, EquipmentState>;
}

export interface Room {
  id: Id;
  name: string;
  notes: string;
  plan: Plan;
}

export interface Site {
  id: Id;
  name: string;
  notes: string;
  rooms: Room[];
}

export interface Project {
  id: Id;
  name: string;
  notes: string;
  isSample: boolean;
  sites: Site[];
}

export interface Workspace {
  schemaVersion: number;
  projects: Project[];
  catalog: Template[];
  lastBackupAt: string | null;
}

export const isRack = (o: RoomObject): o is Rack => o.type === 'rack';
