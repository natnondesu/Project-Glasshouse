# Glasshouse

Glasshouse turns a site survey into a measured room and rack installation plan that onsite staff, IT and reviewers share.

## Language

### Organization

**Project**:
A customer engagement or deployment that groups one or more physical Sites.
_Avoid_: Job, engagement, workspace

**Site**:
A physical location (building or premises) belonging to one Project, containing one or more Rooms.
_Avoid_: Location, branch, facility

**Room**:
A single surveyed physical space within a Site where racks and equipment are installed.
_Avoid_: Server room, closet, area

**Plan**:
The installation design for exactly one Room; the unit that is revised, reviewed and exported.
_Avoid_: Project (when meaning a single room's design), drawing, layout

### Survey

**Survey**:
The measured physical description of a Room — footprint, Power budget, network handoff and notes — frozen with each Revision.
_Avoid_: Site survey (when meaning the Site), room info

**Footprint**:
The usable floor outline of a Room, built from Floor areas minus Cut-outs, measured to 10 cm.
_Avoid_: Floor mask, floor cells, room shape

**Floor area**:
A rectangle added to a Room's Footprint.
_Avoid_: Cell, tile, paint

**Cut-out**:
A rectangle removed from a Room's Footprint, such as a column or notch.
_Avoid_: Hole, erase

### Room objects

**Rack**:
A rack in a Room that Devices are planned into, whether owned by OxygenAI or the customer.
_Avoid_: Own rack, cabinet

**Rack owner**:
An informational label on a Rack, either OxygenAI or Customer; it does not change planning rules.
_Avoid_: Rack type

**Reserved range**:
A labelled span of U in a Rack occupied by hardware Glasshouse does not model, such as existing customer gear.
_Avoid_: Blocked U, customer device, placeholder device

**Usable depth**:
The maximum Device depth in millimetres a Rack can physically accept; a Rack device deeper than this blocks approval.
_Avoid_: Rack depth (which is the external footprint)

**Front** / **Rear**:
The two access faces of a Rack, which define its facing direction in the Room.
_Avoid_: Side A/B, face

**Clearance zone**:
The floor area in front of or behind a Rack that must stay free of obstacles so the Rack can be accessed and serviced.
_Avoid_: Aisle, keep-out, service area

**Existing rack**:
A rack in the Room that is not planned into; it is treated as a physical obstacle only.
_Avoid_: Other rack, blackbox rack, customer rack

### Power

**Demand**:
The estimated power draw in watts of a Device, Chassis overhead or Reserved range; either a known value or explicitly unknown, never an implied zero.
_Avoid_: Load, consumption, wattage (as a field name)

**Power budget**:
The total power available to a Room, as entered from the survey.
_Avoid_: Capacity, power limit

**Design limit**:
The share of the Power budget a Plan may use, set per Plan with a default of 80%; a planning rule, not an electrical rule.
_Avoid_: Headroom, threshold

**Acknowledged unknown**:
A Reserved range whose Demand is unknown and that a reviewer has explicitly accepted with a recorded reason.
_Avoid_: Waiver, exception

### Review

**Revision**:
A numbered version of a Plan; only the Draft revision is editable, and every submitted Revision is frozen as a Snapshot.
_Avoid_: Version, iteration

**Snapshot**:
The frozen, unchangeable copy of a Plan's content taken when a Revision is submitted for review.
_Avoid_: Baseline, backup, save point

**Draft** / **In review** / **Approved**:
The three Revision states in the MVP; editing an Approved Plan starts a new Draft Revision.
_Avoid_: Published (reserved for authoritative publication in a later stage)

**Review note**:
An issue raised against the current Revision that must be resolved before approval.
_Avoid_: Comment, ticket

**Unverified name**:
A typed person name recorded on submission or approval without login, labelled as unverified wherever it appears.
_Avoid_: User, actor, signature

### Hand-off

**Project file**:
A portable file containing one Project's full Site/Room/Plan tree, Revisions, Snapshots, Review notes and the Templates it uses; the MVP's only way to move work between people.
_Avoid_: Export, backup, dump

**Workspace backup**:
A file containing everything in one browser's workspace, including the whole Catalog, used to recover from lost browser storage.
_Avoid_: Project file, sync

**Install sheet**:
The printable installation document generated from an Approved Revision: room plan, Rack elevations, Chassis Slot maps and BOM.
_Avoid_: Installation pack, printout, report

**BOM**:
The flat list of every Device in a Revision, one row per Device including each Node, with its location.
_Avoid_: Inventory, equipment list, parts list

### Catalog

**Catalog**:
The single workspace-wide collection of Templates, shared by every Project.
_Avoid_: Library, device list, per-project catalog

**Template**:
A reusable equipment definition in the Catalog; placing it copies its properties, so later Template edits never change placed equipment.
_Avoid_: Model, preset, SKU

### Devices

**Device**:
Any piece of hardware placed in a Plan, created from a Template.
_Avoid_: Equipment, item, instance

**Rack device**:
A Device mounted in a Rack that occupies a contiguous range of U.
_Avoid_: Rack-mounted equipment, server (as a generic term)

**Chassis**:
A Rack device that contains numbered Slots for Nodes.
_Avoid_: Enclosure, blade chassis, box

**Slot**:
One numbered position inside a Chassis that holds at most one Node.
_Avoid_: Bay, position

**Node**:
A Device mounted in a Chassis Slot; it inherits its Rack and U from the Chassis and occupies no U itself.
_Avoid_: Internal computer, blade, child, server
