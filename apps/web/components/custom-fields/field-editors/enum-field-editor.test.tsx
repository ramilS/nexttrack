import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { EnumFieldEditor } from './enum-field-editor';

const options = [
  { id: 'opt-1', name: 'Production', color: 'red' },
  { id: 'opt-2', name: 'Staging', color: 'yellow' },
  { id: 'opt-3', name: 'Development', color: 'green' },
];

describe('EnumFieldEditor', () => {
  it('renders "None" placeholder when no value selected', () => {
    render(<EnumFieldEditor value={null} onChange={vi.fn()} options={options} />);
    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('displays the selected option name when value is an option id', () => {
    render(<EnumFieldEditor value="opt-1" onChange={vi.fn()} options={options} />);
    expect(screen.getByText('Production')).toBeInTheDocument();
  });

  it('shows "None" when value does not match any option id', () => {
    render(<EnumFieldEditor value="nonexistent" onChange={vi.fn()} options={options} />);
    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('does not display match when value equals option name instead of id', () => {
    render(<EnumFieldEditor value="Production" onChange={vi.fn()} options={options} />);
    // "Production" as name should NOT match — only id should match
    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('renders inline variant with plain text', () => {
    render(
      <EnumFieldEditor value="opt-2" onChange={vi.fn()} options={options} inline />,
    );
    expect(screen.getByText('Staging')).toBeInTheDocument();
  });
});
