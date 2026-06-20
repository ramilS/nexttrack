import { YouTrackClient } from '../youtrack/youtrack-client';
import { YtComment } from '../youtrack/types/yt-issue.type';

const COMMENT_FIELDS = [
  'id', 'text', 'author(id,login,email,name)',
  'created', 'updated', 'deleted',
].join(',');

export class CommentsExtractor {
  constructor(private yt: YouTrackClient) {}

  async getForIssue(ytIssueId: string): Promise<YtComment[]> {
    const comments = await this.yt.get<YtComment[]>(
      `/issues/${ytIssueId}/comments`,
      { fields: COMMENT_FIELDS },
    );

    return comments.filter((c) => !c.deleted);
  }
}
