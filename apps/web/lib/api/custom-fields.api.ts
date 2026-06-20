import { apiClient } from './client';
import type {
  CustomField,
  CustomFieldType,
  CustomFieldValue,
  CreateCustomFieldInput,
  UpdateCustomFieldInput,
  AddEnumOptionInput,
  UpdateEnumOptionInput,
  ReorderCustomFieldsInput,
  ReorderEnumOptionsInput,
} from '@repo/shared/schemas';

export type {
  CustomField,
  CustomFieldType,
  CustomFieldValue,
  CreateCustomFieldInput,
  UpdateCustomFieldInput,
  AddEnumOptionInput,
  UpdateEnumOptionInput,
  ReorderCustomFieldsInput,
  ReorderEnumOptionsInput,
};

export const customFieldsApi = {
  list: (projectKey: string) =>
    apiClient.get<CustomField[]>(`/projects/${projectKey}/custom-fields`),

  get: (projectKey: string, fieldId: string) =>
    apiClient.get<CustomField>(`/projects/${projectKey}/custom-fields/${fieldId}`),

  create: (projectKey: string, data: CreateCustomFieldInput) =>
    apiClient.post<CustomField>(`/projects/${projectKey}/custom-fields`, data),

  update: (projectKey: string, fieldId: string, data: UpdateCustomFieldInput) =>
    apiClient.patch<CustomField>(`/projects/${projectKey}/custom-fields/${fieldId}`, data),

  delete: (projectKey: string, fieldId: string) =>
    apiClient.delete(`/projects/${projectKey}/custom-fields/${fieldId}`),

  reorder: (projectKey: string, ordinals: ReorderCustomFieldsInput['ordinals']) =>
    apiClient.put<CustomField[]>(`/projects/${projectKey}/custom-fields/reorder`, { ordinals }),

  // Enum options — the API returns the whole updated field (@ApiEnvelope(CustomFieldDto)),
  // not the single option; the new/updated option lives in field.config.
  addOption: (projectKey: string, fieldId: string, data: AddEnumOptionInput) =>
    apiClient.post<CustomField>(`/projects/${projectKey}/custom-fields/${fieldId}/options`, data),

  updateOption: (projectKey: string, fieldId: string, optionId: string, data: UpdateEnumOptionInput) =>
    apiClient.patch<CustomField>(`/projects/${projectKey}/custom-fields/${fieldId}/options/${optionId}`, data),

  deleteOption: (projectKey: string, fieldId: string, optionId: string) =>
    apiClient.delete(`/projects/${projectKey}/custom-fields/${fieldId}/options/${optionId}`),

  reorderOptions: (projectKey: string, fieldId: string, ordinals: ReorderEnumOptionsInput['ordinals']) =>
    apiClient.put<CustomField>(`/projects/${projectKey}/custom-fields/${fieldId}/options/reorder`, { ordinals }),

  // Field values on issues (endpoint is /issues/:issueId/fields)
  getIssueFields: (issueId: string) =>
    apiClient.get<CustomFieldValue[]>(`/issues/${issueId}/fields`),

  setIssueFieldValue: (issueId: string, fieldId: string, value: unknown) =>
    apiClient.patch<CustomFieldValue>(`/issues/${issueId}/fields/${fieldId}`, { value }),

  clearIssueFieldValue: (issueId: string, fieldId: string) =>
    apiClient.delete(`/issues/${issueId}/fields/${fieldId}`),
};
