import { Injectable, Logger } from '@nestjs/common';
import { ConflictError, NotFoundError, ValidationError } from '@/common/errors/domain.errors';
import { ErrorCode } from '@repo/shared/error-codes';
import { CreateIssueLinkInput } from '@repo/shared/schemas';
import { ActivityType, IssueLinkType } from '@prisma/client';
import { FRONTEND_TO_PRISMA } from './issue-link.mapper';
import { ActivitiesService } from '@/modules/activities/activities.service';
import { BackgroundTasks } from '@/common/background/background-tasks.service';
import { IssueLinksRepository, IssueLinkRow } from './issue-links.repository';

const INVERSE_TYPE: Record<IssueLinkType, IssueLinkType> = {
  [IssueLinkType.DEPENDS_ON]: IssueLinkType.BLOCKS,
  [IssueLinkType.BLOCKS]: IssueLinkType.DEPENDS_ON,
  [IssueLinkType.DUPLICATES]: IssueLinkType.DUPLICATES,
  [IssueLinkType.RELATES_TO]: IssueLinkType.RELATES_TO,
  [IssueLinkType.IS_CLONED_FROM]: IssueLinkType.IS_CLONED_FROM,
};

@Injectable()
export class IssueLinksService {
  private readonly logger = new Logger(IssueLinksService.name);

  constructor(
    private linksRepo: IssueLinksRepository,
    private activitiesService: ActivitiesService,
    private background: BackgroundTasks,
  ) {}

  async create(issueId: string, dto: CreateIssueLinkInput, userId: string) {
    if (issueId === dto.targetIssueId) {
      throw new ValidationError(ErrorCode.LINK_SELF_REFERENCE, 'Cannot link an issue to itself');
    }

    const targetIssue = await this.linksRepo.findActiveProjectRef(dto.targetIssueId);
    if (!targetIssue) {
      throw new NotFoundError(ErrorCode.LINK_TARGET_NOT_FOUND, 'Target issue not found');
    }

    const { type: prismaType, flip } = FRONTEND_TO_PRISMA[dto.type];
    const sourceIssueId = flip ? dto.targetIssueId : issueId;
    const targetIssueId = flip ? issueId : dto.targetIssueId;

    if (prismaType === IssueLinkType.DEPENDS_ON) {
      await this.checkDependencyCycle(sourceIssueId, targetIssueId);
    }

    const existing = await this.linksRepo.findExisting(
      sourceIssueId,
      targetIssueId,
      prismaType,
    );
    if (existing) {
      throw new ConflictError(ErrorCode.LINK_DUPLICATE, 'This link already exists');
    }

    const link = await this.linksRepo.create({
      type: prismaType,
      sourceIssueId,
      targetIssueId,
      createdById: userId,
    });

    this.background.run(
      () =>
        this.recordLinkActivity(
          sourceIssueId,
          targetIssueId,
          userId,
          ActivityType.LINK_ADD,
          prismaType,
        ),
      (err) =>
        this.logger.error(`Failed to record link activity: ${err.message}`, err.stack),
    );

    return this.toLinkDto(link, issueId);
  }

  async remove(linkId: string, sourceIssueId: string, userId: string) {
    const link = await this.linksRepo.findByIdInIssue(linkId, sourceIssueId);
    if (!link) {
      throw new NotFoundError(ErrorCode.LINK_NOT_FOUND, 'Link not found');
    }

    await this.linksRepo.delete(linkId);

    this.background.run(
      () =>
        this.recordLinkActivity(
          link.sourceIssueId,
          link.targetIssueId,
          userId,
          ActivityType.LINK_REMOVE,
          link.type,
        ),
      (err) =>
        this.logger.error(`Failed to record link activity: ${err.message}`, err.stack),
    );
  }

  async findByIssue(issueId: string) {
    const { outward, inward } = await this.linksRepo.findByIssue(issueId);
    const allLinks = [
      ...outward.map((l) => this.toLinkDto(l, issueId)),
      ...inward.map((l) => this.toLinkDto(l, issueId)),
    ];
    return this.groupByType(allLinks);
  }

  private async checkDependencyCycle(
    sourceIssueId: string,
    targetIssueId: string,
  ) {
    const visited = new Set<string>();
    const queue = [targetIssueId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === sourceIssueId) {
        throw new ValidationError(
          ErrorCode.LINK_CYCLE_DETECTED,
          'Adding this dependency would create a circular dependency chain',
        );
      }

      if (visited.has(current)) continue;
      visited.add(current);

      const targets = await this.linksRepo.findDependsOnTargets(current);
      for (const id of targets) {
        if (!visited.has(id)) queue.push(id);
      }
    }
  }

  private async recordLinkActivity(
    sourceIssueId: string,
    targetIssueId: string,
    userId: string,
    type: ActivityType,
    linkType: IssueLinkType,
  ) {
    const refs = await this.linksRepo.findIssueRefsByIds([sourceIssueId, targetIssueId]);
    const source = refs.get(sourceIssueId);
    const target = refs.get(targetIssueId);

    const sourceKey = source ? `${source.projectKey}-${source.number}` : sourceIssueId;
    const targetKey = target ? `${target.projectKey}-${target.number}` : targetIssueId;

    const payload = { linkType, targetIssueId, targetKey };
    const inversePayload = { linkType: INVERSE_TYPE[linkType], targetIssueId: sourceIssueId, targetKey: sourceKey };

    await Promise.all([
      this.activitiesService.recordOne(sourceIssueId, userId, type, payload),
      this.activitiesService.recordOne(targetIssueId, userId, type, inversePayload),
    ]);
  }

  private toLinkDto(link: IssueLinkRow, perspectiveIssueId: string) {
    const isOutward = link.sourceIssueId === perspectiveIssueId;
    const linkedIssue = isOutward ? link.targetIssue : link.sourceIssue;
    const direction = isOutward ? 'outward' : 'inward';
    const defaultWorkflow = linkedIssue.project.workflows[0];
    const statuses = defaultWorkflow ? defaultWorkflow.statuses : [];
    const status = statuses.find((s) => s.id === linkedIssue.statusId) ?? null;

    return {
      id: link.id,
      type: link.type,
      direction,
      linkedIssue: {
        id: linkedIssue.id,
        number: linkedIssue.number,
        projectKey: linkedIssue.project.key,
        title: linkedIssue.title,
        type: linkedIssue.type,
        status,
      },
      createdAt: link.createdAt.toISOString(),
    };
  }

  private groupByType(links: ReturnType<typeof this.toLinkDto>[]) {
    const groups = [
      {
        type: 'IS_BLOCKED_BY' as const,
        links: links.filter(
          (l) =>
            (l.type === IssueLinkType.DEPENDS_ON && l.direction === 'outward') ||
            (l.type === IssueLinkType.BLOCKS && l.direction === 'inward'),
        ),
      },
      {
        type: 'BLOCKS' as const,
        links: links.filter(
          (l) =>
            (l.type === IssueLinkType.BLOCKS && l.direction === 'outward') ||
            (l.type === IssueLinkType.DEPENDS_ON && l.direction === 'inward'),
        ),
      },
      {
        type: 'DUPLICATES' as const,
        links: links.filter(
          (l) => l.type === IssueLinkType.DUPLICATES && l.direction === 'outward',
        ),
      },
      {
        type: 'IS_DUPLICATED_BY' as const,
        links: links.filter(
          (l) => l.type === IssueLinkType.DUPLICATES && l.direction === 'inward',
        ),
      },
      {
        type: 'RELATES_TO' as const,
        links: links.filter((l) => l.type === IssueLinkType.RELATES_TO),
      },
    ];

    return groups.filter((g) => g.links.length > 0);
  }
}
