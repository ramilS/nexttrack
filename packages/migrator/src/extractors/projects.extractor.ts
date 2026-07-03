import { YouTrackClient } from '../youtrack/youtrack-client';
import { YtProject, YtState } from '../youtrack/types/yt-project.type';

const PROJECT_FIELDS = [
  'id', 'shortName', 'name', 'description',
  'iconUrl', 'archived',
  'customFields(field(name,type(valueType)),bundle(values(name,color)))',
].join(',');

export class ProjectsExtractor {
  constructor(private yt: YouTrackClient) {}

  async extractProjects(keys?: string[]): Promise<YtProject[]> {
    const projects = await this.yt.get<YtProject[]>('/admin/projects', {
      fields: PROJECT_FIELDS,
      $top: '500',
    });

    if (keys && keys.length > 0) {
      const keySet = new Set(keys.map((k) => k.toUpperCase()));
      return projects.filter((p) => keySet.has(p.shortName.toUpperCase()));
    }

    return projects.filter((p) => !p.archived);
  }

  // The project's "State" bundle values, in order — used to provision the target
  // workflow so issue statuses map by name. Empty if the project has no State field.
  async getStates(projectId: string): Promise<YtState[]> {
    const fields = await this.yt.get<
      Array<{
        field?: { name?: string };
        bundle?: {
          values?: Array<{ name: string; isResolved?: boolean; color?: { background?: string } }>;
        };
      }>
    >(`/admin/projects/${projectId}/customFields`, {
      fields: 'field(name),bundle(values(name,isResolved,color(background)))',
    });

    const stateField = fields.find(
      (f) => f.field?.name?.toLowerCase() === 'state',
    );
    if (!stateField?.bundle?.values) return [];

    return stateField.bundle.values.map((v, i) => ({
      id: `state-${i}`,
      name: v.name,
      isResolved: v.isResolved ?? false,
      color: v.color?.background,
    }));
  }
}
