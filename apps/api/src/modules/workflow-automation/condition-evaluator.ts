import { Injectable } from '@nestjs/common';
import { Priority } from '@prisma/client';
import {
  conditionOperandFor,
  type ConditionField,
  type ConditionOp,
} from '@repo/shared/schemas';
import { AppLogger } from '@/common/logging/app-logger';

export interface EvaluationContext {
  issue: {
    type: string;
    priority: string;
    statusId: string;
    statusCategory?: string;
    assigneeId: string | null;
    tagIds: string[];
    customFields?: Record<string, unknown>;
  };
  oldStatusId?: string;
  newStatusId?: string;
}

/** Rank order for the priority comparison operators. */
const PRIORITY_RANK: Record<Priority, number> = {
  [Priority.LOW]: 0,
  [Priority.MEDIUM]: 1,
  [Priority.HIGH]: 2,
  [Priority.CRITICAL]: 3,
};

function priorityRank(value: string): number | undefined {
  return PRIORITY_RANK[value as Priority];
}

@Injectable()
export class ConditionEvaluator {
  private readonly logger = new AppLogger(ConditionEvaluator.name);

  /**
   * Evaluates a condition tree against an issue context. The condition is
   * arbitrary JSON from the database, so every branch is narrowed as it is
   * walked and anything unreadable evaluates to FALSE.
   *
   * Failing closed is the whole point: this used to return `true` for a
   * condition it could not interpret, which turned a rule the author wrote as a
   * narrow filter into one that fired on every issue in the project. A rule that
   * does not run is a visible bug; a rule that runs on everything can reassign
   * or block transitions across the whole project before anyone notices.
   *
   * The field/operator table lives in `@repo/shared` (`CONDITION_FIELD_OPS`) and
   * is what the write-time schema validates against, so a rule stored through
   * the API cannot reach the `false` fallbacks below — only one written before
   * that validation existed can.
   */
  evaluate(condition: unknown, context: EvaluationContext): boolean {
    if (condition === null || condition === undefined) {
      // No constraint expressed — the rule's trigger alone decides.
      return true;
    }

    if (typeof condition !== 'object') {
      return this.reject('condition is not an object', { condition });
    }

    const cond = condition as Record<string, unknown>;

    if (Object.keys(cond).length === 0) {
      // `{}` expresses no filter at all, which is not the same as a filter this
      // evaluator cannot read — the former matches, the latter must not.
      return true;
    }

    if (Array.isArray(cond.and)) {
      return cond.and.every((c) => this.evaluate(c, context));
    }

    if (Array.isArray(cond.or)) {
      return cond.or.some((c) => this.evaluate(c, context));
    }

    return this.evaluateLeaf(cond, context);
  }

  private reject(reason: string, details: Record<string, unknown>): false {
    this.logger.warn(`Workflow condition not evaluated: ${reason}`, details);
    return false;
  }

  private evaluateLeaf(
    leaf: Record<string, unknown>,
    context: EvaluationContext,
  ): boolean {
    const field = leaf.field as ConditionField | undefined;
    const op = leaf.op as ConditionOp | undefined;

    if (!field || !op) {
      return this.reject('leaf is missing field or op', { field, op });
    }

    const operand = conditionOperandFor(field, op);
    if (!operand) {
      return this.reject('operator is not supported for this field', {
        field,
        op,
      });
    }

    const value = typeof leaf.value === 'string' ? leaf.value : undefined;
    const values = Array.isArray(leaf.values)
      ? leaf.values.filter((v): v is string => typeof v === 'string')
      : undefined;

    if (operand === 'value' && value === undefined) {
      return this.reject('operator requires a value', { field, op });
    }
    if (operand === 'values' && (!values || values.length === 0)) {
      return this.reject('operator requires a values list', { field, op });
    }

    switch (field) {
      case 'type':
        return this.matchesList(context.issue.type, op, values ?? []);
      case 'priority':
        return this.matchesPriority(context.issue.priority, op, value);
      case 'status':
        return this.matchesText(context.issue.statusId, op, value);
      case 'status.category':
        return this.matchesText(context.issue.statusCategory ?? null, op, value);
      case 'assignee':
        return this.matchesAssignee(context.issue.assigneeId, op, value);
      case 'tag':
        return this.matchesTag(context.issue.tagIds, op, value);
      case 'oldStatus':
        return this.matchesText(context.oldStatusId ?? null, op, value);
      case 'newStatus':
        return this.matchesText(context.newStatusId ?? null, op, value);
    }
  }

  private matchesList(actual: string, op: ConditionOp, values: string[]): boolean {
    switch (op) {
      case 'in':
        return values.includes(actual);
      case 'not_in':
        return !values.includes(actual);
      default:
        return this.reject('unhandled list operator', { op });
    }
  }

  private matchesPriority(
    actual: string,
    op: ConditionOp,
    value: string | undefined,
  ): boolean {
    const actualRank = priorityRank(actual);
    const expectedRank = value === undefined ? undefined : priorityRank(value);
    if (actualRank === undefined || expectedRank === undefined) {
      // Ranking an unknown priority as LOW (the old `?? 0`) silently compared
      // against a value nobody wrote.
      return this.reject('priority is not a known value', { actual, value });
    }

    switch (op) {
      case 'eq':
        return actualRank === expectedRank;
      case 'neq':
        return actualRank !== expectedRank;
      case 'gte':
        return actualRank >= expectedRank;
      case 'lte':
        return actualRank <= expectedRank;
      default:
        return this.reject('unhandled priority operator', { op });
    }
  }

  private matchesText(
    actual: string | null,
    op: ConditionOp,
    value: string | undefined,
  ): boolean {
    switch (op) {
      case 'eq':
        return actual === value;
      case 'neq':
        return actual !== value;
      default:
        return this.reject('unhandled text operator', { op });
    }
  }

  private matchesAssignee(
    assigneeId: string | null,
    op: ConditionOp,
    value: string | undefined,
  ): boolean {
    switch (op) {
      case 'is_empty':
        return assigneeId === null;
      case 'is_not_empty':
        return assigneeId !== null;
      case 'eq':
        return assigneeId === value;
      case 'neq':
        return assigneeId !== value;
      default:
        return this.reject('unhandled assignee operator', { op });
    }
  }

  private matchesTag(
    tagIds: string[],
    op: ConditionOp,
    value: string | undefined,
  ): boolean {
    switch (op) {
      case 'contains':
        return value !== undefined && tagIds.includes(value);
      case 'not_contains':
        return value !== undefined && !tagIds.includes(value);
      default:
        return this.reject('unhandled tag operator', { op });
    }
  }
}
