import { z } from 'zod';
import { IssueType, Priority } from '@prisma/client';
import { tiptapContentSchema } from '@repo/shared/schemas';

export const createIssueMigrationSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: tiptapContentSchema.nullable().optional(),

  type: z.enum(IssueType).optional().default(IssueType.TASK),
  priority: z.enum(Priority).optional().default(Priority.MEDIUM),
  statusId: z.guid(),

  assigneeId: z.guid().nullable().optional(),
  reporterId: z.guid(),

  parentId: z.guid().nullable().optional(),
  dueDate: z.iso.datetime().nullable().optional(),

  estimate: z.number().int().positive().max(9999).nullable().optional(),

  fieldValues: z.array(z.object({
    fieldId: z.guid(),
    value: z.unknown(),
  })).optional().default([]),

  originalCreatedAt: z.iso.datetime().optional(),
  originalUpdatedAt: z.iso.datetime().optional(),
  originalResolvedAt: z.iso.datetime().nullable().optional(),

  ytId: z.string().min(1),
  ytNumber: z.number().int().positive().optional(),
});

export type CreateIssueMigrationDto = z.infer<typeof createIssueMigrationSchema>;
