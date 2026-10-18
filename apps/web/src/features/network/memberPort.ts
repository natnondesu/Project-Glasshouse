import { stackOf, type PlanContent, type PortRef } from '@glasshouse/domain';

/** "S2 GE1/0/3" for a port on a stack member: the members of a stack often share port names. */
export function memberPort(content: PlanContent, ref: PortRef): string {
  const on = stackOf(content, ref.deviceId);
  return on ? `S${on.member} ${ref.port}` : ref.port;
}
