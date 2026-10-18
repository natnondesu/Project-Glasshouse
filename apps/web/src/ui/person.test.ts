import { describe, expect, it } from 'vitest';
import { messagesFor, useLangStore } from '../i18n';
import { directoryOf, personLabel, recordedName } from './person';

const m = messagesFor('en');

it('labels a typed name unverified', () => {
  expect(personLabel(m, { name: 'Ploy' })).toBe('Ploy (unverified)');
});

it('shows a verified person as they are in Users now, with their email', () => {
  const people = directoryOf({ u1: { name: 'Ploy Sriwan', email: 'ploy@x.test' } });
  expect(personLabel(m, { name: 'Ploy', userId: 'u1' }, people)).toBe('Ploy Sriwan (ploy@x.test)');
});

it('shows the stored name alone when the person is not in the directory', () => {
  expect(personLabel(m, { name: 'Ploy S.', userId: 'u1' })).toBe('Ploy S.');
  expect(personLabel(m, { name: 'Ploy S.', userId: 'u1' }, directoryOf({ u2: { name: 'Other', email: 'o@x' } }))).toBe('Ploy S.');
});

describe('a person whose account was removed', () => {
  const people = directoryOf({ u2: { name: 'Other', email: 'o@x' } }, ['u1']);

  it('keeps the recorded name and marks it removed, in English and Thai', async () => {
    await useLangStore.getState().setLang('th');
    await useLangStore.getState().setLang('en');
    expect(personLabel(m, { name: 'Ploy S.', userId: 'u1' }, people)).toBe('Ploy S. (removed)');
    expect(personLabel(messagesFor('th'), { name: 'Ploy S.', userId: 'u1' }, people)).toBe('Ploy S. (ลบแล้ว)');
  });

  it('marks a recorded name from a note or a history line the same way, and leaves present and typed names alone', () => {
    expect(recordedName(m, 'Ploy S.', 'u1', people)).toBe('Ploy S. (removed)');
    expect(recordedName(m, 'Other', 'u2', people)).toBe('Other');
    expect(recordedName(m, 'Typed', undefined, people)).toBe('Typed');
  });

  it('never marks anyone removed while the directory has not been confirmed', () => {
    expect(personLabel(m, { name: 'Ploy S.', userId: 'u1' }, directoryOf({}))).toBe('Ploy S.');
  });
});
