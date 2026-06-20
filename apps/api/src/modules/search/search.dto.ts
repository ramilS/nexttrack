import { createZodDto } from 'nestjs-zod';
import {
  searchQuerySchema,
  autocompleteQuerySchema,
  validateQuerySchema,
  reindexSchema,
  autocompleteSuggestionSchema,
  validateResponseSchema,
  reindexResponseSchema,
  searchResponseSchema,
} from '@repo/shared/schemas';

/**
 * ZodDto wrappers over the shared schemas: validated by the global
 * AppZodValidationPipe and rendered into the OpenAPI document. The shared
 * package stays NestJS-free — only these thin classes live in the API.
 */
export class SearchQueryDto extends createZodDto(searchQuerySchema) {}
export class AutocompleteQueryDto extends createZodDto(autocompleteQuerySchema) {}
export class ValidateQueryDto extends createZodDto(validateQuerySchema) {}
export class ReindexDto extends createZodDto(reindexSchema) {}

export class AutocompleteSuggestionDto extends createZodDto(autocompleteSuggestionSchema) {}
export class ValidateResponseDto extends createZodDto(validateResponseSchema) {}
export class ReindexResponseDto extends createZodDto(reindexResponseSchema) {}
export class SearchResponseDto extends createZodDto(searchResponseSchema) {}
