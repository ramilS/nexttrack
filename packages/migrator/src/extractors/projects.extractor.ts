import { YouTrackClient } from '../youtrack/youtrack-client';
import { YtProject } from '../youtrack/types/yt-project.type';

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
}
