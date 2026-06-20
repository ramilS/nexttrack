export interface YtIssue {
  id: string;
  numberInProject: number;
  summary: string;
  description?: string;
  created: number;
  updated: number;
  resolved?: number;
  type?: { id: string; name: string };
  priority?: { id: string; name: string };
  state?: { id: string; name: string; isResolved?: boolean };
  assignee?: YtUserRef;
  reporter: YtUserRef;
  parent?: { id: string; numberInProject: number };
  sprint?: { id: string; name: string };
  tags?: { id: string; name: string; color?: any }[];
  customFields?: YtCustomField[];
  dueDate?: number;
}

export interface YtUserRef {
  id: string;
  login: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
}

export interface YtCustomField {
  name: string;
  value: any;
  type?: string;
  $type?: string;
}

export interface YtComment {
  id: string;
  text: string;
  author: YtUserRef;
  created: number;
  updated: number;
  deleted?: boolean;
}

export interface YtAttachment {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
  author?: { id: string };
  created: number;
}

export interface YtTimeEntry {
  id: string;
  date: number;
  duration: { minutes: number };
  text?: string;
  author: YtUserRef;
  type?: { name: string };
  created: number;
}
