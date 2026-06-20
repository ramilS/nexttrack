import { Injectable, Logger } from '@nestjs/common';
import { ValidationError } from '@/common/errors/domain.errors';
import { WorkflowTrigger } from '@prisma/client';
import { ErrorCode } from '@repo/shared/error-codes';
import type { WorkflowAction } from '@repo/shared/schemas';
import { ConditionEvaluator, EvaluationContext } from './condition-evaluator';
import { ActionExecutor, ActionContext } from './action-executor';
import {
  WorkflowRulesRepository,
  RuleExecutionRow,
} from './workflow-rules.repository';

const MAX_EXECUTION_DEPTH = 5;
const MAX_EXECUTIONS_PER_ISSUE_PER_MINUTE = 20;

@Injectable()
export class WorkflowEngine {
  private readonly logger = new Logger(WorkflowEngine.name);
  private executionDepth = 0;
  private recentExecutions = new Map<string, number[]>();

  constructor(
    private rulesRepo: WorkflowRulesRepository,
    private conditionEvaluator: ConditionEvaluator,
    private actionExecutor: ActionExecutor,
  ) {}

  async evaluateGuards(
    projectId: string,
    trigger: WorkflowTrigger,
    context: EvaluationContext,
  ): Promise<void> {
    const rules = await this.rulesRepo.findEnabledByTrigger(projectId, trigger);
    this.evaluateGuardsForRules(rules, context);
  }

  /** Enabled guard rules for a project + trigger. Fetch once, then evaluate
   * many contexts in memory via {@link evaluateGuardsForRules} (avoids N+1
   * in bulk paths). */
  findGuardRules(
    projectId: string,
    trigger: WorkflowTrigger,
  ): Promise<RuleExecutionRow[]> {
    return this.rulesRepo.findEnabledByTrigger(projectId, trigger);
  }

  /** Evaluate pre-fetched guard rules against a single context. Throws on the
   * first matching BLOCK_TRANSITION action. */
  evaluateGuardsForRules(
    rules: RuleExecutionRow[],
    context: EvaluationContext,
  ): void {
    for (const rule of rules) {
      if (!this.conditionEvaluator.evaluate(rule.conditions, context)) {
        continue;
      }

      for (const action of rule.actions) {
        if (action.type === 'BLOCK_TRANSITION') {
          throw new ValidationError(ErrorCode.WORKFLOW_RULE_BLOCKED, action.message);
        }
      }
    }
  }

  async executeRules(
    projectId: string,
    trigger: WorkflowTrigger,
    evaluationContext: EvaluationContext,
    actionContext: ActionContext,
  ): Promise<void> {
    // Prevent infinite recursion (rule A triggers rule B triggers rule A)
    if (this.executionDepth >= MAX_EXECUTION_DEPTH) {
      this.logger.warn(
        `Workflow execution depth limit (${MAX_EXECUTION_DEPTH}) reached for issue ${actionContext.issueId}. Skipping further rules.`,
      );
      return;
    }

    // Rate limit: prevent runaway executions on a single issue
    const issueKey = actionContext.issueId;
    const now = Date.now();
    const recent = this.recentExecutions.get(issueKey) ?? [];
    const oneMinuteAgo = now - 60_000;
    const recentFiltered = recent.filter((t) => t > oneMinuteAgo);
    if (recentFiltered.length >= MAX_EXECUTIONS_PER_ISSUE_PER_MINUTE) {
      this.logger.warn(
        `Workflow execution rate limit (${MAX_EXECUTIONS_PER_ISSUE_PER_MINUTE}/min) reached for issue ${issueKey}. Skipping.`,
      );
      return;
    }

    const rules = await this.rulesRepo.findEnabledByTrigger(projectId, trigger);

    this.executionDepth++;
    try {
      for (const rule of rules) {
        if (!this.conditionEvaluator.evaluate(rule.conditions, evaluationContext)) {
          continue;
        }

        // Track execution for rate limiting
        recentFiltered.push(now);
        this.recentExecutions.set(issueKey, recentFiltered);

        const startTime = Date.now();
        const actions = rule.actions.filter(
          (a) => a.type !== 'BLOCK_TRANSITION',
        );

        try {
          for (const action of actions) {
            await this.actionExecutor.execute(action, actionContext);
          }

          await this.rulesRepo.recordExecution({
            ruleId: rule.id,
            issueId: actionContext.issueId,
            triggeredBy: actionContext.triggeredBy,
            success: true,
            error: null,
            duration: Date.now() - startTime,
          });
        } catch (err) {
          const message = (err as Error).message;
          this.logger.error(`Rule ${rule.name} failed: ${message}`, (err as Error).stack);
          await this.rulesRepo.recordExecution({
            ruleId: rule.id,
            issueId: actionContext.issueId,
            triggeredBy: actionContext.triggeredBy,
            success: false,
            error: message,
            duration: Date.now() - startTime,
          });
        }
      }
    } finally {
      this.executionDepth--;
    }
  }

  async dryRun(
    ruleId: string,
    evaluationContext: EvaluationContext,
  ): Promise<{ matches: boolean; actions: WorkflowAction[] }> {
    const rule = await this.rulesRepo.findRawById(ruleId);

    if (!rule) {
      return { matches: false, actions: [] };
    }

    const matches = this.conditionEvaluator.evaluate(rule.conditions, evaluationContext);
    return {
      matches,
      actions: matches ? rule.actions : [],
    };
  }
}
