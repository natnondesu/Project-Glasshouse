import { expandPorts, faceplateBlocks, PORT_MEDIA_LABEL, type PortGroup } from '@glasshouse/domain';
import { useT } from '../../i18n';
import { Faceplate } from '../ports/Faceplate';
import '../ports/ports.css';

/** The template's front panel as placed devices will show it, redrawn as the port groups change. */
export function FrontPanel({ groups, heightU }: { groups: PortGroup[]; heightU: number }) {
  const m = useT();
  const ports = expandPorts(groups);
  return (
    <section className="front-panel" aria-label={m.catalog.frontPanel}>
      <h2 className="lbl">{m.catalog.frontPanel}</h2>
      {ports.length === 0 ? (
        <p className="front-panel__empty">{m.catalog.frontPanelEmpty}</p>
      ) : (
        <div className="front-panel__face" data-u={heightU}>
          <Faceplate
            blocks={faceplateBlocks(groups, ports)}
            label={m.catalog.frontPanel}
            jack={(p, short) => (
              <span className={`port port--${p.media} port--static`} title={`${p.name} · ${PORT_MEDIA_LABEL[p.media]} ${p.speed}`}>
                <span className="port__jack" aria-hidden="true" />
                <span className="port__name mono">{short}</span>
              </span>
            )}
          />
        </div>
      )}
    </section>
  );
}
