import { DocSuggestionService, type SuggestionInput } from './doc-suggestion.service';
import type { StructuredLlm } from './llm/structured-llm';

const input: SuggestionInput = {
  issueKey: 'TEST-1',
  issueTitle: 'Add SSO login',
  issueType: 'FEATURE',
  issueDescription: { type: 'doc', content: [] },
  candidates: [
    { id: 'art-1', title: 'Authentication', content: { type: 'doc', content: [] } },
  ],
};

const validDoc = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'SSO is supported.' }] }],
});

function makeLlm(output: unknown): { llm: StructuredLlm; generate: jest.Mock } {
  const generate = jest.fn().mockResolvedValue(output);
  return { llm: { generate } as StructuredLlm, generate };
}

describe('DocSuggestionService', () => {
  it('returns null when no LLM is configured (feature disabled)', async () => {
    const service = new DocSuggestionService(null);
    await expect(service.suggest(input)).resolves.toBeNull();
  });

  it('returns null when the model decides no update is needed', async () => {
    const { llm } = makeLlm({ shouldUpdate: false });
    await expect(new DocSuggestionService(llm).suggest(input)).resolves.toBeNull();
  });

  it('maps a valid suggestion to a DocSuggestion with parsed Tiptap content', async () => {
    const { llm } = makeLlm({
      shouldUpdate: true,
      targetArticleId: 'art-1',
      proposedTitle: 'Authentication',
      proposedContentJson: validDoc,
      rationale: 'SSO login is now available.',
    });

    const result = await new DocSuggestionService(llm).suggest(input);

    expect(result).toEqual({
      targetArticleId: 'art-1',
      proposedTitle: 'Authentication',
      proposedContent: JSON.parse(validDoc),
      rationale: 'SSO login is now available.',
    });
  });

  it('falls back to "create new" when the model returns an unknown article id', async () => {
    const { llm } = makeLlm({
      shouldUpdate: true,
      targetArticleId: 'hallucinated-id',
      proposedTitle: 'New article',
      proposedContentJson: validDoc,
      rationale: 'Needs a new page.',
    });

    const result = await new DocSuggestionService(llm).suggest(input);

    expect(result?.targetArticleId).toBeNull();
  });

  it('returns null when the proposed content is not a valid Tiptap doc', async () => {
    const { llm } = makeLlm({
      shouldUpdate: true,
      targetArticleId: null,
      proposedTitle: 'Broken',
      proposedContentJson: '{"not":"a doc"}',
      rationale: 'x',
    });

    await expect(new DocSuggestionService(llm).suggest(input)).resolves.toBeNull();
  });

  it('passes a custom system prompt through to the LLM', async () => {
    const { llm, generate } = makeLlm({ shouldUpdate: false });

    await new DocSuggestionService(llm).suggest(input, 'CUSTOM PROMPT');

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ system: 'CUSTOM PROMPT' }),
    );
  });
});
