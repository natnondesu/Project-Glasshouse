import { dimensionLength, formatMetres, type Dimension, type PlanContent } from '@glasshouse/domain';
import { NumberField } from '../../ui/NumberField';
import { IconTrash } from '../../ui/icons';
import { describeAnchor } from './DimensionLayer';
import type { CommitFn } from './usePlanGestures';
import { useT } from '../../i18n';

interface DimensionInspectorProps {
  content: PlanContent;
  dimension: Dimension;
  commit: CommitFn;
  onDeleted: () => void;
}

export function DimensionInspector({ content, dimension, commit, onDeleted }: DimensionInspectorProps) {
  const m = useT();
  const length = dimensionLength(content, dimension);
  const follows = [dimension.a, dimension.b].some((x) => x.kind === 'object');
  return (
    <div className="inspector__body">
      <header className="inspector__head">
        <h2>{m.dimension.title}</h2>
        <span className="inspector__meta mono">{`${formatMetres(length)} m`}</span>
      </header>
      <dl className="dim-facts">
        <dt>{m.dimension.from}</dt>
        <dd>{describeAnchor(m, content, dimension.a)}</dd>
        <dt>{m.dimension.to}</dt>
        <dd>{describeAnchor(m, content, dimension.b)}</dd>
      </dl>
      <p className="inspector__note">
        {follows ? m.dimension.follows : m.dimension.fixed}
      </p>
      <NumberField
        id={`${dimension.id}-offset`}
        label={m.dimension.offset}
        unit="m"
        commitOn="blur"
        value={dimension.offset}
        onCommit={(v) => commit({ type: 'dimension/update', id: dimension.id, patch: { offset: v ?? 0 } })}
      />
      <p className="inspector__note">{m.dimension.offsetNote}</p>
      <button
        type="button"
        className="btn btn--danger"
        onClick={() => {
          if (commit({ type: 'dimension/remove', id: dimension.id }) === null) onDeleted();
        }}
      >
        <IconTrash />
        {m.dimension.delete}
      </button>
    </div>
  );
}
