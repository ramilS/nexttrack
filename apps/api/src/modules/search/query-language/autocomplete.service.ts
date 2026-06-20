import { Injectable, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { CustomFieldType } from '@prisma/client';
import { ValkeyService } from '@/valkey/valkey.service';
import { elasticsearchConfig } from '@/config';
import { CustomFieldsRepository } from '@/modules/custom-fields/custom-fields.repository';
import { ProjectMembersRepository } from '@/modules/projects/project-members.repository';
import { WorkflowsReader } from '@/modules/workflows/workflows.reader';
import { TagsReader } from '@/modules/tags/tags.reader';
import { ProjectsRepository } from '@/modules/projects/projects.repository';
import { VersionsRepository } from '@/modules/versions/versions.repository';
import type { AutocompleteSuggestion } from '@repo/shared/schemas';

interface FieldEnumOption {
  name: string;
  color?: string;
}

const BUILTIN_FIELDS = [
  { label: 'assignee', description: 'Filter by assignee' },
  { label: 'priority', description: 'Filter by priority' },
  { label: 'status', description: 'Filter by status' },
  { label: 'type', description: 'Filter by issue type' },
  { label: 'tag', description: 'Filter by tag' },
  { label: 'created', description: 'Filter by creation date' },
  { label: 'updated', description: 'Filter by update date' },
  { label: 'due date', description: 'Filter by due date' },
  { label: 'reporter', description: 'Filter by reporter' },
  { label: 'project', description: 'Filter by project' },
];

const PRESET_HASHTAGS = [
  { label: '#Unresolved', description: 'Unresolved issues' },
  { label: '#Resolved', description: 'Resolved issues' },
  { label: '#MyIssues', description: 'Assigned to me' },
  { label: '#Assigned', description: 'Has an assignee' },
  { label: '#Unassigned', description: 'No assignee' },
  { label: '#Overdue', description: 'Past due date' },
];

const USER_VALUE_LIMIT = 8;
const TAG_VALUE_LIMIT = 10;
const VERSION_VALUE_LIMIT = 10;
const PROJECT_VALUE_LIMIT = 10;

@Injectable()
export class AutocompleteService {
  constructor(
    private valkey: ValkeyService,
    private customFieldsRepo: CustomFieldsRepository,
    private membersRepo: ProjectMembersRepository,
    private workflowsRepo: WorkflowsReader,
    private tagsReader: TagsReader,
    private projectsRepo: ProjectsRepository,
    private versionsRepo: VersionsRepository,
    @Inject(elasticsearchConfig.KEY)
    private config: ConfigType<typeof elasticsearchConfig>,
  ) {}

  async getSuggestions(
    partialQuery: string,
    cursorPos: number,
    projectId: string | null,
    currentUserId: string,
  ): Promise<AutocompleteSuggestion[]> {
    const cacheKey = `autocomplete:${projectId ?? 'global'}:${partialQuery}:${cursorPos}`;
    const cached = await this.valkey.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const context = this.analyzeContext(partialQuery, cursorPos);
    let suggestions: AutocompleteSuggestion[];

    switch (context.type) {
      case 'FIELD_NAME':
        suggestions = await this.suggestFieldNames(context.partial, projectId);
        break;
      case 'FIELD_VALUE':
        suggestions = await this.suggestFieldValues(
          context.field!,
          context.partial,
          projectId,
          currentUserId,
        );
        break;
      case 'HASHTAG':
        suggestions = this.suggestHashtags(context.partial);
        break;
      default: {
        const fieldSuggestions = await this.suggestFieldNames(context.partial, null);
        suggestions = [
          ...fieldSuggestions.slice(0, 3),
          ...this.suggestHashtags(context.partial).slice(0, 3),
        ];
        break;
      }
    }

    await this.valkey.set(
      cacheKey,
      JSON.stringify(suggestions),
      this.config.autocompleteCacheTtl,
    );

    return suggestions;
  }

  private analyzeContext(
    query: string,
    cursorPos: number,
  ): {
    type: 'FIELD_NAME' | 'FIELD_VALUE' | 'HASHTAG' | 'FREE_TEXT';
    partial: string;
    field?: string;
  } {
    const beforeCursor = query.slice(0, cursorPos);

    // Check if typing after "fieldName: "
    const fieldValueMatch = beforeCursor.match(
      /(\w[\w\s]*?)\s*:\s*([^:,]*)$/,
    );
    if (fieldValueMatch) {
      return {
        type: 'FIELD_VALUE',
        field: fieldValueMatch[1].trim(),
        partial: fieldValueMatch[2].trim(),
      };
    }

    // Check if typing after "#"
    const hashMatch = beforeCursor.match(/#(\w*)$/);
    if (hashMatch) {
      return { type: 'HASHTAG', partial: hashMatch[1] };
    }

    // Check if typing a field name
    const wordMatch = beforeCursor.match(/(\w+)$/);
    if (wordMatch) {
      return { type: 'FIELD_NAME', partial: wordMatch[1] };
    }

    return { type: 'FREE_TEXT', partial: '' };
  }

  private async suggestFieldNames(
    partial: string,
    projectId: string | null,
  ): Promise<AutocompleteSuggestion[]> {
    const customFields = projectId
      ? await this.customFieldsRepo.findNameTypeRefsByProject(projectId)
      : [];

    const allFields = [
      ...BUILTIN_FIELDS,
      ...customFields.map((f) => ({
        label: `{${f.name}}`,
        description: `Custom field (${f.type})`,
      })),
    ];

    return allFields
      .filter((f) =>
        f.label.toLowerCase().startsWith(partial.toLowerCase()),
      )
      .map((f) => ({ type: 'FIELD' as const, ...f }));
  }

  private async suggestFieldValues(
    field: string,
    partial: string,
    projectId: string | null,
    _currentUserId: string,
  ): Promise<AutocompleteSuggestion[]> {
    switch (field.toLowerCase()) {
      case 'assignee':
      case 'reporter':
        return this.suggestUsers(partial, projectId);

      case 'priority':
        return ['Critical', 'High', 'Medium', 'Low']
          .filter((p) => p.toLowerCase().startsWith(partial.toLowerCase()))
          .map((p) => ({ type: 'VALUE' as const, label: p }));

      case 'type':
        return ['Task', 'Bug', 'Story', 'Epic', 'Feature']
          .filter((t) => t.toLowerCase().startsWith(partial.toLowerCase()))
          .map((t) => ({ type: 'VALUE' as const, label: t }));

      case 'status': {
        if (!projectId) return [];
        const statuses = await this.workflowsRepo.findDefaultStatuses(projectId);
        return statuses
          .filter((s) =>
            s.name.toLowerCase().startsWith(partial.toLowerCase()),
          )
          .map((s) => ({
            type: 'VALUE' as const,
            label: s.name,
            color: s.color,
          }));
      }

      case 'tag': {
        if (!projectId) return [];
        const tags = await this.tagsReader.findByNameContains(
          projectId,
          partial,
          TAG_VALUE_LIMIT,
        );
        return tags.map((t) => ({
          type: 'VALUE' as const,
          label: t.name,
          color: t.color,
        }));
      }

      case 'created':
      case 'updated':
      case 'due date':
      case 'resolved':
        return [
          { type: 'VALUE' as const, label: 'today', description: 'Today' },
          { type: 'VALUE' as const, label: '-7d', description: '7 days ago' },
          {
            type: 'VALUE' as const,
            label: '-30d',
            description: '30 days ago',
          },
          {
            type: 'VALUE' as const,
            label: 'today .. +7d',
            description: 'Next 7 days',
          },
        ].filter((v) => v.label.startsWith(partial));

      case 'project': {
        const projects = await this.projectsRepo.findActiveByKeyContains(
          partial,
          PROJECT_VALUE_LIMIT,
        );
        return projects.map((p) => ({
          type: 'VALUE' as const,
          label: p.key,
          description: p.name,
        }));
      }

      default:
        if (!projectId) return [];
        return this.suggestCustomFieldValues(field, partial, projectId);
    }
  }

  private async suggestUsers(
    partial: string,
    projectId: string | null,
  ): Promise<AutocompleteSuggestion[]> {
    const base: AutocompleteSuggestion[] = [
      {
        type: 'KEYWORD',
        label: 'me',
        description: 'Currently logged in user',
        icon: 'user',
      },
      {
        type: 'KEYWORD',
        label: '{Unassigned}',
        description: 'No assignee',
        icon: 'user-x',
      },
    ];

    if (!projectId) return base;

    const members = await this.membersRepo.findMembersByNameContains(
      projectId,
      partial,
      USER_VALUE_LIMIT,
    );

    return [
      ...base,
      ...members.map((u) => ({
        type: 'VALUE' as const,
        label: u.email,
        description: u.name,
        avatarUrl: u.avatarUrl ?? undefined,
      })),
    ];
  }

  private async suggestCustomFieldValues(
    fieldName: string,
    partial: string,
    projectId: string,
  ): Promise<AutocompleteSuggestion[]> {
    const cleanName = fieldName.replace(/[{}]/g, '');
    const field = await this.customFieldsRepo.findByNameInsensitive(
      projectId,
      cleanName,
    );

    if (!field) return [];

    if (
      field.type === CustomFieldType.ENUM ||
      field.type === CustomFieldType.MULTI_ENUM
    ) {
      const options = (field.config.options ?? []) as FieldEnumOption[];
      return options
        .filter((o) =>
          o.name.toLowerCase().startsWith(partial.toLowerCase()),
        )
        .map((o) => ({
          type: 'VALUE' as const,
          label: o.name,
          color: o.color,
        }));
    }

    if (
      field.type === CustomFieldType.VERSION ||
      field.type === CustomFieldType.MULTI_VERSION
    ) {
      const versions = await this.versionsRepo.findByNameContains(
        projectId,
        partial,
        VERSION_VALUE_LIMIT,
      );
      return versions.map((v) => ({
        type: 'VALUE' as const,
        label: v.name,
        description: v.status,
      }));
    }

    return [];
  }

  private suggestHashtags(partial: string): AutocompleteSuggestion[] {
    return PRESET_HASHTAGS.filter((h) =>
      h.label
        .toLowerCase()
        .startsWith(`#${partial}`.toLowerCase()),
    ).map((h) => ({ type: 'HASHTAG' as const, ...h }));
  }
}
