import { Injectable } from '@nestjs/common';
import { AiDocsSettingsRepository } from './ai-docs-settings.repository';
import { DEFAULT_SUGGESTION_PROMPT } from './doc-suggestion.service';
import { DEFAULT_MERGE_PROMPT } from './doc-merge.service';

export interface ResolvedPrompts {
  suggestion: string;
  merge: string;
}

function nonBlank(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Resolves the effective AI-docs prompts for a project: per-project override → built-in default. */
@Injectable()
export class PromptResolver {
  constructor(private readonly settings: AiDocsSettingsRepository) {}

  async forProject(projectId: string): Promise<ResolvedPrompts> {
    const overrides = await this.settings.find(projectId);
    return {
      suggestion: nonBlank(overrides?.suggestionPrompt) ?? DEFAULT_SUGGESTION_PROMPT,
      merge: nonBlank(overrides?.mergePrompt) ?? DEFAULT_MERGE_PROMPT,
    };
  }
}
