import { dimensionLength, formatMetres, type Dimension, type PlanContent } from '@glasshouse/domain';
import { NumberField } from '../../ui/NumberField';
import { IconTrash } from '../../ui/icons';
import { describeAnchor } from './DimensionLayer';
import type { CommitFn } from './usePlanGestures';

interface DimensionInspectorProps {
  content: PlanContent;
  dimension: Dimension;
  commit: CommitFn;
  onDeleted: () => void;
}

export function DimensionInspector({ content, dimension, commit, onDeleted }: DimensionInspectorProps) {
  const length = dimensionLength(content, dimension);
  const follows = [dimension.a, dimension.b].some((x) => x.kind === 'object');
  return (
    <div className="inspector__body">
      <header className="inspector__head">
        <h2>Dimension</h2>
        <span className="inspector__meta mono">{`${formatMetres(length)} m`}</span>
      </header>
      <dl className="dim-facts">
        <dt>From</dt>
        <dd>{describeAnchor(content, dimension.a)}</dd>
        <dt>To</dt>
        <dd>{describeAnchor(content, dimension.b)}</dd>
      </dl>
      <p className="inspector__note">
        {follows ? 'Follows the objects it is attached to: the length updates when they move.' : 'Fixed between two points on the floor.'}
      </p>
      <NumberField
        id={`${dimension.id}-offset`}
        label="Line offset"
        unit="m"
        commitOn="blur"
        value={dimension.offset}
        onCommit={(v) => commit({ type: 'dimension/update', id: dimension.id, patch: { offset: v ?? 0 } })}
      />
      <p className="inspector__note">Moves the dimension line clear of objects. Negative values move it to the other side.</p>
      <button
        type="button"
        className="btn btn--danger"
        onClick={() => {
          if (commit({ type: 'dimension/remove', id: dimension.id }) === null) onDeleted();
        }}
      >
        <IconTrash />
        Delete dimension
      </button>
    </div>
  );
}
