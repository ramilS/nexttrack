/**
 * Sprint lifecycle events. Sprint start/close changes what every board and
 * backlog in the project shows, so the change has to reach open clients — a
 * notification alone only refreshes the notification list.
 */
export class SprintStartedEvent {
  constructor(
    public readonly sprintId: string,
    public readonly boardId: string,
    public readonly projectId: string,
    public readonly name: string,
    public readonly userId: string,
  ) {}
}

export class SprintClosedEvent {
  constructor(
    public readonly sprintId: string,
    public readonly boardId: string,
    public readonly projectId: string,
    public readonly name: string,
    // Nullable: `SprintsService.close` accepts an optional actor, so an
    // empty string here would be a lie rather than an absence.
    public readonly userId: string | null,
  ) {}
}
