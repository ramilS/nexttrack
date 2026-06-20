import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { TagForm } from './tag-form';

const noop = () => {};

describe('TagForm', () => {
  it('clears the name field when the create dialog is reopened', async () => {
    const { rerender } = render(<TagForm open onOpenChange={noop} onSubmit={noop} />);

    await userEvent.type(screen.getByLabelText('Name'), 'temporary');
    expect(screen.getByLabelText('Name')).toHaveValue('temporary');

    // Same lifecycle as the create usage: the form stays mounted, only `open` toggles.
    rerender(<TagForm open={false} onOpenChange={noop} onSubmit={noop} />);
    rerender(<TagForm open onOpenChange={noop} onSubmit={noop} />);

    expect(screen.getByLabelText('Name')).toHaveValue('');
  });

  it('seeds the name field from defaultValues when editing', () => {
    render(
      <TagForm
        open
        onOpenChange={noop}
        onSubmit={noop}
        defaultValues={{ name: 'bug', color: '#ef4444' }}
        title="Edit Tag"
      />,
    );

    expect(screen.getByLabelText('Name')).toHaveValue('bug');
  });
});
