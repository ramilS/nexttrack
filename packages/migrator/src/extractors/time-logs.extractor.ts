import { YouTrackClient } from '../youtrack/youtrack-client';
import { YtTimeEntry } from '../youtrack/types/yt-issue.type';

const TIME_ENTRY_FIELDS = [
  'id', 'date', 'duration(minutes)',
  'text', 'author(id,login,email,name)',
  'type(name)', 'created',
].join(',');

export class TimeLogsExtractor {
  constructor(private yt: YouTrackClient) {}

  async getForIssue(ytIssueId: string): Promise<YtTimeEntry[]> {
    return this.yt.get<YtTimeEntry[]>(
      `/issues/${ytIssueId}/timeTracking/workItems`,
      { fields: TIME_ENTRY_FIELDS },
    );
  }
}
