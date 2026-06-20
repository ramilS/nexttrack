import { createZodDto } from 'nestjs-zod';
import {
  createWorkflowSchema,
  updateWorkflowSchema,
  workflowSchema,
  workflowStatusSchema,
} from '@repo/shared/schemas';

/**
 * ZodDto wrappers over the shared schemas: validated by the global
 * AppZodValidationPipe and rendered into the OpenAPI document. The shared
 * package stays NestJS-free — only these thin classes live in the API.
 */
export class CreateWorkflowDto extends createZodDto(createWorkflowSchema) {}
export class UpdateWorkflowDto extends createZodDto(updateWorkflowSchema) {}

export class WorkflowDto extends createZodDto(workflowSchema) {}
export class WorkflowStatusDto extends createZodDto(workflowStatusSchema) {}
