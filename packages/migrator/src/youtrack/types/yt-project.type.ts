export interface YtProject {
  id: string;
  shortName: string;
  name: string;
  description?: string;
  iconUrl?: string;
  archived?: boolean;
  customFields?: YtProjectCustomField[];
}

export interface YtProjectCustomField {
  field: {
    name: string;
    type?: { valueType?: string };
  };
  bundle?: {
    values: YtBundleValue[];
  };
}

export interface YtBundleValue {
  name: string;
  color?: { id?: string; background?: string; foreground?: string };
}

export interface YtState {
  id: string;
  name: string;
  isResolved?: boolean;
  isInitial?: boolean;
  color?: string;
}
