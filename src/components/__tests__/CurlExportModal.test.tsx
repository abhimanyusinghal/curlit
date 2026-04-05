import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CurlExportModal } from '../CurlExportModal';
import { createDefaultRequest } from '../../types';

describe('CurlExportModal', () => {
  const request = createDefaultRequest({ method: 'GET', url: 'https://example.com' });

  it('does not render when closed', () => {
    const { container } = render(<CurlExportModal open={false} onClose={() => {}} request={request} />);
    expect(container.innerHTML).toBe('');
  });

  it('displays generated curl command', () => {
    render(<CurlExportModal open={true} onClose={() => {}} request={request} />);
    expect(screen.getByText(/curl/)).toBeInTheDocument();
    expect(screen.getByText(/example\.com/)).toBeInTheDocument();
  });
});
