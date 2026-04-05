import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CurlImportModal } from '../CurlImportModal';
import { useAppStore } from '../../store';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe('CurlImportModal', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  it('does not render when closed', () => {
    const { container } = render(<CurlImportModal open={false} onClose={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders textarea when open', () => {
    render(<CurlImportModal open={true} onClose={() => {}} />);
    expect(screen.getByPlaceholderText(/Paste your cURL command/)).toBeInTheDocument();
    expect(screen.getByText('Import')).toBeInTheDocument();
  });

  it('import creates new tab with parsed data', () => {
    const onClose = vi.fn();
    render(<CurlImportModal open={true} onClose={onClose} />);
    const textarea = screen.getByPlaceholderText(/Paste your cURL command/);
    fireEvent.change(textarea, { target: { value: "curl -X POST 'https://api.example.com/data'" } });
    fireEvent.click(screen.getByText('Import'));
    const state = useAppStore.getState();
    // Should have 2 tabs now (initial + imported)
    expect(state.tabs).toHaveLength(2);
    expect(onClose).toHaveBeenCalled();
  });
});
