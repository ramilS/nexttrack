import OpenAI from 'openai';
import { AppLogger } from '@/common/logging/app-logger';
import type { StructuredLlm, StructuredLlmRequest } from './structured-llm';

/**
 * OpenAI-compatible adapter. With a configurable base URL this covers OpenAI,
 * Azure OpenAI, and local/self-hosted servers (Ollama, LM Studio, vLLM,
 * llama.cpp) plus aggregators (OpenRouter, Groq, Together). Uses plain JSON mode
 * + client-side schema validation — the broadest-compatible path, since strict
 * `json_schema` isn't supported everywhere. Smaller local models may produce
 * output that fails validation; we return null and the caller skips.
 */
export class OpenAiStructuredLlm implements StructuredLlm {
  private readonly logger = new AppLogger(OpenAiStructuredLlm.name);

  constructor(
    private readonly client: OpenAI,
    private readonly model: string,
  ) {}

  async generate<T>(req: StructuredLlmRequest<T>): Promise<T | null> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: `${req.system}\n\nRespond ONLY with a single valid JSON object — no prose, no markdown code fences.`,
        },
        { role: 'user', content: req.user },
      ],
      response_format: { type: 'json_object' },
    });

    const text = response.choices[0]?.message?.content;
    if (!text) {
      this.logger.warn('LLM returned empty content; skipping', {
        provider: 'openai',
        model: this.model,
        schemaName: req.schemaName,
      });
      return null;
    }

    try {
      return req.schema.parse(JSON.parse(text));
    } catch {
      this.logger.warn('LLM output did not match the expected schema; skipping', {
        provider: 'openai',
        model: this.model,
        schemaName: req.schemaName,
      });
      return null;
    }
  }
}
