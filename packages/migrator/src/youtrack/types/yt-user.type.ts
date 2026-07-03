export interface YtUser {
  id: string;
  login: string;
  email?: string;
  // YouTrack's User entity exposes the display name as `fullName`, not `name`.
  fullName?: string;
  avatarUrl?: string;
  banned?: boolean;
  online?: boolean;
}
