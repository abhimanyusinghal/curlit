import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KeyValueEditor } from '../KeyValueEditor';
import { createKeyValuePair } from '../../types';

describe('KeyValueEditor', () => {
  it('renders key-value rows', () => {
    const pairs = [
      createKeyValuePair({ key: 'Content-Type', value: 'application/json' }),
    ];
    render(<KeyValueEditor pairs={pairs} onChange={() => {}} />);
    expect(screen.getByDisplayValue('Content-Type')).toBeInTheDocument();
    expect(screen.getByDisplayValue('application/json')).toBeInTheDocument();
  });

  it('calls onChange when Add is clicked', () => {
    const onChange = vi.fn();
    render(<KeyValueEditor pairs={[]} onChange={onChange} />);
    fireEvent.click(screen.getByText('Add'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ key: '', value: '', enabled: true }),
    ]));
  });

  it('toggles checkbox calls onChange with updated enabled state', () => {
    const pair = createKeyValuePair({ key: 'test', value: 'val', enabled: true });
    const onChange = vi.fn();
    render(<KeyValueEditor pairs={[pair]} onChange={onChange} />);
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ enabled: false }),
    ]);
  });
});
