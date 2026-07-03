import { YouTrackClient } from '../youtrack/youtrack-client';
import { YtUser } from '../youtrack/types/yt-user.type';

// YouTrack lists users at /api/users (NOT /api/admin/users, which does not
// exist) and exposes the display name as `fullName`.
const USER_FIELDS = [
  'id', 'login', 'email', 'fullName', 'avatarUrl',
  'banned', 'online',
].join(',');

export class UsersExtractor {
  constructor(private yt: YouTrackClient) {}

  async *extract(): AsyncGenerator<YtUser[]> {
    yield* this.yt.paginate<YtUser>('/users', {
      fields: USER_FIELDS,
    });
  }
}
