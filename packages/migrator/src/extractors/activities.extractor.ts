import { YouTrackClient } from '../youtrack/youtrack-client';
import { YtActivity } from '../youtrack/types/yt-activity.type';

// Field-change history. Categories cover the change log used for incident
// investigation: custom fields (state/assignee/priority/type/…), created,
// summary/description edits, links, tags, sprint. Comments/attachments are
// migrated as their own data (and shown in their tabs), so they're omitted here
// to avoid a duplicated timeline.
const ACTIVITY_CATEGORIES = [
  'CustomFieldCategory',
  'IssueCreatedCategory',
  'SummaryCategory',
  'DescriptionCategory',
  'SprintCategory',
  'LinksCategory',
  'TagsCategory',
].join(',');

const ACTIVITY_FIELDS = [
  'id',
  'timestamp',
  '$type',
  'author(id,login,name)',
  'field(name,$type)',
  'added(name,text,login,$type)',
  'removed(name,text,login,$type)',
].join(',');

export class ActivitiesExtractor {
  constructor(private yt: YouTrackClient) {}

  async getForIssue(ytIssueId: string): Promise<YtActivity[]> {
    return this.yt.get<YtActivity[]>(`/issues/${ytIssueId}/activities`, {
      categories: ACTIVITY_CATEGORIES,
      fields: ACTIVITY_FIELDS,
    });
  }
}
