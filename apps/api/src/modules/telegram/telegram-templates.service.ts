import { Injectable } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import { AppLogger } from '@/common/logging/app-logger';

const DEFAULT_TEMPLATES: Record<string, string> = {
  ASSIGNEE_CHANGED:
    '<b>{{issueKey}}</b> assigned to {{assigneeName}}\n{{issueTitle}}',
  STATUS_CHANGED:
    '<b>{{issueKey}}</b> status changed to <b>{{statusName}}</b>\n{{issueTitle}}',
  COMMENT_ADDED:
    '<b>{{issueKey}}</b> new comment by {{actorName}}\n{{preview}}',
  ISSUE_RESOLVED:
    '✅ <b>{{issueKey}}</b> resolved by {{actorName}}\n{{issueTitle}}',
  SPRINT_STARTED:
    '🏃 Sprint <b>{{sprintName}}</b> started in {{projectName}}',
  SPRINT_CLOSED:
    '🏁 Sprint <b>{{sprintName}}</b> closed in {{projectName}}',
};

// Block control structures that could access prototype or execute code
const UNSAFE_TEMPLATE_PATTERN = /\{\{[#/]|{{{|\{\{>|\{\{!--|constructor|prototype|__proto__/;

@Injectable()
export class TelegramTemplatesService {
  private readonly logger = new AppLogger(TelegramTemplatesService.name);
  private compiledTemplates = new Map<string, Handlebars.TemplateDelegate>();
  private sandboxedHandlebars: typeof Handlebars;

  constructor() {
    // Create isolated Handlebars instance with no helpers (prevents helper injection)
    this.sandboxedHandlebars = Handlebars.create();
  }

  render(
    eventType: string,
    data: Record<string, unknown>,
    customTemplate?: string | null,
  ): string {
    const isCustom = !!customTemplate;
    const templateSource =
      customTemplate ?? DEFAULT_TEMPLATES[eventType] ?? `Event: ${eventType}`;

    // Validate custom templates against unsafe patterns
    if (isCustom && UNSAFE_TEMPLATE_PATTERN.test(templateSource)) {
      this.logger.warn('Rejected unsafe custom Telegram template', { eventType });
      return DEFAULT_TEMPLATES[eventType]
        ? this.render(eventType, data) // Fall back to default
        : `Event: ${eventType}`;
    }

    const cacheKey = isCustom ? `custom:${templateSource}` : eventType;
    let compiled = this.compiledTemplates.get(cacheKey);
    if (!compiled) {
      // Use sandboxed instance for custom templates; main Handlebars for defaults
      const hb = isCustom ? this.sandboxedHandlebars : Handlebars;
      compiled = hb.compile(templateSource, { noEscape: false });
      this.compiledTemplates.set(cacheKey, compiled);
    }

    return compiled(data);
  }
}
