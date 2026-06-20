import { Body, Controller, Get, Put } from '@nestjs/common';
import { Project } from '@prisma/client';
import { Permission } from '@repo/shared';
import type { AiDocsSettingsView } from '@repo/shared/schemas';
import { ProjectAuth } from '@/common/decorators/project-auth.decorator';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ReqProject } from '@/common/decorators/project.decorator';
import { AiDocsSettingsRepository } from './ai-docs-settings.repository';
import { DEFAULT_SUGGESTION_PROMPT } from './doc-suggestion.service';
import { DEFAULT_MERGE_PROMPT } from './doc-merge.service';
import { UpdateAiDocsSettingsDto } from './ai-docs.dto';

@Controller('projects/:key/ai-docs/settings')
@ProjectAuth()
export class AiDocsController {
  constructor(private readonly settings: AiDocsSettingsRepository) {}

  @Get()
  @RequirePermission(Permission.PROJECT_SETTINGS_UPDATE)
  async get(@ReqProject() project: Project): Promise<AiDocsSettingsView> {
    const current = await this.settings.find(project.id);
    return this.toView(current?.suggestionPrompt, current?.mergePrompt);
  }

  @Put()
  @RequirePermission(Permission.PROJECT_SETTINGS_UPDATE)
  async update(
    @ReqProject() project: Project,
    @Body() dto: UpdateAiDocsSettingsDto,
  ): Promise<AiDocsSettingsView> {
    const saved = await this.settings.upsert(project.id, {
      suggestionPrompt: dto.suggestionPrompt,
      mergePrompt: dto.mergePrompt,
    });
    return this.toView(saved.suggestionPrompt, saved.mergePrompt);
  }

  private toView(
    suggestionPrompt: string | null | undefined,
    mergePrompt: string | null | undefined,
  ): AiDocsSettingsView {
    return {
      suggestionPrompt: suggestionPrompt ?? null,
      mergePrompt: mergePrompt ?? null,
      defaults: {
        suggestion: DEFAULT_SUGGESTION_PROMPT,
        merge: DEFAULT_MERGE_PROMPT,
      },
    };
  }
}
