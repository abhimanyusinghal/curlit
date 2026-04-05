import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UrlBar } from '../UrlBar';
import { useAppStore } from '../../store';
import { createDefaultRequest } from '../../types';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe('UrlBar', () => {
  let request: ReturnType<typeof createDefaultRequest>;

  beforeEach(() => {
    localStorage.clear();
    resetStore();
    request = useAppStore.getState().requests[useAppStore.getState().tabs[0].requestId];
  });

  it('renders method selector, URL input, and send button', () => {
    render(<UrlBar request={request} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Enter URL/)).toBeInTheDocument();
    expect(screen.getByText('Send')).toBeInTheDocument();
  });

  it('displays all 7 HTTP methods in dropdown', () => {
    render(<UrlBar request={request} />);
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(7);
    const methods = options.map(o => o.textContent);
    expect(methods).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
  });

  it('changing method updates store', () => {
    render(<UrlBar request={request} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'POST' } });
    expect(useAppStore.getState().requests[request.id].method).toBe('POST');
  });

  it('typing URL updates store', () => {
    render(<UrlBar request={request} />);
    fireEvent.change(screen.getByPlaceholderText(/Enter URL/), { target: { value: 'https://api.test' } });
    expect(useAppStore.getState().requests[request.id].url).toBe('https://api.test');
  });

  it('send button is disabled when URL is empty', () => {
    render(<UrlBar request={request} />);
    expect(screen.getByText('Send').closest('button')).toBeDisabled();
  });
});
