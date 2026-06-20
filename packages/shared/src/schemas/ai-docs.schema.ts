import { z } from 'zod';
import type { TiptapDoc } from './tiptap.schema';

const PROMPT_MAX = 20000;

export type DocProposalStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

/** The AI doc-update proposal attached to a doc-update issue, for the review panel. */
export interface DocProposalView {
  id: string;
  status: DocProposalStatus;
  rationale: string;
  proposedTitle: string;
  proposedContent: TiptapDoc;
  /** Target article being updated, or null when the proposal creates a new article. */
  targetArticleId: string | null;
  /** True when the article changed after drafting and the draft was AI-reconciled for re-review. */
  hasConflict: boolean;
  createdAt: string;
}

/**
 * Per-project AI-docs prompt overrides. A null (or blank) field means "use the
 * built-in default". Both keys are required on update so the client always
 * sends the full intended state.
 */
export const updateAiDocsSettingsSchema = z.object({
  suggestionPrompt: z.string().trim().max(PROMPT_MAX).nullable(),
  mergePrompt: z.string().trim().max(PROMPT_MAX).nullable(),
});

export type UpdateAiDocsSettingsInput = z.infer<typeof updateAiDocsSettingsSchema>;

export interface AiDocsSettingsView {
  suggestionPrompt: string | null;
  mergePrompt: string | null;
  defaults: {
    suggestion: string;
    merge: string;
  };
}
