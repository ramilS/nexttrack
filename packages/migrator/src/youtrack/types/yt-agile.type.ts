export interface YtAgileBoard {
  id: string;
  name: string;
  projects?: { id: string; shortName: string }[];
  columnSettings?: {
    columns?: YtAgileBoardColumn[];
  };
  currentSprint?: { id: string; name: string } | null;
  sprints?: YtAgileSprint[];
}

export interface YtAgileBoardColumn {
  presentation: string;
  fieldValues?: { name: string }[];
}

export interface YtAgileSprint {
  id: string;
  name: string;
  goal?: string;
  start?: number;
  finish?: number;
  archived?: boolean;
  issues?: { id: string }[];
}
