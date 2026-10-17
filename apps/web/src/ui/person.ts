import type { Messages } from '../i18n';

export type People = Record<string, { name: string; email: string }>;

/** Typed names are marked unverified. A signed-in person is shown as they are in Users now, with their email (first names alone are ambiguous). */
export function personLabel(m: Messages, p: { name: string; userId?: string }, people: People = {}): string {
  if (!p.userId) return m.review.unverified(p.name);
  const known = people[p.userId];
  return known ? m.review.personWithEmail(known.name, known.email) : p.name;
}
