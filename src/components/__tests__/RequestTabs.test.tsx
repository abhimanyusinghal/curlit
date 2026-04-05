import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RequestTabs } from '../RequestTabs';
import { useAppStore } from '../../store';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe('RequestTabs', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  it('renders all open tabs', () => {
    useAppStore.getState().addTab({ name: 'Tab 2' });
    render(<RequestTabs />);
    expect(screen.getByText('Untitled Request')).toBeInTheDocument();
    expect(screen.getByText('Tab 2')).toBeInTheDocument();
  });

  it('clicking a tab sets it active', () => {
    useAppStore.getState().addTab({ name: 'Tab 2' });
    const id1 = useAppStore.getState().tabs[0].id;
    render(<RequestTabs />);
    fireEvent.click(screen.getByText('Untitled Request'));
    expect(useAppStore.getState().activeTabId).toBe(id1);
  });

  it('+ button adds a new tab', () => {
    render(<RequestTabs />);
    fireEvent.click(screen.getByTitle('New Tab'));
    expect(useAppStore.getState().tabs).toHaveLength(2);
  });
});
