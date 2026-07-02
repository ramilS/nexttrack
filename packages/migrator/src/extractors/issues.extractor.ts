import { YouTrackClient } from '../youtrack/youtrack-client';
import { YtIssue } from '../youtrack/types/yt-issue.type';

const ISSUE_FIELDS = [
  'id', 'numberInProject', 'summary', 'description',
  'created', 'updated', 'resolved',
  'type(id,name)',
  'priority(id,name)',
  'state(id,name,isResolved)',
  'assignee(id,login,email,name,avatarUrl)',
  'reporter(id,login,email,name)',
  'sprint(id,name)',
  'tags(id,name,color)',
  'links(direction,linkType(name,sourceToTarget,targetToSource),issues(id))',
  'customFields(name,value(id,name,text,minutes,date,avatarUrl,login,email),$type)',
  'dueDate',
].join(',');

export interface ExtractOptions {
  withClosedIssues: boolean;
  batchSize: number;
}

export class IssuesExtractor {
  constructor(private yt: YouTrackClient) {}

  async *extract(
    projectKey: string,
    options: ExtractOptions,
  ): AsyncGenerator<YtIssue[]> {
    const query = [
      `project: ${projectKey}`,
      options.withClosedIssues ? '' : '#Unresolved',
    ]
      .filter(Boolean)
      .join(' ');

    yield* this.yt.paginate<YtIssue>(
      '/issues',
      { query, fields: ISSUE_FIELDS },
      options.batchSize,
    );
  }
}
