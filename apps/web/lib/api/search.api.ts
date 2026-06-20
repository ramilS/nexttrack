import { apiClient } from './client';
import type {
  SearchQuery,
  SearchResponse,
  SearchResultItem,
  SearchMeta,
  AutocompleteQuery,
  AutocompleteSuggestion,
  ValidateResponse,
} from '@repo/shared/schemas';

export type {
  SearchQuery,
  SearchResponse,
  SearchResultItem,
  SearchMeta,
  AutocompleteQuery,
  AutocompleteSuggestion,
  ValidateResponse,
};

export const searchApi = {
  search: (params: SearchQuery) =>
    apiClient.get<SearchResponse>('/search', { params }),

  autocomplete: (params: AutocompleteQuery) =>
    apiClient.get<AutocompleteSuggestion[]>('/search/autocomplete', { params }),

  validate: (q: string) =>
    apiClient.get<ValidateResponse>('/search/validate', { params: { q } }),
};
