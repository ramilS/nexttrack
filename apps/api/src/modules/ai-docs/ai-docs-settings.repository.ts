import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

export interface AiDocsSettingsRecord {
  suggestionPrompt: string | null;
  mergePrompt: string | null;
}

@Injectable()
export class AiDocsSettingsRepository {
  constructor(private prisma: PrismaService) {}

  find(projectId: string): Promise<AiDocsSettingsRecord | null> {
    return this.prisma.projectAiDocsSettings.findUnique({
      where: { projectId },
      select: { suggestionPrompt: true, mergePrompt: true },
    });
  }

  upsert(
    projectId: string,
    data: AiDocsSettingsRecord,
  ): Promise<AiDocsSettingsRecord> {
    return this.prisma.projectAiDocsSettings.upsert({
      where: { projectId },
      create: { projectId, ...data },
      update: data,
      select: { suggestionPrompt: true, mergePrompt: true },
    });
  }
}
