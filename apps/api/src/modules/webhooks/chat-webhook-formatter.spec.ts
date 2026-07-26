import { buildChatPayload, formatChatMessage } from './chat-webhook-formatter';

describe('formatChatMessage', () => {
  it('renders Slack mrkdwn bold', () => {
    const text = formatChatMessage('SLACK', 'ISSUE_RESOLVED', {
      issueKey: 'PRJ-1',
      actorName: 'Alice',
      issueTitle: 'Fix bug',
    });
    expect(text).toBe('✅ *PRJ-1* resolved by Alice\nFix bug');
  });

  it('renders Discord markdown bold', () => {
    const text = formatChatMessage('DISCORD', 'STATUS_CHANGED', {
      issueKey: 'PRJ-2',
      statusName: 'In Progress',
      issueTitle: 'Implement feature',
    });
    expect(text).toBe('**PRJ-2** status changed to **In Progress**\nImplement feature');
  });

  it('renders Teams markdown bold', () => {
    const text = formatChatMessage('TEAMS', 'SPRINT_STARTED', {
      sprintName: 'Sprint 5',
      projectName: 'My Project',
    });
    expect(text).toBe('🏃 Sprint **Sprint 5** started in My Project');
  });

  it('falls back to a generic label for unknown event types', () => {
    expect(formatChatMessage('SLACK', 'SOMETHING_NEW', {})).toBe('Event: SOMETHING_NEW');
  });
});

describe('buildChatPayload', () => {
  it('wraps text for Slack as {text}', () => {
    expect(buildChatPayload('SLACK', 'hello')).toEqual({ text: 'hello' });
  });

  it('wraps text for Discord as {content}', () => {
    expect(buildChatPayload('DISCORD', 'hello')).toEqual({ content: 'hello' });
  });

  it('wraps text for Teams as a MessageCard', () => {
    expect(buildChatPayload('TEAMS', 'hello')).toEqual({
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      text: 'hello',
    });
  });
});
