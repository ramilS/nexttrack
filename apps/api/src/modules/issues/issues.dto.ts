import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  createIssueSchema,
  updateIssueSchema,
  listIssuesQuerySchema,
  bulkUpdateIssuesSchema,
  bulkUpdateResultSchema,
  issueDetailSchema,
  issueListItemSchema,
  userSummarySchema,
  activitySchema,
} from '@repo/shared/schemas';
import { cursorQuerySchema } from '@/common/dto/cursor-query.dto';

const issueActivitiesQuerySchema = cursorQuerySchema.extend({
  types: z.preprocess(
    (v) => (v ? (Array.isArray(v) ? v : [v]) : undefined),
    z.array(z.string()).optional(),
  ),
});

/**
 * ZodDto wrappers over the shared schemas: validated by the global
 * AppZodValidationPipe and rendered into the OpenAPI document. The shared
 * package stays NestJS-free — only these thin classes live in the API.
 */
export class CreateIssueDto extends createZodDto(createIssueSchema) {}
export class UpdateIssueDto extends createZodDto(updateIssueSchema) {}
export class ListIssuesQueryDto extends createZodDto(listIssuesQuerySchema) {}
export class BulkUpdateIssuesDto extends createZodDto(bulkUpdateIssuesSchema) {}
export class IssueActivitiesQueryDto extends createZodDto(issueActivitiesQuerySchema) {}

export class BulkUpdateResultDto extends createZodDto(bulkUpdateResultSchema) {}
export class IssueDetailDto extends createZodDto(issueDetailSchema) {}
export class IssueListItemDto extends createZodDto(issueListItemSchema) {}
export class UserSummaryDto extends createZodDto(userSummarySchema) {}
export class ActivityDto extends createZodDto(activitySchema) {}
