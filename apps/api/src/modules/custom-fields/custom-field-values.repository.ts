import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { asJson } from '@/prisma/json';
import { TransactionService } from '@/common/repository/transaction.service';
import type { Tx } from '@/common/repository/tx.types';

export interface RawCustomFieldValue {
  id: string;
  issueId: string;
  customFieldId: string;
  value: unknown;
}

@Injectable()
export class CustomFieldValuesRepository {
  constructor(
    private prisma: PrismaService,
    private txService: TransactionService,
  ) {}

  /** All values for a specific issue, restricted to the given field ids. */
  async findByIssueAndFields(
    issueId: string,
    fieldIds: string[],
  ): Promise<Array<{ customFieldId: string; value: unknown }>> {
    if (fieldIds.length === 0) return [];
    return this.prisma.customFieldValue.findMany({
      where: { issueId, customFieldId: { in: fieldIds } },
      select: { customFieldId: true, value: true },
    });
  }

  async findByIssueAndField(
    issueId: string,
    fieldId: string,
  ): Promise<RawCustomFieldValue | null> {
    const row = await this.prisma.customFieldValue.findUnique({
      where: { issueId_customFieldId: { issueId, customFieldId: fieldId } },
      select: { id: true, issueId: true, customFieldId: true, value: true },
    });
    return row;
  }

  async upsert(
    issueId: string,
    fieldId: string,
    value: unknown,
    tx?: Tx,
  ): Promise<void> {
    await (tx ?? this.prisma).customFieldValue.upsert({
      where: { issueId_customFieldId: { issueId, customFieldId: fieldId } },
      create: { issueId, customFieldId: fieldId, value: asJson(value) },
      update: { value: asJson(value) },
    });
  }

  async deleteById(id: string): Promise<void> {
    await this.prisma.customFieldValue.delete({ where: { id } });
  }

  /**
   * Returns all values whose stored value references the given option id.
   * For single-select (`isMulti=false`) the stored value === optionId.
   * For multi-select (`isMulti=true`) the stored value is an array that
   * contains optionId.
   */
  async findValuesUsingOption(
    fieldId: string,
    optionId: string,
    isMulti: boolean,
  ): Promise<Array<{ id: string; issueId: string; value: unknown }>> {
    const allValues = await this.prisma.customFieldValue.findMany({
      where: { customFieldId: fieldId },
      select: { id: true, issueId: true, value: true },
    });

    return allValues.filter((v) => {
      if (isMulti) {
        return Array.isArray(v.value) && (v.value as unknown[]).includes(optionId);
      }
      return v.value === optionId;
    });
  }

  /**
   * Clear `optionId` from every value of `fieldId`. For single-select fields
   * this deletes the affected rows. For multi-select fields it removes the
   * option from each array; rows whose array becomes empty are deleted.
   */
  async clearOptionFromValues(
    fieldId: string,
    optionId: string,
    isMulti: boolean,
  ): Promise<void> {
    const affected = await this.findValuesUsingOption(fieldId, optionId, isMulti);
    if (affected.length === 0) return;

    if (!isMulti) {
      await this.prisma.customFieldValue.deleteMany({
        where: { id: { in: affected.map((v) => v.id) } },
      });
      return;
    }

    const toDelete: string[] = [];
    const toUpdate: Array<{ id: string; remaining: string[] }> = [];

    for (const v of affected) {
      const remaining = (v.value as string[]).filter((id) => id !== optionId);
      if (remaining.length === 0) {
        toDelete.push(v.id);
      } else {
        toUpdate.push({ id: v.id, remaining });
      }
    }

    await this.txService.run(async (tx) => {
      if (toDelete.length > 0) {
        await tx.customFieldValue.deleteMany({ where: { id: { in: toDelete } } });
      }
      for (const item of toUpdate) {
        await tx.customFieldValue.update({
          where: { id: item.id },
          data: { value: asJson(item.remaining) },
        });
      }
    });
  }
}
