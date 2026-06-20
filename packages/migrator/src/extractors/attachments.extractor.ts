import { Readable } from 'stream';
import { YouTrackClient } from '../youtrack/youtrack-client';
import { YtAttachment } from '../youtrack/types/yt-issue.type';

const ATTACHMENT_FIELDS = 'id,name,url,mimeType,size,author(id),created';

export class AttachmentsExtractor {
  constructor(private yt: YouTrackClient) {}

  async getForIssue(ytIssueId: string): Promise<YtAttachment[]> {
    return this.yt.get<YtAttachment[]>(
      `/issues/${ytIssueId}/attachments`,
      { fields: ATTACHMENT_FIELDS },
    );
  }

  async downloadStream(attachment: YtAttachment): Promise<Readable> {
    return this.yt.downloadAttachment(attachment.url);
  }
}
