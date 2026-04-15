import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResponsePanel } from '../ResponsePanel';
import type { ResponseData } from '../../types';

describe('ResponsePanel', () => {
  it('shows loading spinner when loading', () => {
    render(<ResponsePanel response={null} loading={true} requestId="test-id" />);
    expect(screen.getByText('Sending request...')).toBeInTheDocument();
  });

  it('shows empty state when no response', () => {
    render(<ResponsePanel response={null} loading={false} requestId="test-id" />);
    expect(screen.getByText(/Enter a URL and click Send/)).toBeInTheDocument();
  });

  it('renders status, time, size, and body when response exists', () => {
    const response: ResponseData = {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      body: '{"message":"hello"}',
      size: 19,
      time: 150,
      cookies: [],
    };
    render(<ResponsePanel response={response} loading={false} requestId="test-id" />);
    expect(screen.getByText(/200/)).toBeInTheDocument();
    expect(screen.getByText(/OK/)).toBeInTheDocument();
    expect(screen.getByText('150 ms')).toBeInTheDocument();
    expect(screen.getByText('19 B')).toBeInTheDocument();
  });
});
