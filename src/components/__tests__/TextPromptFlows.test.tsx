import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Sidebar } from '../Sidebar';
import { SaveRequestModal } from '../SaveRequestModal';
import { useAppStore } from '../../store';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe('in-app text prompt flows', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  it('creates a collection from the sidebar without using a browser prompt', () => {
    render(<Sidebar />);

    fireEvent.click(screen.getByTitle('New collection'));
    const dialog = screen.getByRole('dialog', { name: 'New Collection' });
    fireEvent.change(within(dialog).getByLabelText('Collection name'), { target: { value: 'Desktop API' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(useAppStore.getState().collections).toEqual([
      expect.objectContaining({ name: 'Desktop API', requests: [] }),
    ]);
    expect(JSON.parse(localStorage.getItem('curlit_collections')!)).toEqual([
      expect.objectContaining({ name: 'Desktop API' }),
    ]);
  });

  it('creates and selects a collection from the save-request modal', () => {
    render(<SaveRequestModal open onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'New Collection' }));
    const dialog = screen.getByRole('dialog', { name: 'New Collection' });
    fireEvent.change(within(dialog).getByLabelText('Collection name'), { target: { value: 'Saved requests' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(useAppStore.getState().collections).toEqual([
      expect.objectContaining({ name: 'Saved requests', requests: [] }),
    ]);
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});
