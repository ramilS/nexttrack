export class IssueTagAddedEvent {
  constructor(
    public readonly issueId: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly tagId: string,
    public readonly tagName: string,
  ) {}
}

export class IssueTagRemovedEvent {
  constructor(
    public readonly issueId: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly tagId: string,
    public readonly tagName: string,
  ) {}
}
