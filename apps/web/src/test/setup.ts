import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom defaults to 1024px; tests run as on the 1440px laptop the app is designed for.
const LAPTOP_WIDTH_PX = 1440;
Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: LAPTOP_WIDTH_PX });

afterEach(() => {
  cleanup();
  window.innerWidth = LAPTOP_WIDTH_PX;
});

class FixedResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element): void {
    const entry = { target, contentRect: { width: 1000, height: 700 } } as unknown as ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = FixedResizeObserver as unknown as typeof ResizeObserver;

// Component tests run against the fixed generic catalog, not the shipped default (see domain test-setup).
vi.mock('../../../../packages/domain/src/default-catalog.json', async () => ({
  default: (await import('../../../../packages/domain/src/test-fixtures/generic-catalog.json')).default,
}));
