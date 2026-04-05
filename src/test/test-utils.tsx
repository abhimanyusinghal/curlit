import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';
import { useAppStore } from '../store';

// Reset store to initial state before each test
export function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

// Re-export everything from testing-library
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';

// Custom render that doesn't need providers (Zustand doesn't use context)
export function renderWithStore(ui: ReactElement, options?: RenderOptions) {
  resetStore();
  return render(ui, options);
}
