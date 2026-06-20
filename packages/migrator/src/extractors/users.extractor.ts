import { YouTrackClient } from '../youtrack/youtrack-client';
import { YtUser } from '../youtrack/types/yt-user.type';

const USER_FIELDS = [
  'id', 'login', 'email', 'name', 'avatarUrl',
  'banned', 'online',
].join(',');

export class UsersExtractor {
  constructor(private yt: YouTrackClient) {}

  async *extract(): AsyncGenerator<YtUser[]> {
    yield* this.yt.paginate<YtUser>('/admin/users', {
      fields: USER_FIELDS,
    });
  }

  async getTotal(): Promise<number> {
    const users = await this.yt.get<YtUser[]>('/admin/users', {
      fields: 'id',
      $top: '0',
    });
    // YT doesn't return count directly; we estimate via pagination
    return -1; // unknown upfront
  }
}
