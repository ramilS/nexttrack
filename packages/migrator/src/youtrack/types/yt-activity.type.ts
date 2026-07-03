import { YtUserRef } from './yt-issue.type';

// A single YouTrack activity item. `added`/`removed` are polymorphic: arrays of
// bundle elements/tags/issues ({name}/{$type}), a raw string (text fields), a
// number (numeric fields), or null.
export interface YtActivity {
  id: string;
  $type: string;
  timestamp: number;
  author: YtUserRef;
  field?: { name?: string; $type?: string };
  added?: unknown;
  removed?: unknown;
}
