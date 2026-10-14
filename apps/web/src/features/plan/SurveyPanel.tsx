import type { Survey, SurveyPatch } from '@glasshouse/domain';
import { NumberField } from '../../ui/NumberField';
import { TextField } from '../../ui/TextField';
import { FloorRectList } from './FloorRectList';
import type { CommitFn } from './usePlanGestures';
import { useT } from '../../i18n';

export function SurveyPanel({ survey, commit }: { survey: Survey; commit: CommitFn }) {
  const m = useT();
  const set = (patch: SurveyPatch, key: string): string | null => commit({ type: 'survey/update', patch }, `survey:${key}`);
  const num = (key: 'width' | 'length' | 'powerBudget' | 'designLimitPct') => (v: number | null) => (v === null ? null : set({ [key]: v }, key));
  return (
    <div className="inspector__body">
      <header className="inspector__head">
        <h2>{m.survey.title}</h2>
        <span className="inspector__hint">{m.survey.savesAsYouType}</span>
      </header>
      <fieldset className="inspector__group">
        <legend className="lbl">{m.survey.bounds}</legend>
        <div className="field-pair">
          <NumberField id="survey-width" label={m.survey.width} unit="m" value={survey.width} onCommit={num('width')} />
          <NumberField id="survey-length" label={m.survey.length} unit="m" value={survey.length} onCommit={num('length')} />
        </div>
      </fieldset>
      <fieldset className="inspector__group">
        <legend className="lbl">{m.survey.power}</legend>
        <div className="field-pair">
          <NumberField id="survey-power" label={m.survey.budget} unit="W" decimals={0} value={survey.powerBudget} onCommit={num('powerBudget')} />
          <NumberField id="survey-limit" label={m.survey.limit} unit="%" decimals={0} value={survey.designLimitPct} onCommit={num('designLimitPct')} />
        </div>
        <p className="inspector__note">{m.survey.limitNote}</p>
      </fieldset>
      <FloorRectList title={m.survey.floorAreas} itemLabel={m.survey.area} rects={survey.floorAreas} commit={commit} emptyText={m.survey.noFloor} />
      <FloorRectList title={m.survey.cutOuts} itemLabel={m.survey.cutOut} rects={survey.cutOuts} commit={commit} emptyText={m.survey.noCutOuts} withKind />
      <fieldset className="inspector__group">
        <legend className="lbl">{m.survey.notes}</legend>
        <TextField id="survey-network" label={m.survey.network} multiline value={survey.networkHandoff} onCommit={(v) => set({ networkHandoff: v }, 'network')} />
        <TextField id="survey-notes" label={m.survey.installNotes} multiline value={survey.notes} onCommit={(v) => set({ notes: v }, 'notes')} />
      </fieldset>
    </div>
  );
}
