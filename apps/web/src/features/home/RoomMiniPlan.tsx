import { cutOutKind, isRack, type PlanContent } from '@glasshouse/domain';

const W = 56;
const H = 40;
const PAD = 4;

/**
 * A room's plan at stamp size, for the workspace bar: the floor and its racks, blocking ones in red. Too small for
 * names, so it carries none; the strip's text says which room it is.
 */
export function RoomMiniPlan({ content, blocked }: { content: PlanContent; blocked: ReadonlySet<string> }) {
  const { width, length } = content.survey;
  const scale = Math.min((W - 2 * PAD) / Math.max(width, 0.1), (H - 2 * PAD) / Math.max(length, 0.1));
  const ox = (W - width * scale) / 2;
  const oy = (H - length * scale) / 2;
  const box = (r: { x: number; y: number; w: number; d: number }) => ({ x: ox + r.x * scale, y: oy + r.y * scale, width: Math.max(1, r.w * scale), height: Math.max(1, r.d * scale) });
  return (
    <svg className="mini-plan" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {content.survey.floorAreas.map((a) => (
        <rect key={a.id} {...box(a)} className="mini-plan__floor" />
      ))}
      {content.survey.cutOuts.map((c) => (
        <rect key={c.id} {...box(c)} className={cutOutKind(c) === 'void' ? 'mini-plan__void' : 'mini-plan__solid'} />
      ))}
      {content.objects.filter(isRack).map((r) => (
        <rect key={r.id} {...box(r)} className={blocked.has(r.id) ? 'mini-plan__rack is-blocked' : 'mini-plan__rack'} />
      ))}
    </svg>
  );
}
