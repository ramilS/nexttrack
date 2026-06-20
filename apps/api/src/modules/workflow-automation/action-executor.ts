import { Injectable } from '@nestjs/common';
import { AppLogger } from '@/common/logging/app-logger';
import { Priority, IssueType } from '@prisma/client';
import {
  TRIGGER_USER_SENTINEL,
  type WorkflowAction,
} from '@repo/shared/schemas';
import { IssuesRepository } from '@/modules/issues/issues.repository';
import { TagsRepository } from '@/modules/tags/tags.repository';
import { CommentsRepository } from '@/modules/comments/comments.repository';

export interface ActionContext {
  issueId: string;
  projectId: string;
  triggeredBy: string;
}

@Injectable()
export class ActionExecutor {
  private readonly logger = new AppLogger(ActionExecutor.name);

  constructor(
    private issuesRepo: IssuesRepository,
    private tagsRepo: TagsRepository,
    private commentsRepo: CommentsRepository,
  ) {}

  async execute(action: WorkflowAction, context: ActionContext): Promise<void> {
    this.logger.log('Applying workflow action', {
      action: action.type,
      issueId: context.issueId,
      projectId: context.projectId,
    });

    switch (action.type) {
      case 'SET_STATUS':
        await this.issuesRepo.applyAutomationPatch(context.issueId, {
          statusId: action.statusId,
        });
        return;

      case 'SET_ASSIGNEE':
        await this.issuesRepo.applyAutomationPatch(context.issueId, {
          assigneeId: this.resolveAssignee(action.userId, context),
        });
        return;

      case 'SET_PRIORITY':
        await this.issuesRepo.applyAutomationPatch(context.issueId, {
          priority: action.priority as Priority,
        });
        return;

      case 'SET_TYPE':
        await this.issuesRepo.applyAutomationPatch(context.issueId, {
          type: action.issueType as IssueType,
        });
        return;

      case 'ADD_TAG':
        try {
          await this.tagsRepo.linkToIssue(context.issueId, action.tagId, context.projectId);
        } catch (err) {
          this.logger.warn('Tag link skipped (already exists or invalid)', {
            issueId: context.issueId,
            tagId: action.tagId,
            error: (err as Error).message,
          });
        }
        return;

      case 'REMOVE_TAG':
        await this.tagsRepo.unlinkFromIssue(context.issueId, action.tagId);
        return;

      case 'ADD_COMMENT':
        await this.commentsRepo.create({
          issueId: context.issueId,
          authorId: context.triggeredBy,
          parentId: null,
          body: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: action.body }] },
            ],
          },
        });
        return;

      case 'SET_DUE_DATE': {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + action.offsetDays);
        await this.issuesRepo.applyAutomationPatch(context.issueId, { dueDate });
        return;
      }

      case 'MOVE_TO_SPRINT':
        await this.issuesRepo.applyAutomationPatch(context.issueId, {
          sprintId: action.sprintId,
        });
        return;

      case 'BLOCK_TRANSITION':
        // Handled by IssuesService → WorkflowEngine.evaluateGuards before the
        // transition is applied. This branch is reached only if the action
        // somehow leaks into executeRules; treat it as a no-op.
        return;
    }
  }

  private resolveAssignee(userId: string, context: ActionContext): string {
    return userId === TRIGGER_USER_SENTINEL ? context.triggeredBy : userId;
  }
}
