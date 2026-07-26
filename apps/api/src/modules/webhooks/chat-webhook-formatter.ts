export type ChatWebhookProvider = 'SLACK' | 'DISCORD' | 'TEAMS';

// Same event field names as TelegramTemplatesService's DEFAULT_TEMPLATES —
// the outbox payload shape is provider-agnostic, only the markup differs.
const EVENT_TEXT: Record<
  string,
  (data: Record<string, unknown>, bold: (s: string) => string) => string
> = {
  ASSIGNEE_CHANGED: (d, bold) =>
    `${bold(String(d.issueKey))} assigned to ${d.assigneeName}\n${d.issueTitle}`,
  STATUS_CHANGED: (d, bold) =>
    `${bold(String(d.issueKey))} status changed to ${bold(String(d.statusName))}\n${d.issueTitle}`,
  COMMENT_ADDED: (d, bold) =>
    `${bold(String(d.issueKey))} new comment by ${d.actorName}\n${d.preview}`,
  ISSUE_RESOLVED: (d, bold) =>
    `✅ ${bold(String(d.issueKey))} resolved by ${d.actorName}\n${d.issueTitle}`,
  SPRINT_STARTED: (d, bold) =>
    `🏃 Sprint ${bold(String(d.sprintName))} started in ${d.projectName}`,
  SPRINT_CLOSED: (d, bold) =>
    `🏁 Sprint ${bold(String(d.sprintName))} closed in ${d.projectName}`,
};

const BOLD: Record<ChatWebhookProvider, (s: string) => string> = {
  SLACK: (s) => `*${s}*`,
  DISCORD: (s) => `**${s}**`,
  TEAMS: (s) => `**${s}**`,
};

export function formatChatMessage(
  provider: ChatWebhookProvider,
  eventType: string,
  data: Record<string, unknown>,
): string {
  const build = EVENT_TEXT[eventType];
  return build ? build(data, BOLD[provider]) : `Event: ${eventType}`;
}

// Each provider's incoming-webhook endpoint expects its own envelope —
// pasting our raw event JSON in would 400 (Slack) or render as an empty
// message (Discord/Teams).
export function buildChatPayload(
  provider: ChatWebhookProvider,
  text: string,
): Record<string, unknown> {
  switch (provider) {
    case 'SLACK':
      return { text };
    case 'DISCORD':
      return { content: text };
    case 'TEAMS':
      return { '@type': 'MessageCard', '@context': 'http://schema.org/extensions', text };
  }
}
