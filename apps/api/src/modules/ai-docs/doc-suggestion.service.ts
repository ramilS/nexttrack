import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { tiptapContentSchema, type TiptapDoc } from '@repo/shared/schemas';
import { STRUCTURED_LLM, type StructuredLlm } from './llm/structured-llm';

export interface SuggestionCandidate {
  id: string;
  title: string;
  content: TiptapDoc | null;
}

export interface SuggestionInput {
  issueKey: string;
  issueTitle: string;
  issueType: string;
  issueDescription: TiptapDoc | null;
  candidates: SuggestionCandidate[];
}

export interface DocSuggestion {
  targetArticleId: string | null;
  proposedTitle: string;
  proposedContent: TiptapDoc;
  rationale: string;
}

const suggestionSchema = z.object({
  shouldUpdate: z.boolean(),
  targetArticleId: z.string().nullable(),
  proposedTitle: z.string(),
  proposedContentJson: z.string(),
  rationale: z.string(),
});

export const DEFAULT_SUGGESTION_PROMPT = [
  'You maintain a software project knowledge base. A work item (issue) was just resolved.',
  'Decide whether the resolution changes anything a reader of the docs should know — new/changed behavior, a new feature, a fixed bug whose workaround is now obsolete, a changed API or config.',
  'If nothing in the docs needs to change, set shouldUpdate=false and leave the other fields empty.',
  'If an update is warranted, pick the single most relevant candidate article by its id, or set targetArticleId=null to propose a brand-new article.',
  'When updating an existing article, return the COMPLETE intended document, not a fragment.',
  'Keep rationale to one or two sentences explaining why the doc change is needed.',
  '',
  'Respond with a JSON object with exactly these keys:',
  '- shouldUpdate: boolean',
  '- targetArticleId: string (id of a candidate article) or null (create new)',
  '- proposedTitle: string',
  '- proposedContentJson: string — a JSON-stringified Tiptap document, top-level {"type":"doc","content":[...]}',
  '- rationale: string',
].join('\n');

@Injectable()
export class DocSuggestionService {
  private readonly logger = new Logger(DocSuggestionService.name);

  constructor(
    @Inject(STRUCTURED_LLM) private readonly llm: StructuredLlm | null,
  ) {}

  async suggest(
    input: SuggestionInput,
    systemPrompt: string = DEFAULT_SUGGESTION_PROMPT,
  ): Promise<DocSuggestion | null> {
    if (!this.llm) return null;

    const parsed = await this.llm.generate({
      system: systemPrompt,
      user: this.buildUserPrompt(input),
      schema: suggestionSchema,
      schemaName: 'doc_suggestion',
    });
    if (!parsed || !parsed.shouldUpdate) return null;

    const content = this.parseContent(parsed.proposedContentJson, input.issueKey);
    if (!content) return null;

    return {
      targetArticleId: this.resolveTarget(parsed.targetArticleId, input.candidates),
      proposedTitle: parsed.proposedTitle,
      proposedContent: content,
      rationale: parsed.rationale,
    };
  }

  /** Reject a hallucinated article id by falling back to "create new". */
  private resolveTarget(
    id: string | null,
    candidates: SuggestionCandidate[],
  ): string | null {
    if (!id) return null;
    return candidates.some((c) => c.id === id) ? id : null;
  }

  private parseContent(json: string, issueKey: string): TiptapDoc | null {
    try {
      return tiptapContentSchema.parse(JSON.parse(json)) as TiptapDoc;
    } catch {
      this.logger.warn(
        `AI returned invalid Tiptap content for ${issueKey}; skipping suggestion`,
      );
      return null;
    }
  }

  private buildUserPrompt(input: SuggestionInput): string {
    const candidates = input.candidates.length
      ? input.candidates
          .map(
            (c) =>
              `- id: ${c.id}\n  title: ${c.title}\n  content: ${JSON.stringify(c.content ?? {})}`,
          )
          .join('\n')
      : '(no existing articles in this project)';

    return [
      `Resolved issue ${input.issueKey} (${input.issueType}): ${input.issueTitle}`,
      `Description: ${JSON.stringify(input.issueDescription ?? {})}`,
      '',
      'Candidate articles in the same project:',
      candidates,
    ].join('\n');
  }
}
