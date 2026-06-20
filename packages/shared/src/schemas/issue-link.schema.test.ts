import { describe, it, expect } from 'vitest';
import {
  createIssueLinkSchema,
  groupedIssueLinksSchema,
  FRONTEND_LINK_TYPES,
} from './issue-link.schema';

const UUID = '11111111-1111-1111-1111-111111111111';

describe('createIssueLinkSchema', () => {
  it('accepts a valid frontend link type + uuid target', () => {
    const result = createIssueLinkSchema.safeParse({
      type: 'BLOCKS',
      targetIssueId: UUID,
    });
    expect(result.success).toBe(true);
  });

  it('accepts every frontend link type', () => {
    for (const type of FRONTEND_LINK_TYPES) {
      expect(
        createIssueLinkSchema.safeParse({ type, targetIssueId: UUID }).success,
      ).toBe(true);
    }
  });

  it('rejects a Prisma link type that is not a client-facing one', () => {
    // DEPENDS_ON is a stored Prisma value, never sent by clients.
    expect(
      createIssueLinkSchema.safeParse({ type: 'DEPENDS_ON', targetIssueId: UUID })
        .success,
    ).toBe(false);
  });

  it('rejects a non-uuid target', () => {
    expect(
      createIssueLinkSchema.safeParse({ type: 'RELATES_TO', targetIssueId: 'nope' })
        .success,
    ).toBe(false);
  });
});

describe('groupedIssueLinksSchema', () => {
  it('parses a grouped response with a nullable linked-issue status', () => {
    const result = groupedIssueLinksSchema.safeParse({
      type: 'BLOCKS',
      links: [
        {
          id: UUID,
          type: 'BLOCKS',
          direction: 'outward',
          linkedIssue: {
            id: UUID,
            number: 3,
            projectKey: 'NT',
            title: 'Linked',
            type: 'TASK',
            status: null,
          },
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
