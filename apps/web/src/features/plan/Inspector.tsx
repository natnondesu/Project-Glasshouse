import type { PlanContent, RoomObject } from '@glasshouse/domain';
import { ObjectInspector } from './ObjectInspector';
import { SurveyPanel } from './SurveyPanel';
import type { CommitFn } from './usePlanGestures';
import './inspector.css';

interface InspectorProps {
  content: PlanContent;
  selected: RoomObject | null;
  commit: CommitFn;
  onDeleted: () => void;
}

export function Inspector({ content, selected, commit, onDeleted }: InspectorProps) {
  return (
    <aside className="inspector" aria-label={selected ? `${selected.name} details` : 'Survey'}>
      {selected ? (
        <ObjectInspector key={selected.id} object={selected} commit={commit} onDeleted={onDeleted} />
      ) : (
        <SurveyPanel survey={content.survey} commit={commit} />
      )}
    </aside>
  );
}
