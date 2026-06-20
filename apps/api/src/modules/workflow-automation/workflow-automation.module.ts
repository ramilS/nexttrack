import { Module } from '@nestjs/common';
import { WorkflowAutomationController } from './workflow-automation.controller';
import { WorkflowAutomationService } from './workflow-automation.service';
import { WorkflowEngine } from './workflow-engine';
import { ConditionEvaluator } from './condition-evaluator';
import { ActionExecutor } from './action-executor';
import { WorkflowRulesRepository } from './workflow-rules.repository';
@Module({
  // All three repos this module needs (Issues, Tags, Comments) live in the
  // global SharedRepositoriesModule. Importing the feature modules directly
  // would create a DI cycle once IssuesService consumes WorkflowEngine for
  // evaluateGuards.
  imports: [],
  controllers: [WorkflowAutomationController],
  providers: [
    WorkflowAutomationService,
    WorkflowEngine,
    ConditionEvaluator,
    ActionExecutor,
    WorkflowRulesRepository,
  ],
  exports: [WorkflowEngine, ConditionEvaluator],
})
export class WorkflowAutomationModule {}
