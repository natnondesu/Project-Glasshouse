import { racksOf, type Id, type PlanContent, type Port } from '@glasshouse/domain';

export interface PortOwnerOption {
  id: Id;
  name: string;
  rack: string;
  ports: Port[];
}

/** Every device, chassis and node in the room, rack by rack; ones without ports can get one while linking. */
export function portOwners(content: PlanContent): PortOwnerOption[] {
  return racksOf(content).flatMap((rack) =>
    rack.devices.flatMap((d) => [
      { id: d.id, name: d.name, rack: rack.name, ports: d.ports ?? [] },
      ...(d.kind === 'chassis' ? d.nodes.map((n) => ({ id: n.id, name: n.name, rack: rack.name, ports: n.ports ?? [] })) : []),
    ]),
  );
}
