import { CATEGORY_LABEL, type Template } from '@glasshouse/domain';

const fold = (s: string): string => s.toLocaleLowerCase().normalize('NFKD').replace(/\p{M}/gu, '');

/**
 * Templates matching every word of `query` in their name, model, or category (English or the
 * shown language), plus their height as "2u". An empty query keeps everything.
 */
export function filterTemplates(templates: Template[], query: string, categoryName: (t: Template) => string): Template[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return templates;
  return templates.filter((t) => {
    const hay = fold([t.label, t.model, CATEGORY_LABEL[t.category], categoryName(t), t.mounting === 'rack' ? `${t.heightU}u` : ''].join(' '));
    return words.every((w) => hay.includes(w));
  });
}
