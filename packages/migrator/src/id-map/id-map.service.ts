export class IdMapService {
  private users: Map<string, string> = new Map();
  private projects: Map<string, string> = new Map();
  private issues: Map<string, string> = new Map();
  private issueYtIdByNumber: Map<string, string> = new Map(); // "PROJECT-123" → ytId
  private customFields: Map<string, string> = new Map();
  private enumOptions: Map<string, string> = new Map();
  private statuses: Map<string, string> = new Map();

  registerUser(ytId: string, ourId: string): void {
    this.users.set(ytId, ourId);
  }

  registerIssue(ytId: string, ourId: string): void {
    this.issues.set(ytId, ourId);
  }

  registerIssueByNumber(projectKey: string, number: number, ytId: string): void {
    this.issueYtIdByNumber.set(`${projectKey}-${number}`, ytId);
  }

  registerProject(ytKey: string, ourId: string): void {
    this.projects.set(ytKey.toUpperCase(), ourId);
  }

  registerCustomField(name: string, ourId: string): void {
    this.customFields.set(name, ourId);
  }

  registerEnumOption(field: string, name: string, ourId: string): void {
    this.enumOptions.set(`${field}:${name}`, ourId);
  }

  registerStatus(projectKey: string, name: string, ourId: string): void {
    this.statuses.set(`${projectKey}:${name}`, ourId);
  }

  getUserId(ytId: string): string | null {
    return this.users.get(ytId) ?? null;
  }

  getAllUserIds(): string[] {
    return [...this.users.values()];
  }

  getIssueId(ytId: string): string | null {
    return this.issues.get(ytId) ?? null;
  }

  getProjectId(ytKey: string): string | null {
    return this.projects.get(ytKey.toUpperCase()) ?? null;
  }

  getCustomFieldId(name: string): string | null {
    return this.customFields.get(name) ?? null;
  }

  getEnumOptionId(field: string, name: string): string | null {
    return this.enumOptions.get(`${field}:${name}`) ?? null;
  }

  getStatusId(projectKey: string, name: string): string | null {
    return this.statuses.get(`${projectKey}:${name}`) ?? null;
  }

  getStatusMap(projectKey: string): Map<string, string> {
    const result = new Map<string, string>();
    for (const [key, value] of this.statuses) {
      if (key.startsWith(`${projectKey}:`)) {
        const statusName = key.slice(projectKey.length + 1);
        result.set(statusName, value);
      }
    }
    return result;
  }

  serialize(): Record<string, Record<string, string>> {
    return {
      users: Object.fromEntries(this.users),
      projects: Object.fromEntries(this.projects),
      issues: Object.fromEntries(this.issues),
      issueYtIdByNumber: Object.fromEntries(this.issueYtIdByNumber),
      customFields: Object.fromEntries(this.customFields),
      enumOptions: Object.fromEntries(this.enumOptions),
      statuses: Object.fromEntries(this.statuses),
    };
  }

  static deserialize(data: Record<string, Record<string, string>>): IdMapService {
    const map = new IdMapService();
    map.users = new Map(Object.entries(data.users ?? {}));
    map.projects = new Map(Object.entries(data.projects ?? {}));
    map.issues = new Map(Object.entries(data.issues ?? {}));
    map.issueYtIdByNumber = new Map(Object.entries(data.issueYtIdByNumber ?? {}));
    map.customFields = new Map(Object.entries(data.customFields ?? {}));
    map.enumOptions = new Map(Object.entries(data.enumOptions ?? {}));
    map.statuses = new Map(Object.entries(data.statuses ?? {}));
    return map;
  }
}
