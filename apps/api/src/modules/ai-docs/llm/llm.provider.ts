import { Provider } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { AppLogger } from '@/common/logging/app-logger';
import { aiDocsConfig, ANTHROPIC_DEFAULT_MODEL } from '@/config';
import { STRUCTURED_LLM, type StructuredLlm } from './structured-llm';
import { AnthropicStructuredLlm } from './anthropic-llm.adapter';
import { OpenAiStructuredLlm } from './openai-llm.adapter';

/**
 * Builds the configured {@link StructuredLlm}, or null when the feature is
 * disabled / not credentialed. Consumers guard on null so dev and test never
 * need a key. The config schema already enforces the required fields per
 * provider when AI_DOCS_ENABLED=true.
 */
export const structuredLlmProvider: Provider = {
  provide: STRUCTURED_LLM,
  inject: [aiDocsConfig.KEY],
  useFactory: (config: ConfigType<typeof aiDocsConfig>): StructuredLlm | null => {
    if (!config.enabled) return null;

    const logger = new AppLogger('AiDocs');

    if (config.provider === 'anthropic') {
      if (!config.apiKey) return null;
      const model = config.model ?? ANTHROPIC_DEFAULT_MODEL;
      logger.log('Using Anthropic structured LLM', { provider: 'anthropic', model });
      return new AnthropicStructuredLlm(new Anthropic({ apiKey: config.apiKey }), model);
    }

    if (!config.model) return null;
    logger.log('Using OpenAI-compatible structured LLM', {
      provider: 'openai',
      baseUrl: config.baseUrl ?? 'api.openai.com',
      model: config.model,
    });
    return new OpenAiStructuredLlm(
      new OpenAI({ apiKey: config.apiKey ?? 'not-needed', baseURL: config.baseUrl }),
      config.model,
    );
  },
};
