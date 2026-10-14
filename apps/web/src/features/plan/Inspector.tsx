import type { Dimension, PlanContent, RoomObject } from '@glasshouse/domain';
import { DimensionInspector } from './DimensionInspector';
import { ObjectInspector } from './ObjectInspector';
import { SurveyPanel } from './SurveyPanel';
import type { CommitFn } from './usePlanGestures';
import './inspector.css';
import { useT } from '../../i18n';

interface InspectorProps {
  content: PlanContent;
  selected: RoomObject | null;
  commit: CommitFn;
  onDeleted: () => void;
  readOnly?: boolean;
  dimension?: Dimension | null;
  onManagePanel?: (id: string) => void;
}

export function Inspector({ content, selected, commit, onDeleted, readOnly = false, dimension = null, onManagePanel }: InspectorProps) {
  const m = useT();
  return (
    <aside className="inspector glass" aria-label={dimension ? m.inspector.dimensionDetails : selected ? m.inspector.details(selected.name) : m.inspector.surveyLabel}>
      <fieldset className="inspector__lock" disabled={readOnly}>
        {dimension ? (
          <DimensionInspector key={dimension.id} content={content} dimension={dimension} commit={commit} onDeleted={onDeleted} />
        ) : selected ? (
          <ObjectInspector key={selected.id} object={selected} content={content} commit={commit} onDeleted={onDeleted} onManagePanel={onManagePanel} />
        ) : (
          <SurveyPanel survey={content.survey} commit={commit} />
        )}
      </fieldset>
    </aside>
  );
}
