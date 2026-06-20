import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, userEvent } from '@/test/test-utils';
import type { AutocompleteSuggestion } from '@/lib/api/search.api';
import { QueryInput } from './query-input';

let mockSuggestions: AutocompleteSuggestion[] | undefined;

vi.mock('@/lib/hooks/use-search', () => ({
  useAutocomplete: () => ({ data: mockSuggestions }),
}));

beforeEach(() => {
  mockSuggestions = undefined;
  // jsdom doesn't implement scrollIntoView, which SuggestionPopup calls on mount.
  Element.prototype.scrollIntoView = vi.fn();
});

/**
 * Mirrors the real data flow: the parent normalises the typed text (here, upper
 * cases it) and feeds the rebuilt string back as `value`. The textarea must show
 * what the user typed while editing, NOT the normalised echo under their caret.
 */
function NormalizingHost() {
  const [value, setValue] = useState('');
  return <QueryInput value={value} onChange={(v) => setValue(v.toUpperCase())} />;
}

describe('QueryInput', () => {
  it('does not reformat the typed text under the caret while focused', async () => {
    const user = userEvent.setup();
    render(<NormalizingHost />);

    const input = screen.getByRole('textbox');
    await user.click(input);
    await user.type(input, 'status:open');

    // Parent echoes back "STATUS:OPEN"; the field keeps the user's own text.
    expect(input).toHaveValue('status:open');
  });

  it('adopts external value changes while not focused', () => {
    const onChange = vi.fn();
    const { rerender } = render(<QueryInput value="status:OPEN" onChange={onChange} />);

    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('status:OPEN');

    // e.g. a filter chip removed or "clear all" pressed — field is not focused.
    rerender(<QueryInput value="" onChange={onChange} />);
    expect(input).toHaveValue('');
  });

  it('completes a FIELD suggestion without a trailing space so the value parses', async () => {
    const user = userEvent.setup();
    mockSuggestions = [{ type: 'FIELD', label: 'status' }];
    render(<QueryInput value="" onChange={vi.fn()} />);

    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    await user.click(input);
    await user.type(input, 'stat');
    await user.keyboard('{Enter}');

    // No space after the colon — `status:open` (not `status: open`) is what the
    // tokenizer needs, and the caret sits right after the colon ready for the value.
    expect(input).toHaveValue('status:');
    expect(input.selectionStart).toBe('status:'.length);
  });

  it('completes a VALUE suggestion with a trailing space to start the next token', async () => {
    const user = userEvent.setup();
    mockSuggestions = [{ type: 'VALUE', label: 'open' }];
    render(<QueryInput value="" onChange={vi.fn()} />);

    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    await user.click(input);
    await user.type(input, 'status:op');
    await user.keyboard('{Enter}');

    expect(input).toHaveValue('status:open ');
  });
});
