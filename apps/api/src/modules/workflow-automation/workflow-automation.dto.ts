import { createZodDto } from 'nestjs-zod';
import {
  createWorkflowRuleSchema,
  updateWorkflowRuleSchema,
  testWorkflowRuleSchema,
  workflowRuleSchema,
  workflowRuleExecutionSchema,
  workflowRuleDryRunSchema,
} from '@repo/shared/schemas';
import { paginationQuerySchema } from '@/common/dto/pagination-query.dto';

/**
 * ZodDto wrappers over the shared schemas: validated by the global
 * AppZodValidationPipe and rendered into the OpenAPI document. The shared
 * package stays NestJS-free — only these thin classes live in the API.
 */
export class CreateWorkflowRuleDto extends createZodDto(createWorkflowRuleSchema) {}
export class UpdateWorkflowRuleDto extends createZodDto(updateWorkflowRuleSchema) {}
export class TestWorkflowRuleDto extends createZodDto(testWorkflowRuleSchema) {}
export class ExecutionsQueryDto extends createZodDto(paginationQuerySchema) {}

export class WorkflowRuleDto extends createZodDto(workflowRuleSchema) {}
export class WorkflowRuleExecutionDto extends createZodDto(workflowRuleExecutionSchema) {}
export class WorkflowRuleDryRunDto extends createZodDto(workflowRuleDryRunSchema) {}
