import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

export interface WebhookRow {
  id: string;
  projectId: string;
  createdById: string;
  name: string;
  url: string;
  provider: string;
  secret: string;
  eventTypes: string[];
  isEnabled: boolean;
  disabledAt: Date | null;
  disabledReason: string | null;
  consecutiveFailures: number;
  lastDeliveryAt: Date | null;
  lastStatusCode: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookDeliveryContextRow {
  secret: string;
  url: string;
  provider: string;
  isEnabled: boolean;
  name: string;
}

export interface CreateWebhookInput {
  projectId: string;
  createdById: string;
  name: string;
  url: string;
  provider: string;
  secret: string;
  eventTypes: string[];
  isEnabled: boolean;
}

export interface UpdateWebhookPatch {
  name?: string;
  url?: string;
  secret?: string;
  eventTypes?: string[];
  isEnabled?: boolean;
  disabledAt?: Date | null;
  disabledReason?: string | null;
  consecutiveFailures?: number;
  lastDeliveryAt?: Date | null;
  lastStatusCode?: number | null;
}

export interface DeliveryLogInput {
  webhookId: string;
  outboxEventId: string;
  eventType: string;
  statusCode: number | null;
  success: boolean;
  error: string | null;
  durationMs: number;
}

@Injectable()
export class WebhooksRepository {
  constructor(private prisma: PrismaService) {}

  async findAllByProject(projectId: string): Promise<WebhookRow[]> {
    return this.prisma.projectWebhook.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findInProject(
    projectId: string,
    webhookId: string,
  ): Promise<WebhookRow | null> {
    return this.prisma.projectWebhook.findFirst({
      where: { id: webhookId, projectId },
    });
  }

  async findById(webhookId: string): Promise<WebhookRow | null> {
    return this.prisma.projectWebhook.findUnique({
      where: { id: webhookId },
    });
  }

  async findDeliveryContext(
    webhookId: string,
  ): Promise<WebhookDeliveryContextRow | null> {
    return this.prisma.projectWebhook.findUnique({
      where: { id: webhookId },
      select: { secret: true, url: true, provider: true, isEnabled: true, name: true },
    });
  }

  async create(input: CreateWebhookInput): Promise<WebhookRow> {
    return this.prisma.projectWebhook.create({
      data: input as Prisma.ProjectWebhookUncheckedCreateInput,
    });
  }

  async update(
    webhookId: string,
    patch: UpdateWebhookPatch,
  ): Promise<WebhookRow> {
    return this.prisma.projectWebhook.update({
      where: { id: webhookId },
      data: patch,
    });
  }

  async delete(webhookId: string): Promise<void> {
    await this.prisma.projectWebhook.delete({ where: { id: webhookId } });
  }

  async createDeliveryLog(input: DeliveryLogInput): Promise<void> {
    await this.prisma.webhookDeliveryLog.create({
      data: {
        webhookId: input.webhookId,
        outboxEventId: input.outboxEventId,
        eventType: input.eventType,
        statusCode: input.statusCode,
        success: input.success,
        error: input.error?.slice(0, 2000),
        durationMs: Math.max(0, Math.round(input.durationMs)),
      },
    });
  }
}
