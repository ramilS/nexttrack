import { Injectable } from '@nestjs/common';
import { DocUpdateProposalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { asJson } from '@/prisma/json';
import type { Tx } from '@/common/repository/tx.types';
import type { TiptapDoc } from '@repo/shared/schemas';

export interface DocUpdateProposalRecord {
  id: string;
  projectId: string;
  sourceIssueId: string;
  docIssueId: string;
  targetArticleId: string | null;
  proposedTitle: string;
  proposedContent: TiptapDoc;
  rationale: string;
  status: DocUpdateProposalStatus;
  baseArticleSha: string | null;
  baseArticleUpdatedAt: Date | null;
  conflictResolvedAt: Date | null;
  createdAt: Date;
  appliedAt: Date | null;
}

export interface CreateProposalInput {
  projectId: string;
  sourceIssueId: string;
  docIssueId: string;
  targetArticleId: string | null;
  proposedTitle: string;
  proposedContent: TiptapDoc;
  rationale: string;
  baseArticleSha: string | null;
  baseArticleUpdatedAt: Date | null;
}

function toRecord(
  row: Prisma.DocUpdateProposalGetPayload<object>,
): DocUpdateProposalRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    sourceIssueId: row.sourceIssueId,
    docIssueId: row.docIssueId,
    targetArticleId: row.targetArticleId,
    proposedTitle: row.proposedTitle,
    proposedContent: row.proposedContent as TiptapDoc,
    rationale: row.rationale,
    status: row.status,
    baseArticleSha: row.baseArticleSha,
    baseArticleUpdatedAt: row.baseArticleUpdatedAt,
    conflictResolvedAt: row.conflictResolvedAt,
    createdAt: row.createdAt,
    appliedAt: row.appliedAt,
  };
}

@Injectable()
export class DocUpdateProposalRepository {
  constructor(private prisma: PrismaService) {}

  async create(input: CreateProposalInput): Promise<DocUpdateProposalRecord> {
    const row = await this.prisma.docUpdateProposal.create({
      data: {
        projectId: input.projectId,
        sourceIssueId: input.sourceIssueId,
        docIssueId: input.docIssueId,
        targetArticleId: input.targetArticleId,
        proposedTitle: input.proposedTitle,
        proposedContent: asJson(input.proposedContent),
        rationale: input.rationale,
        baseArticleSha: input.baseArticleSha,
        baseArticleUpdatedAt: input.baseArticleUpdatedAt,
      },
    });
    return toRecord(row);
  }

  async findByDocIssueId(
    docIssueId: string,
    tx?: Tx,
  ): Promise<DocUpdateProposalRecord | null> {
    const db = tx ?? this.prisma;
    const row = await db.docUpdateProposal.findUnique({ where: { docIssueId } });
    return row ? toRecord(row) : null;
  }

  async hasPendingForSource(sourceIssueId: string): Promise<boolean> {
    const row = await this.prisma.docUpdateProposal.findFirst({
      where: { sourceIssueId, status: DocUpdateProposalStatus.PENDING },
      select: { id: true },
    });
    return row !== null;
  }

  async markApplied(id: string, when: Date, tx?: Tx): Promise<void> {
    const db = tx ?? this.prisma;
    await db.docUpdateProposal.update({
      where: { id },
      data: { status: DocUpdateProposalStatus.ACCEPTED, appliedAt: when },
    });
  }

  async markRejected(id: string, tx?: Tx): Promise<void> {
    const db = tx ?? this.prisma;
    await db.docUpdateProposal.update({
      where: { id },
      data: { status: DocUpdateProposalStatus.REJECTED },
    });
  }

  /**
   * Conflict escalation: store the AI-merged draft, re-baseline the OCC hash to
   * the article's current state, and stamp the resolution. Re-baselining means
   * that — absent further human edits — a subsequent move to Done sees the
   * article as "unchanged" and applies the reconciled draft cleanly.
   */
  async recordConflictResolution(
    id: string,
    mergedContent: TiptapDoc,
    newBaseSha: string,
    when: Date,
    tx?: Tx,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    await db.docUpdateProposal.update({
      where: { id },
      data: {
        proposedContent: asJson(mergedContent),
        baseArticleSha: newBaseSha,
        conflictResolvedAt: when,
      },
    });
  }
}
