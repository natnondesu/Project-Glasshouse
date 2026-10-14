import { linkAt, portMix, type Id, type PlanContent, type Port } from '@glasshouse/domain';

export function PortsSummary({ content, deviceId, ports, onManage }: { content: PlanContent; deviceId: Id; ports: Port[]; onManage?: (id: Id) => void }) {
  const linked = ports.filter((p) => linkAt(content, { deviceId, port: p.name })).length;
  return (
    <fieldset className="inspector__group" aria-label="Network ports">
      <legend className="lbl">Network ports</legend>
      <p className="inspector__note mono">{ports.length === 0 ? 'No ports' : `${ports.length} ports · ${linked} linked`}</p>
      {ports.length > 0 ? <p className="inspector__note">{portMix(ports)}</p> : null}
      {onManage ? (
        <button type="button" className="btn btn--sm" onClick={() => onManage(deviceId)}>
          Manage ports
        </button>
      ) : null}
    </fieldset>
  );
}
