import { Injectable } from "@nestjs/common";
import { ConflictError, NotFoundError } from "@/common/errors/domain.errors";
import { ErrorCode } from "@repo/shared/error-codes";
import type { CreateTagInput, UpdateTagInput, Tag } from "@repo/shared/schemas";
import { TagsRepository } from "./tags.repository";
import { IssuesReader } from "@/modules/issues/issues.reader";
import { TransactionService } from "@/common/repository/transaction.service";
import { DomainEventPublisher } from "@/modules/outbox/domain-event-publisher";
import { IssueTagAddedEvent, IssueTagRemovedEvent } from "./events/tag.events";

@Injectable()
export class TagsService {
  constructor(
    private tagsRepo: TagsRepository,
    private issuesRepo: IssuesReader,
    private txService: TransactionService,
    private domainEvents: DomainEventPublisher,
  ) {}

  async findAll(projectId: string): Promise<Tag[]> {
    return this.tagsRepo.findAllByProject(projectId);
  }

  async create(projectId: string, dto: CreateTagInput): Promise<Tag> {
    const existing = await this.tagsRepo.findByNameInsensitive(
      projectId,
      dto.name,
    );
    if (existing) {
      throw new ConflictError(
        ErrorCode.TAG_NAME_TAKEN,
        `Tag "${dto.name}" already exists in this project`,
      );
    }

    return this.tagsRepo.create({
      projectId,
      name: dto.name,
      color: dto.color,
    });
  }

  async update(
    projectId: string,
    id: string,
    dto: UpdateTagInput,
  ): Promise<Tag> {
    const tag = await this.tagsRepo.findById(id, projectId);
    if (!tag) {
      throw new NotFoundError(ErrorCode.NOT_FOUND);
    }

    if (dto.name) {
      const duplicate = await this.tagsRepo.findByNameInsensitive(
        projectId,
        dto.name,
        id,
      );
      if (duplicate) {
        throw new ConflictError(
          ErrorCode.TAG_NAME_TAKEN,
          `Tag "${dto.name}" already exists in this project`,
        );
      }
    }

    return this.tagsRepo.update(id, dto);
  }

  async remove(projectId: string, id: string): Promise<void> {
    const tag = await this.tagsRepo.findById(id, projectId);
    if (!tag) {
      throw new NotFoundError(ErrorCode.NOT_FOUND);
    }
    await this.tagsRepo.delete(id);
  }

  async addTagToIssue(
    issueId: string,
    tagId: string,
    userId: string,
  ): Promise<void> {
    const issueProjectId = await this.issuesRepo.findProjectIdById(issueId);
    if (!issueProjectId) {
      throw new NotFoundError(ErrorCode.NOT_FOUND);
    }

    const tag = await this.tagsRepo.findById(tagId);
    if (!tag || tag.projectId !== issueProjectId) {
      throw new NotFoundError(ErrorCode.NOT_FOUND);
    }

    const alreadyLinked = await this.tagsRepo.isLinkedToIssue(issueId, tagId);
    if (alreadyLinked) return;

    await this.txService.run(async (tx) => {
      await this.tagsRepo.linkToIssue(issueId, tagId, issueProjectId, tx);
      await this.domainEvents.publish(
        {
          eventType: "issue.tag-added",
          aggregateType: "Issue",
          aggregateId: issueId,
          payload: {
            ...new IssueTagAddedEvent(
              issueId,
              issueProjectId,
              userId,
              tagId,
              tag.name,
            ),
          },
        },
        tx,
      );
    });
  }

  async removeTagFromIssue(
    issueId: string,
    tagId: string,
    userId: string,
  ): Promise<void> {
    const issueProjectId = await this.issuesRepo.findProjectIdById(issueId);
    if (!issueProjectId) {
      throw new NotFoundError(ErrorCode.NOT_FOUND);
    }

    const tag = await this.tagsRepo.findById(tagId);
    if (!tag || tag.projectId !== issueProjectId) {
      throw new NotFoundError(ErrorCode.NOT_FOUND);
    }

    await this.txService.run(async (tx) => {
      const removed = await this.tagsRepo.unlinkFromIssue(issueId, tagId, tx);
      if (!removed) {
        throw new NotFoundError(ErrorCode.NOT_FOUND);
      }
      await this.domainEvents.publish(
        {
          eventType: "issue.tag-removed",
          aggregateType: "Issue",
          aggregateId: issueId,
          payload: {
            ...new IssueTagRemovedEvent(
              issueId,
              issueProjectId,
              userId,
              tagId,
              tag.name,
            ),
          },
        },
        tx,
      );
    });
  }
}
