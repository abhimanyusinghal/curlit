import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  // Electron main/preload tests run in Vitest's Node environment, where the
  // browser storage shim is intentionally unavailable.
  if (typeof localStorage !== 'undefined') localStorage.clear();
});
