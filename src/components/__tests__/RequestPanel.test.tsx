import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RequestPanel } from '../RequestPanel';
import { useAppStore } from '../../store';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe('RequestPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  function getActiveRequest() {
    const state = useAppStore.getState();
    return state.requests[state.tabs[0].requestId];
  }

  it('renders tab bar with Params, Headers, Body, Auth', () => {
    render(<RequestPanel request={getActiveRequest()} />);
    expect(screen.getByText('Params')).toBeInTheDocument();
    expect(screen.getByText('Headers')).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
    expect(screen.getByText('Auth')).toBeInTheDocument();
  });

  it('switching to Body tab shows body type selector', () => {
    render(<RequestPanel request={getActiveRequest()} />);
    fireEvent.click(screen.getByText('Body'));
    expect(screen.getByText('JSON')).toBeInTheDocument();
    expect(screen.getByText('Text')).toBeInTheDocument();
    expect(screen.getByText('XML')).toBeInTheDocument();
    expect(screen.getByText('Form Data')).toBeInTheDocument();
    expect(screen.getByText('URL Encoded')).toBeInTheDocument();
  });

  it('switching to Auth tab shows auth type selector', () => {
    render(<RequestPanel request={getActiveRequest()} />);
    fireEvent.click(screen.getByText('Auth'));
    expect(screen.getByText('No Auth')).toBeInTheDocument();
    expect(screen.getByText('Basic Auth')).toBeInTheDocument();
    expect(screen.getByText('Bearer Token')).toBeInTheDocument();
    expect(screen.getByText('API Key')).toBeInTheDocument();
  });
});
