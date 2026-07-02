import { z } from 'zod';
import { userSummarySchema } from './common.schema';
import { tagSchema } from './tag.schema';
import { issueTypeSchema, issuePrioritySchema } from './issue.schema';
import {
  statusCategorySchema,
  PROJECT_KEY_MIN,
  PROJECT_KEY_MAX,
  PROJECT_KEY_REGEX,
} from './project.schema';

// ─── Request schemas ─────────────────────────────────────────

export const SEARCH_QUERY_MAX = 500;
export const SEARCH_PAGE_SIZE_MAX = 100;
export const SEARCH_PAGE_SIZE_DEFAULT = 20;

export const searchQuerySchema = z.object({
  q: z.string().max(SEARCH_QUERY_MAX).default(''),
  projectId: z.guid().optional(),
  cursor: z.string().optional(),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(SEARCH_PAGE_SIZE_MAX)
    .default(SEARCH_PAGE_SIZE_DEFAULT),
});
export type SearchQuery = z.input<typeof searchQuerySchema>;
export type SearchQueryParsed = z.infer<typeof searchQuerySchema>;

export const autocompleteQuerySchema = z.object({
  q: z.string().max(SEARCH_QUERY_MAX).default(''),
  cursor: z.coerce.number().int().min(0).optional(),
  projectId: z.guid().optional(),
});
export type AutocompleteQuery = z.input<typeof autocompleteQuerySchema>;
export type AutocompleteQueryParsed = z.infer<typeof autocompleteQuerySchema>;

export const validateQuerySchema = z.object({
  q: z.string().min(1).max(SEARCH_QUERY_MAX),
});
export type ValidateQueryInput = z.infer<typeof validateQuerySchema>;

export const reindexSchema = z.object({
  // Human-friendly project identifier (e.g. "DEVX"), case-insensitive. Omit to
  // reindex every project.
  projectKey: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.string().min(PROJECT_KEY_MIN).max(PROJECT_KEY_MAX).regex(PROJECT_KEY_REGEX))
    .optional(),
  // Enqueue a background reindex and return immediately instead of reindexing
  // inline (avoids blocking the request — and the 30s timeout — on a large
  // index). Works with or without projectKey (all active projects).
  async: z.boolean().optional(),
});
export type ReindexInput = z.infer<typeof reindexSchema>;

// ─── Response schemas ────────────────────────────────────────

export const searchResultStatusSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  category: statusCategorySchema,
});
export type SearchResultStatus = z.infer<typeof searchResultStatusSchema>;

export const searchResultProjectSchema = z.object({
  id: z.guid(),
  key: z.string(),
  name: z.string(),
  color: z.string().nullable(),
});
export type SearchResultProject = z.infer<typeof searchResultProjectSchema>;

/**
 * Issue shape rendered in search results. Narrower than `IssueDetail` — only
 * fields the search hit list needs. Backend builds via `toSearchIssue`.
 */
export const searchIssueSchema = z.object({
  id: z.guid(),
  number: z.number().int(),
  title: z.string(),
  type: issueTypeSchema,
  priority: issuePrioritySchema,
  status: searchResultStatusSchema,
  assignee: userSummarySchema.nullable(),
  reporter: userSummarySchema,
  tags: z.array(tagSchema),
  dueDate: z.iso.datetime().nullable(),
  sprintName: z.string().nullable(),
  project: searchResultProjectSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type SearchIssue = z.infer<typeof searchIssueSchema>;

export const searchHighlightsSchema = z.object({
  title: z.array(z.string()).optional(),
  description: z.array(z.string()).optional(),
  commentBodies: z.array(z.string()).optional(),
});
export type SearchHighlights = z.infer<typeof searchHighlightsSchema>;

export const searchResultItemSchema = z.object({
  issue: searchIssueSchema,
  highlights: searchHighlightsSchema,
  score: z.number().nullable(),
});
export type SearchResultItem = z.infer<typeof searchResultItemSchema>;

export const parseErrorSchema = z.object({
  message: z.string(),
  pos: z.number().int().nonnegative(),
  length: z.number().int().nonnegative(),
});
export type ParseError = z.infer<typeof parseErrorSchema>;

export const searchMetaSchema = z.object({
  total: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
  pageSize: z.number().int().positive(),
  hasNextPage: z.boolean(),
  took: z.number().int().nonnegative(),
  query: z.object({
    filters: z.number().int().nonnegative(),
    hasSort: z.boolean(),
    errors: z.array(parseErrorSchema),
  }),
});
export type SearchMeta = z.infer<typeof searchMetaSchema>;

export const searchResponseSchema = z.object({
  items: z.array(searchResultItemSchema),
  meta: searchMetaSchema,
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

// ─── Autocomplete ────────────────────────────────────────────

export const AUTOCOMPLETE_SUGGESTION_TYPES = [
  'FIELD',
  'VALUE',
  'HASHTAG',
  'KEYWORD',
] as const;
export const autocompleteSuggestionTypeSchema = z.enum(
  AUTOCOMPLETE_SUGGESTION_TYPES,
);
export type AutocompleteSuggestionType = z.infer<
  typeof autocompleteSuggestionTypeSchema
>;

export const autocompleteSuggestionSchema = z.object({
  type: autocompleteSuggestionTypeSchema,
  label: z.string(),
  description: z.string().optional(),
  color: z.string().optional(),
  avatarUrl: z.string().optional(),
  icon: z.string().optional(),
});
export type AutocompleteSuggestion = z.infer<typeof autocompleteSuggestionSchema>;

// ─── Validate / Reindex ──────────────────────────────────────

export const validateResponseSchema = z.object({
  valid: z.boolean(),
  errors: z.array(parseErrorSchema),
});
export type ValidateResponse = z.infer<typeof validateResponseSchema>;

export const reindexResponseSchema = z.object({
  // Present on a synchronous reindex; absent when the reindex was queued.
  indexed: z.number().int().nonnegative().optional(),
  errors: z.number().int().nonnegative().optional(),
  projectId: z.guid().optional(),
  // True when the reindex was enqueued as a background job (async).
  queued: z.boolean().optional(),
  // Number of projects enqueued (async, all-projects reindex).
  projects: z.number().int().nonnegative().optional(),
});
export type ReindexResponse = z.infer<typeof reindexResponseSchema>;
