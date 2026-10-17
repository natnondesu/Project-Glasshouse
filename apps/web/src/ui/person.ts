import type { Messages } from '../i18n';

/** Signed-in people are shown by name; typed names (local mode, or imported) keep "(unverified)". */
export const personLabel = (m: Messages, p: { name: string; userId?: string }): string => (p.userId ? p.name : m.review.unverified(p.name));
