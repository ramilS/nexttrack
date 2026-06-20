import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { envBoolean } from './helpers';

export const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-4-8';

const schema = z
  .object({
    enabled: envBoolean(false),
    provider: z.enum(['anthropic', 'openai']).default('anthropic'),
    /** API key. For local OpenAI-compatible servers any non-empty string works. */
    apiKey: z.string().min(1).optional(),
    /** Base URL for OpenAI-compatible providers (OpenAI/Azure/Ollama/LM Studio/vLLM/OpenRouter…). */
    baseUrl: z.string().url().optional(),
    /** Model id. Defaults to Claude Opus 4.8 for the anthropic provider; required for openai. */
    model: z.string().min(1).optional(),
    triggerTag: z.string().min(1).default('docs'),
    maxCandidateArticles: z.coerce.number().int().min(1).max(50).default(8),
    rejectionStatusNames: z
      .array(z.string().min(1))
      .default(['Cancelled', "Won't Do", 'Rejected']),
  })
  .refine((c) => !c.enabled || c.provider !== 'anthropic' || !!c.apiKey, {
    message: 'An API key is required when AI_DOCS_ENABLED=true and provider is anthropic',
    path: ['apiKey'],
  })
  .refine((c) => !c.enabled || c.provider !== 'openai' || !!c.apiKey || !!c.baseUrl, {
    message:
      'Set AI_DOCS_API_KEY or AI_DOCS_BASE_URL when AI_DOCS_ENABLED=true and provider is openai',
    path: ['apiKey'],
  })
  .refine((c) => !c.enabled || c.provider !== 'openai' || !!c.model, {
    message: 'AI_DOCS_MODEL is required when provider is openai',
    path: ['model'],
  });

export type AiDocsConfig = z.infer<typeof schema>;

function parseCsv(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const items = value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return items.length > 0 ? items : undefined;
}

export const aiDocsConfig = registerAs('aiDocs', (): AiDocsConfig => {
  return schema.parse({
    enabled: process.env.AI_DOCS_ENABLED,
    provider: process.env.AI_DOCS_PROVIDER,
    // ANTHROPIC_API_KEY / OPENAI_API_KEY kept as ergonomic fallbacks.
    apiKey:
      process.env.AI_DOCS_API_KEY ??
      process.env.ANTHROPIC_API_KEY ??
      process.env.OPENAI_API_KEY,
    baseUrl: process.env.AI_DOCS_BASE_URL,
    model: process.env.AI_DOCS_MODEL,
    triggerTag: process.env.AI_DOCS_TRIGGER_TAG,
    maxCandidateArticles: process.env.AI_DOCS_MAX_CANDIDATE_ARTICLES,
    rejectionStatusNames: parseCsv(process.env.AI_DOCS_REJECTION_STATUS_NAMES),
  });
});
