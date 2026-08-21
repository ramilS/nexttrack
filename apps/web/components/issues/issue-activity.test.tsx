import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { buildActivity, resetFactoryCounter } from '@/test/factories';
import { ActivityItem } from './issue-activity';

describe('ActivityItem — actor kind', () => {
  beforeEach(() => {
    resetFactoryCounter();
  });

  it('badges a SERVICE actor', () => {
    const activity = buildActivity({
      actor: { id: 'bot-1', name: 'CI Bot', email: 'ci-bot@test.com', avatarUrl: null, kind: 'SERVICE' },
    });
    render(<ActivityItem activity={activity} />);

    expect(screen.getByText('Integration')).toBeInTheDocument();
    expect(screen.getByLabelText('Created by an integration')).toBeInTheDocument();
  });

  it('does not badge a human actor', () => {
    const activity = buildActivity({
      actor: { id: 'human-1', name: 'Alice', email: 'alice@test.com', avatarUrl: null, kind: 'HUMAN' },
    });
    render(<ActivityItem activity={activity} />);

    expect(screen.queryByText('Integration')).not.toBeInTheDocument();
  });
});
