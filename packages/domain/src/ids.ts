import type { Id } from './model/types';

// `crypto` is a web-standard global in browsers and Node; typed locally so the domain keeps an ES-only lib.
const cryptoApi = (globalThis as unknown as { crypto: { randomUUID(): string } }).crypto;

export const newId = (): Id => cryptoApi.randomUUID();
