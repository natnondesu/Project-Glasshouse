import { renderHook } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { resetAuthStore, useAuthStore } from './authStore';
import { useCan } from './useCan';

beforeEach(() => resetAuthStore());
const as = (role: 'viewer' | 'editor' | 'reviewer' | 'admin') =>
  useAuthStore.setState({ status: 'signed-in', user: { id: 'u', name: 'U', email: 'u@x', role, mustChangePassword: false } });

it('follows the role ladder when signed in', () => {
  as('viewer');
  expect(renderHook(() => useCan()).result.current).toMatchObject({ edit: false, review: false, admin: false, verifiedNames: true });
  as('reviewer');
  expect(renderHook(() => useCan()).result.current).toMatchObject({ edit: true, review: true, admin: false });
  as('admin');
  expect(renderHook(() => useCan()).result.current).toMatchObject({ edit: true, review: true, admin: true });
});

it('allows everything, with typed names, when nobody signs in (local or dev mode)', () => {
  useAuthStore.setState({ status: 'dev' });
  expect(renderHook(() => useCan()).result.current).toMatchObject({ edit: true, review: true, admin: true, verifiedNames: false });
});
