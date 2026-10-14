import type { Survey, SurveyPatch } from '@glasshouse/domain';
import { NumberField } from '../../ui/NumberField';
import { TextField } from '../../ui/TextField';
import { FloorRectList } from './FloorRectList';
import type { CommitFn } from './usePlanGestures';

export function SurveyPanel({ survey, commit }: { survey: Survey; commit: CommitFn }) {
  const set = (patch: SurveyPatch, key: string): string | null => commit({ type: 'survey/update', patch }, `survey:${key}`);
  const num = (key: 'width' | 'length' | 'powerBudget' | 'designLimitPct') => (v: number | null) => (v === null ? null : set({ [key]: v }, key));
  return (
    <div className="inspector__body">
      <header className="inspector__head">
        <h2>Survey</h2>
        <span className="inspector__hint">Changes save as you type</span>
      </header>
      <fieldset className="inspector__group">
        <legend className="lbl">Room bounds</legend>
        <div className="field-pair">
          <NumberField id="survey-width" label="Width" unit="m" value={survey.width} onCommit={num('width')} />
          <NumberField id="survey-length" label="Length" unit="m" value={survey.length} onCommit={num('length')} />
        </div>
      </fieldset>
      <fieldset className="inspector__group">
        <legend className="lbl">Power</legend>
        <div className="field-pair">
          <NumberField id="survey-power" label="Power budget" unit="W" decimals={0} value={survey.powerBudget} onCommit={num('powerBudget')} />
          <NumberField id="survey-limit" label="Design limit" unit="%" decimals={0} value={survey.designLimitPct} onCommit={num('designLimitPct')} />
        </div>
        <p className="inspector__note">The design limit is a planning rule, not an electrical rule.</p>
      </fieldset>
      <FloorRectList title="Floor areas" itemLabel="Area" rects={survey.floorAreas} commit={commit} emptyText="No floor yet. Drag a rectangle with Add floor area." />
      <FloorRectList title="Cut-outs" itemLabel="Cut-out" rects={survey.cutOuts} commit={commit} emptyText="No cut-outs. Use Cut out for columns, walls and voids." withKind />
      <fieldset className="inspector__group">
        <legend className="lbl">Notes</legend>
        <TextField id="survey-network" label="Network handoff" multiline value={survey.networkHandoff} onCommit={(v) => set({ networkHandoff: v }, 'network')} />
        <TextField id="survey-notes" label="Installation notes" multiline value={survey.notes} onCommit={(v) => set({ notes: v }, 'notes')} />
      </fieldset>
    </div>
  );
}
