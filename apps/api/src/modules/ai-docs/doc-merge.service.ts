import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { tiptapContentSchema, type TiptapDoc } from '@repo/shared/schemas';
import { AppLogger } from '@/common/logging/app-logger';
import { STRUCTURED_LLM, type StructuredLlm } from './llm/structured-llm';

export interface MergeInput {
  /** Article content as it stands now (may include edits made after the draft was generated). */
  currentContent: TiptapDoc;
  /** The AI-proposed draft captured when the doc-update issue was created. */
  proposedContent: TiptapDoc;
  /** Why the proposed change was suggested — guides reconciliation. */
  rationale: string;
}

export interface MergeResult {
  merged: TiptapDoc;
  /** True when the human edits and the proposed change touch the same region (ambiguous). */
  overlap: boolean;
}

const mergeSchema = z.object({
  mergedContentJson: z.string(),
  overlap: z.boolean(),
});

export const DEFAULT_MERGE_PROMPT = [
  'You reconcile a documentation article that was edited by a human after an AI update was drafted for it.',
  'You are given the CURRENT article (with the human edits) and the PROPOSED update (the AI draft) plus the rationale for the proposed change.',
  'Produce a single merged Tiptap document that keeps the human edits and folds in the proposed change.',
  'Set overlap=true ONLY if the human edited the same section/sentences the proposed change targets (so a human must review the reconciliation); otherwise overlap=false.',
  '',
  'Respond with a JSON object with exactly these keys:',
  '- mergedContentJson: string — a JSON-stringified Tiptap document, top-level {"type":"doc","content":[...]}',
  '- overlap: boolean',
].join('\n');

@Injectable()
export class DocMergeService {
  private readonly logger = new AppLogger(DocMergeService.name);

  constructor(
    @Inject(STRUCTURED_LLM) private readonly llm: StructuredLlm | null,
  ) {}

  /** Returns null when merging is unavailable (feature disabled) or the AI output is unusable. */
  async merge(
    input: MergeInput,
    systemPrompt: string = DEFAULT_MERGE_PROMPT,
  ): Promise<MergeResult | null> {
    if (!this.llm) return null;

    const parsed = await this.llm.generate({
      system: systemPrompt,
      user: [
        `Rationale for the proposed change: ${input.rationale}`,
        `CURRENT article: ${JSON.stringify(input.currentContent)}`,
        `PROPOSED update: ${JSON.stringify(input.proposedContent)}`,
      ].join('\n\n'),
      schema: mergeSchema,
      schemaName: 'doc_merge',
    });
    if (!parsed) {
      this.logger.warn('AI merge produced no usable output; treating as unmergeable');
      return null;
    }

    try {
      const merged = tiptapContentSchema.parse(
        JSON.parse(parsed.mergedContentJson),
      ) as TiptapDoc;
      return { merged, overlap: parsed.overlap };
    } catch {
      this.logger.warn('AI merge returned invalid Tiptap content; treating as unmergeable');
      return null;
    }
  }
}
