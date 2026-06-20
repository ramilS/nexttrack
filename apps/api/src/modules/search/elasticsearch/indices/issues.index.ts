import type { estypes } from '@elastic/elasticsearch';

export const ISSUES_INDEX_SUFFIX = 'issues';

type IndicesCreateBody = Pick<estypes.IndicesCreateRequest, 'mappings' | 'settings'>;

export const ISSUES_MAPPING: IndicesCreateBody = {
  mappings: {
    // Reject silent schema drift: unmapped fields in indexed documents are
    // ignored instead of creating ad-hoc dynamic mappings.
    dynamic: false,
    properties: {
      id: { type: 'keyword' },
      projectId: { type: 'keyword' },
      projectKey: { type: 'keyword' },
      number: { type: 'integer' },

      title: {
        type: 'text',
        analyzer: 'standard',
        fields: {
          keyword: { type: 'keyword' },
        },
      },
      description: { type: 'text', analyzer: 'standard' },
      commentBodies: { type: 'text', analyzer: 'standard' },

      statusId: { type: 'keyword' },
      statusName: { type: 'keyword' },
      statusCategory: { type: 'keyword' },
      priority: { type: 'keyword' },
      type: { type: 'keyword' },
      assigneeId: { type: 'keyword' },
      assigneeName: { type: 'keyword' },
      assigneeEmail: { type: 'keyword' },
      reporterId: { type: 'keyword' },
      tagIds: { type: 'keyword' },
      tagNames: { type: 'keyword' },

      createdAt: { type: 'date' },
      updatedAt: { type: 'date' },
      resolvedAt: { type: 'date' },
      dueDate: { type: 'date' },

      estimate: { type: 'integer' },
      spent: { type: 'integer' },

      customFields: {
        type: 'nested',
        properties: {
          fieldId: { type: 'keyword' },
          fieldName: { type: 'keyword' },
          fieldType: { type: 'keyword' },
          valueKeyword: { type: 'keyword' },
          valueText: { type: 'text' },
          valueNumber: { type: 'float' },
          valueDate: { type: 'date' },
        },
      },

      isResolved: { type: 'boolean' },
      isDeleted: { type: 'boolean' },
      memberIds: { type: 'keyword' },
    },
  },
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
    analysis: {
      analyzer: {
        standard: {
          type: 'standard',
          stopwords: '_none_',
        },
      },
    },
  },
};
