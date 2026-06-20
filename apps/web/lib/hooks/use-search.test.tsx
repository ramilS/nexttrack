import { describe, it, expect } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { SearchResponse } from '@repo/shared/schemas';
import { buildIssueDto } from '@/test/factories';
import { searchKeys, applyCreatedIssueToSearchCache } from './use-search';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';

function seedList(meta?: Partial<SearchResponse['meta']>) {
  return {
    pages: [
      {
        items: [] as SearchResponse['items'],
        meta: {
          total: 0,
          nextCursor: null,
          pageSize: 25,
          hasNextPage: false,
          took: 3,
          query: { filters: 0, hasSort: false, errors: [] },
          ...meta,
        },
      } satisfies SearchResponse,
    ],
    pageParams: [null],
  };
}

describe('applyCreatedIssueToSearchCache', () => {
  it('prepends the created issue to the unfiltered list of its project', () => {
    const qc = new QueryClient();
    const key = searchKeys.results({ q: '', projectId: PROJECT_ID, pageSize: 25 });
    qc.setQueryData(key, seedList());

    const issue = buildIssueDto({ project: { id: PROJECT_ID, key: 'PROJ', name: 'Project', color: null } });

    applyCreatedIssueToSearchCache(qc, issue);

    const data = qc.getQueryData<ReturnType<typeof seedList>>(key);
    expect(data?.pages[0]?.items).toHaveLength(1);
    expect(data?.pages[0]?.items[0]?.issue.id).toBe(issue.id);
    expect(data?.pages[0]?.meta.total).toBe(1);
  });

  it('does not duplicate when the issue is already present', () => {
    const qc = new QueryClient();
    const key = searchKeys.results({ q: '', projectId: PROJECT_ID, pageSize: 25 });
    const issue = buildIssueDto({ project: { id: PROJECT_ID, key: 'PROJ', name: 'Project', color: null } });

    qc.setQueryData(key, seedList());
    applyCreatedIssueToSearchCache(qc, issue);
    applyCreatedIssueToSearchCache(qc, issue);

    const data = qc.getQueryData<ReturnType<typeof seedList>>(key);
    expect(data?.pages[0]?.items).toHaveLength(1);
    expect(data?.pages[0]?.meta.total).toBe(1);
  });

  it('does not touch lists of other projects', () => {
    const qc = new QueryClient();
    const otherKey = searchKeys.results({ q: '', projectId: 'other', pageSize: 25 });
    qc.setQueryData(otherKey, seedList());

    const issue = buildIssueDto({ project: { id: PROJECT_ID, key: 'PROJ', name: 'Project', color: null } });
    applyCreatedIssueToSearchCache(qc, issue);

    const data = qc.getQueryData<ReturnType<typeof seedList>>(otherKey);
    expect(data?.pages[0]?.items).toHaveLength(0);
  });

  it('invalidates filtered lists of the same project instead of inserting blindly', () => {
    const qc = new QueryClient();
    const filteredKey = searchKeys.results({ q: 'status:Open', projectId: PROJECT_ID, pageSize: 25 });
    qc.setQueryData(filteredKey, seedList());

    const issue = buildIssueDto({ project: { id: PROJECT_ID, key: 'PROJ', name: 'Project', color: null } });
    applyCreatedIssueToSearchCache(qc, issue);

    const state = qc.getQueryState(filteredKey);
    expect(state?.isInvalidated).toBe(true);
    // Not optimistically inserted — left for the refetch to reconcile.
    const data = qc.getQueryData<ReturnType<typeof seedList>>(filteredKey);
    expect(data?.pages[0]?.items).toHaveLength(0);
  });
});
