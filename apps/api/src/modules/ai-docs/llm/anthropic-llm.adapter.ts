import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { StructuredLlm, StructuredLlmRequest } from './structured-llm';

const MAX_TOKENS = 16000;

/** Anthropic-native structured outputs via `messages.parse` + adaptive thinking. */
export class AnthropicStructuredLlm implements StructuredLlm {
  constructor(
    private readonly client: Anthropic,
    private readonly model: string,
  ) {}

  async generate<T>(req: StructuredLlmRequest<T>): Promise<T | null> {
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
      output_config: { format: zodOutputFormat(req.schema) },
    });
    return response.parsed_output ?? null;
  }
}
