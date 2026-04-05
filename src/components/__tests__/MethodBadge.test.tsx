import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MethodBadge } from '../MethodBadge';

describe('MethodBadge', () => {
  it('renders method text', () => {
    render(<MethodBadge method="GET" />);
    expect(screen.getByText('GET')).toBeInTheDocument();
  });

  it('applies correct color class', () => {
    const { container } = render(<MethodBadge method="POST" />);
    const span = container.querySelector('span');
    expect(span?.className).toContain('text-method-post');
  });
});
