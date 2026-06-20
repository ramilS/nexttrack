import type { z } from 'zod';

/** Injection token for the active {@link StructuredLlm}; `null` when AI-docs is disabled. */
export const STRUCTURED_LLM = Symbol('STRUCTURED_LLM');

export interface StructuredLlmRequest<T> {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  /** Schema name (used by providers that support named JSON schemas). */
  schemaName: string;
}

/**
 * Provider-agnostic structured-output port. Adapters (Anthropic, OpenAI-compatible)
 * implement it; the domain services depend only on this. Returns null when the
 * model output can't be coerced to the schema, so callers degrade gracefully.
 */
export interface StructuredLlm {
  generate<T>(req: StructuredLlmRequest<T>): Promise<T | null>;
}
