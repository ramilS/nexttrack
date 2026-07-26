import { YouTrackClient } from '../youtrack/youtrack-client';
import { YtAgileBoard } from '../youtrack/types/yt-agile.type';

const AGILE_FIELDS = [
  'id', 'name',
  'projects(id,shortName)',
  'columnSettings(columns(presentation,fieldValues(name)))',
  'currentSprint(id,name)',
  'sprints(id,name,goal,start,finish,archived,issues(id))',
].join(',');

export class BoardsExtractor {
  constructor(private yt: YouTrackClient) {}

  async extractForProject(projectKey: string): Promise<YtAgileBoard[]> {
    const boards = await this.yt.get<YtAgileBoard[]>('/agiles', {
      fields: AGILE_FIELDS,
      $top: '100',
    });

    return boards.filter((b) =>
      b.projects?.some(
        (p) => p.shortName.toUpperCase() === projectKey.toUpperCase(),
      ),
    );
  }
}
