import { renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useDocumentTitle } from './useDocumentTitle';

it('names the place, then the app; with nothing to name it is just the app', () => {
  const { rerender } = renderHook(({ t }: { t: string | null }) => useDocumentTitle(t), { initialProps: { t: 'Server room A · Network' as string | null } });
  expect(document.title).toBe('Server room A · Network · Glasshouse');
  rerender({ t: null });
  expect(document.title).toBe('Glasshouse');
});
