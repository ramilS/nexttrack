import { Injectable } from '@nestjs/common';

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

@Injectable()
export class ConditionEvaluator {
  /**
   * Evaluates a condition tree against an issue context. The condition is
   * arbitrary JSON from the database — we narrow each branch as we walk it.
   * See Group 14 for the planned DSL repair (currently the DSL drifts
   * between this evaluator and what the frontend rule-form-dialog serializes).
   */
  evaluate(condition: unknown, context: EvaluationContext): boolean {
    if (!condition || typeof condition !== 'object') {
      return true;
    }

    const cond = condition as Record<string, unknown>;

    if (Array.isArray(cond.and)) {
      return cond.and.every((c) => this.evaluate(c, context));
    }

    if (Array.isArray(cond.or)) {
      return cond.or.some((c) => this.evaluate(c, context));
    }

    return this.evaluateField(cond, context);
  }

  private evaluateField(condition: Record<string, unknown>, context: EvaluationContext): boolean {
    const field = condition.field as string | undefined;
    const op = condition.op as string | undefined;
    const value = condition.value as string | undefined;
    const values = condition.values as string[] | undefined;

    switch (field) {
      case 'type':
        return this.evaluateList(context.issue.type, op, values);
      case 'priority':
        return this.evaluateComparable(context.issue.priority, op, value);
      case 'status':
        return this.evaluateEquals(context.issue.statusId, op, value);
      case 'status.category':
        return context.issue.statusCategory === value;
      case 'assignee':
        return this.evaluateAssignee(context.issue.assigneeId, op, value);
      case 'tag':
        return this.evaluateTag(context.issue.tagIds, op, value);
      case 'oldStatus':
        return context.oldStatusId === value;
      case 'newStatus':
        return context.newStatusId === value;
      default:
        return true;
    }
  }

  private evaluateList(actual: string, op: string | undefined, values: string[] | undefined): boolean {
    if (!values || !Array.isArray(values)) return true;
    return op === 'in' ? values.includes(actual) : !values.includes(actual);
  }

  private evaluateEquals(actual: string, op: string | undefined, value: string | undefined): boolean {
    if (value === undefined) return true;
    return op === 'eq' ? actual === value : actual !== value;
  }

  private evaluateComparable(actual: string, op: string | undefined, value: string | undefined): boolean {
    const priorityOrder: Record<string, number> = {
      LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3,
    };
    const a = priorityOrder[actual] ?? 0;
    const v = value !== undefined ? (priorityOrder[value] ?? 0) : 0;

    switch (op) {
      case 'eq': return a === v;
      case 'gte': return a >= v;
      case 'lte': return a <= v;
      default: return true;
    }
  }

  private evaluateAssignee(assigneeId: string | null, op: string | undefined, value: string | undefined): boolean {
    switch (op) {
      case 'is_empty': return assigneeId === null;
      case 'is_not_empty': return assigneeId !== null;
      case 'eq': return assigneeId === value;
      default: return true;
    }
  }

  private evaluateTag(tagIds: string[], op: string | undefined, value: string | undefined): boolean {
    if (value === undefined) return true;
    return op === 'contains' ? tagIds.includes(value) : !tagIds.includes(value);
  }
}
