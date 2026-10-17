import { expect, it } from 'vitest';
import { messagesFor } from '../i18n';
import { personLabel } from './person';

const m = messagesFor('en');

it('labels a typed name unverified', () => {
  expect(personLabel(m, { name: 'Ploy' })).toBe('Ploy (unverified)');
});

it('shows a verified person as they are in Users now, with their email', () => {
  const people = { u1: { name: 'Ploy Sriwan', email: 'ploy@x.test' } };
  expect(personLabel(m, { name: 'Ploy', userId: 'u1' }, people)).toBe('Ploy Sriwan (ploy@x.test)');
});

it('shows the stored name alone when the person is not in the directory', () => {
  expect(personLabel(m, { name: 'Ploy S.', userId: 'u1' })).toBe('Ploy S.');
  expect(personLabel(m, { name: 'Ploy S.', userId: 'u1' }, { u2: { name: 'Other', email: 'o@x' } })).toBe('Ploy S.');
});
