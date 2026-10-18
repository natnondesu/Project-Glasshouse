import { act } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useLangStore } from '../i18n/lang';
import { localizeError } from './errorText';

afterEach(async () => {
  await act(() => useLangStore.getState().setLang('en'));
});

const busy = { code: 'room_busy' as const, message: "Ploy is editing MDF-1. Try again when they're done.", targets: ['r'], params: { holder: 'Ploy', room: 'MDF-1' } };

it('words a busy room in the viewer’s language, from the server’s facts', async () => {
  expect(localizeError(busy).message).toBe("Ploy is editing MDF-1. Try again when they're done.");
  await act(() => useLangStore.getState().setLang('th'));
  expect(localizeError(busy).message).toBe('Ploy กำลังแก้ไข MDF-1 ลองใหม่เมื่อเขาแก้เสร็จแล้ว');
});

it('leaves errors without facts, or of other kinds, as they are', async () => {
  await act(() => useLangStore.getState().setLang('th'));
  const plain = { code: 'invalid_value' as const, message: 'Name is empty.', targets: [] };
  expect(localizeError(plain)).toBe(plain);
  const odd = { code: 'archived' as const, message: 'x', targets: [], params: { purpose: 'sing', kind: 'room' } };
  expect(localizeError(odd)).toBe(odd);
});
