export interface YtUser {
  id: string;
  login: string;
  email: string;
  name: string;
  avatarUrl?: string;
  banned?: boolean;
  online?: boolean;
}
