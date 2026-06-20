import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

export interface TelegramConfigRow {
  id: string;
  projectId: string;
  createdById: string;
  name: string;
  botToken: string;
  chatId: string;
  parseMode: string;
  messageTemplate: string | null;
  eventTypes: string[];
  isEnabled: boolean;
  disabledAt: Date | null;
  disabledReason: string | null;
  consecutiveFailures: number;
  lastDeliveryAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTelegramConfigInput {
  projectId: string;
  createdById: string;
  name: string;
  botToken: string;
  chatId: string;
  messageTemplate?: string | null;
  eventTypes: string[];
  isEnabled: boolean;
  parseMode?: string;
}

export interface UpdateTelegramConfigPatch {
  name?: string;
  botToken?: string;
  chatId?: string;
  messageTemplate?: string | null;
  eventTypes?: string[];
  isEnabled?: boolean;
  parseMode?: string;
  disabledAt?: Date | null;
  disabledReason?: string | null;
  consecutiveFailures?: number;
  lastDeliveryAt?: Date | null;
}

@Injectable()
export class TelegramRepository {
  constructor(private prisma: PrismaService) {}

  async findByProjectId(projectId: string): Promise<TelegramConfigRow | null> {
    return this.prisma.projectTelegramConfig.findUnique({
      where: { projectId },
    });
  }

  async findBotTokenById(id: string): Promise<{ botToken: string } | null> {
    return this.prisma.projectTelegramConfig.findUnique({
      where: { id },
      select: { botToken: true },
    });
  }

  async findById(id: string): Promise<TelegramConfigRow | null> {
    return this.prisma.projectTelegramConfig.findUnique({ where: { id } });
  }

  async create(input: CreateTelegramConfigInput): Promise<TelegramConfigRow> {
    return this.prisma.projectTelegramConfig.create({
      data: input as Prisma.ProjectTelegramConfigUncheckedCreateInput,
    });
  }

  async updateByProjectId(
    projectId: string,
    patch: UpdateTelegramConfigPatch,
  ): Promise<TelegramConfigRow> {
    return this.prisma.projectTelegramConfig.update({
      where: { projectId },
      data: patch,
    });
  }

  async updateById(
    id: string,
    patch: UpdateTelegramConfigPatch,
  ): Promise<void> {
    await this.prisma.projectTelegramConfig.update({
      where: { id },
      data: patch,
    });
  }

  async deleteByProjectId(projectId: string): Promise<void> {
    await this.prisma.projectTelegramConfig.delete({ where: { projectId } });
  }
}
