import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AgentSettingsModal } from '../AgentSettingsModal';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AgentSettingsModal', () => {
  it('opens agent downloads and the release page outside the Electron renderer', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response);

    render(<AgentSettingsModal open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('Not running on localhost:3001')).toBeInTheDocument());

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(4);
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
      expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
    }
  });
});
