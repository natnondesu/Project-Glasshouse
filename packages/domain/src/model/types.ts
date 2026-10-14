export type Id = string;
export type Metres = number;
export type Millimetres = number;
export type Units = number;
export type Watts = number;

/** Demand is either known or explicitly unknown — never an implied zero. */
export type Demand = { kind: 'known'; watts: Watts } | { kind: 'unknown' };

export type Category = 'compute' | 'storage' | 'network' | 'power' | 'chassis';
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
}

export interface Rect {
  id: Id;
  x: Metres;
  y: Metres;
  w: Metres;
  d: Metres;
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

export type SimpleObjectType = 'existing_rack' | 'door' | 'mcb' | 'furniture';

export type DoorHinge = 'left' | 'right';

export interface SimpleObject extends ObjectBase {
  type: SimpleObjectType;
  /** Doors only: the end the leaf hangs from, seen from the swing side. Absent means left. */
  hinge?: DoorHinge;
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
  rackId: Id;
  /** The MCB panel it is fed from. */
  sourceId: Id;
  label: string;
}

export interface PlanContent {
  survey: Survey;
  objects: RoomObject[];
  templatesUsed: Template[];
  dimensions: Dimension[];
  feeds: PowerFeed[];
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

export interface HistoryEvent {
  revision: number;
  action: string;
  at: string;
}

/** The last Revision is the current one; a Plan always has at least one. */
export interface Plan {
  revisions: Revision[];
  notes: ReviewNote[];
  history: HistoryEvent[];
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
