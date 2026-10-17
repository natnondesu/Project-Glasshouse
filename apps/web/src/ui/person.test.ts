import { expect, it } from 'vitest';
import { messagesFor } from '../i18n';
import { personLabel } from './person';

it('labels typed names unverified and signed-in people plainly', () => {
  const m = messagesFor('en');
  expect(personLabel(m, { name: 'Ploy' })).toBe('Ploy (unverified)');
  expect(personLabel(m, { name: 'Ploy S.', userId: 'u1' })).toBe('Ploy S.');
});
