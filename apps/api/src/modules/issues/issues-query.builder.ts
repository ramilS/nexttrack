import { IssueType, Priority, Prisma } from '@prisma/client';
import { asJson } from '@/prisma/json';
import type {
  TiptapDoc,
  ListIssuesQueryParsed,
  FieldFilter,
} from '@repo/shared/schemas';

/**
 * Translation layer between domain patches / parsed query DTOs and Prisma's
 * input DSL. Pure functions only — extracted from `issues.repository.ts` to
 * keep that file focused on data access and to keep the Prisma WHERE/update
 * DSL out of the service layer (services pass the domain shapes below).
 */

/** Domain patch for a board move — scalar FKs, no Prisma relation ops. */
export interface BoardIssueMovePatch {
  statusId?: string;
  resolvedAt?: Date | null;
  sprintId?: string | null;
  parentId?: string | null;
}

/** Domain patch for a single-issue update. The mapper translates `description`
 *  (null → cleared) to the Prisma JSON write. */
export interface IssueUpdatePatch {
  title?: string;
  description?: TiptapDoc | null;
  type?: IssueType;
  priority?: Priority;
  estimate?: number | null;
  startDate?: Date | null;
  dueDate?: Date | null;
  statusId?: string;
  resolvedAt?: Date | null;
  assigneeId?: string | null;
  parentId?: string | null;
  sprintId?: string | null;
}

/** Domain patch for a bulk update (scalar fields only). */
export interface IssueBulkUpdatePatch {
  statusId?: string;
  resolvedAt?: Date | null;
  assigneeId?: string | null;
  priority?: Priority;
}

/** Parsed list query + scope used to build the issue-list WHERE clause. */
export interface IssueListFilter {
  dto: ListIssuesQueryParsed;
  projectId: string;
  currentUserId: string;
}

export function toIssueUpdateData(
  patch: IssueUpdatePatch,
): Prisma.IssueUncheckedUpdateInput {
  const data: Prisma.IssueUncheckedUpdateInput = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.description !== undefined) {
    data.description =
      patch.description === null ? Prisma.JsonNull : asJson(patch.description);
  }
  if (patch.type !== undefined) data.type = patch.type;
  if (patch.priority !== undefined) data.priority = patch.priority;
  if (patch.estimate !== undefined) data.estimate = patch.estimate;
  if (patch.startDate !== undefined) data.startDate = patch.startDate;
  if (patch.dueDate !== undefined) data.dueDate = patch.dueDate;
  if (patch.statusId !== undefined) data.statusId = patch.statusId;
  if (patch.resolvedAt !== undefined) data.resolvedAt = patch.resolvedAt;
  if (patch.assigneeId !== undefined) data.assigneeId = patch.assigneeId;
  if (patch.parentId !== undefined) data.parentId = patch.parentId;
  if (patch.sprintId !== undefined) data.sprintId = patch.sprintId;
  return data;
}

export function buildListWhere({
  dto,
  projectId,
  currentUserId,
}: IssueListFilter): Prisma.IssueWhereInput {
  const where: Prisma.IssueWhereInput = {
    projectId,
    deletedAt: dto.withDeleted ? undefined : null,
  };

  if (dto.search) {
    where.title = { contains: dto.search, mode: 'insensitive' };
  }

  if (dto.type?.length) where.type = { in: dto.type };
  if (dto.priority?.length) where.priority = { in: dto.priority };
  if (dto.statusId?.length) where.statusId = { in: dto.statusId };

  if (dto.assigneeId?.length) {
    const ids = dto.assigneeId.map((id) => (id === 'me' ? currentUserId : id));
    where.assigneeId = { in: ids };
  }

  if (dto.reporterId?.length) where.reporterId = { in: dto.reporterId };

  if (dto.tagIds?.length) {
    where.tags = { some: { tagId: { in: dto.tagIds } } };
  }

  if (dto.parentId === 'root') {
    where.parentId = null;
  } else if (dto.parentId) {
    where.parentId = dto.parentId;
  }

  if (dto.dueDateFrom || dto.dueDateTo) {
    where.dueDate = {
      ...(dto.dueDateFrom && { gte: new Date(dto.dueDateFrom) }),
      ...(dto.dueDateTo && { lte: new Date(dto.dueDateTo) }),
    };
  }

  if (dto.createdFrom || dto.createdTo) {
    where.createdAt = {
      ...(dto.createdFrom && { gte: new Date(dto.createdFrom) }),
      ...(dto.createdTo && { lte: new Date(dto.createdTo) }),
    };
  }

  if (dto.hasEstimate !== undefined) {
    where.estimate = dto.hasEstimate ? { not: null } : null;
  }

  if (dto.fieldFilters?.length) {
    where.AND = [
      ...((where.AND as Prisma.IssueWhereInput[]) ?? []),
      ...dto.fieldFilters.map(buildCustomFieldFilter),
    ];
  }

  return where;
}

function buildCustomFieldFilter(filter: FieldFilter): Prisma.IssueWhereInput {
  if (filter.operator === 'is_empty') {
    return {
      NOT: { customFieldValues: { some: { customFieldId: filter.fieldId } } },
    };
  }

  if (filter.operator === 'is_not_empty') {
    return {
      customFieldValues: { some: { customFieldId: filter.fieldId } },
    };
  }

  return {
    customFieldValues: {
      some: {
        customFieldId: filter.fieldId,
        ...buildValueCondition(filter.operator, filter.value),
      },
    },
  };
}

function buildValueCondition(
  operator: FieldFilter['operator'],
  value: unknown,
): Prisma.CustomFieldValueWhereInput {
  const json = value as Prisma.InputJsonValue;
  switch (operator) {
    case 'eq':
      return { value: { equals: json } };
    case 'in':
      return { value: { array_contains: json } };
    case 'gte':
      return { value: { gte: json } };
    case 'lte':
      return { value: { lte: json } };
    case 'between': {
      const [from, to] = (value as unknown[]) ?? [];
      return {
        AND: [
          { value: { gte: from as Prisma.InputJsonValue } },
          { value: { lte: to as Prisma.InputJsonValue } },
        ],
      };
    }
    default:
      return {};
  }
}
