import { linkAt, portMix, type Id, type PlanContent, type Port } from '@glasshouse/domain';
import './ports.css';
import { useT } from '../../i18n';

export function PortsSummary({ content, deviceId, ports, onManage }: { content: PlanContent; deviceId: Id; ports: Port[]; onManage?: (id: Id) => void }) {
  const m = useT();
  const linked = ports.filter((p) => linkAt(content, { deviceId, port: p.name })).length;
  return (
    <fieldset className="inspector__group" aria-label={m.ports.group}>
      <legend className="lbl">{m.ports.group}</legend>
      <p className="inspector__note mono">{ports.length === 0 ? m.ports.none : m.ports.summary(ports.length, linked)}</p>
      {ports.length > 0 ? <p className="inspector__note">{portMix(ports)}</p> : null}
      {onManage ? (
        <button type="button" className="btn btn--sm ports-summary__manage" onClick={() => onManage(deviceId)}>
          {m.ports.manage}
        </button>
      ) : null}
    </fieldset>
  );
}
