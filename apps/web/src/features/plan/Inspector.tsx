import type { Dimension, PlanContent, RoomObject } from '@glasshouse/domain';
import { DimensionInspector } from './DimensionInspector';
import { ObjectInspector } from './ObjectInspector';
import { SurveyPanel } from './SurveyPanel';
import type { CommitFn } from './usePlanGestures';
import './inspector.css';

interface InspectorProps {
  content: PlanContent;
  selected: RoomObject | null;
  commit: CommitFn;
  onDeleted: () => void;
  readOnly?: boolean;
  dimension?: Dimension | null;
}

export function Inspector({ content, selected, commit, onDeleted, readOnly = false, dimension = null }: InspectorProps) {
  return (
    <aside className="inspector glass" aria-label={dimension ? 'Dimension details' : selected ? `${selected.name} details` : 'Survey'}>
      <fieldset className="inspector__lock" disabled={readOnly}>
        {dimension ? (
          <DimensionInspector key={dimension.id} content={content} dimension={dimension} commit={commit} onDeleted={onDeleted} />
        ) : selected ? (
          <ObjectInspector key={selected.id} object={selected} commit={commit} onDeleted={onDeleted} />
        ) : (
          <SurveyPanel survey={content.survey} commit={commit} />
        )}
      </fieldset>
    </aside>
  );
}
