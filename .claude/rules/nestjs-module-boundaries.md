# Module Boundaries — Readers vs Repositories

## Rule

Cross-module data access is interface-segregated:

- **Read-only access** to another module's aggregate goes through its `<X>Reader` facade (`@/modules/<m>/<m>.reader.ts`), exposed globally via `SharedRepositoriesModule`.
- **Writes** to another module's aggregate are allowed ONLY for the enumerated writer modules below, via the owner's repository. Everything else must not inject a foreign repository.
- The owner module always uses its own repository directly.

### Wrong

```typescript
// Read-only consumer injecting the full (write-capable) foreign repository
constructor(private workflowsRepo: WorkflowsRepository) {}   // in boards/

// Adding speculative methods to a Reader "for later"
findAllWithEverything(...)  // YAGNI — readers expose exactly what consumers use
```

### Correct

```typescript
// Read-only consumer injects the reader facade
constructor(private workflowsRepo: WorkflowsReader) {}       // in boards/

// New cross-module read need → add the method to the owner's Reader,
// delegating to the repository
```

## Current readers (SharedRepositoriesModule exports)

`IssuesReader`, `UsersReader`, `WorkflowsReader`, `SprintsReader`, `BoardsReader`,
`TagsReader`, `KnowledgeBaseReader`.

`ApiKeysReader` is a third pattern: it exposes exactly one method,
`countActiveForUser(userId)`, and is exported directly by the owning
`ApiKeysModule` (which is itself `@Global()` — `ApiKeyAuthService` has to be
injectable by every module through `JwtAuthGuard`) rather than re-exported via
`SharedRepositoriesModule`. `ProjectsMembersService` (projects) injects it to
block removing a service principal's membership while it still backs an
active key (`removeMember` throws `SERVICE_MEMBER_HAS_ACTIVE_KEY` — revoke the
key first). The write-capable `ApiKeysRepository` stays
module-private — no cross-module writer needs it.

## Repositories still exported cross-module (writer allow-list)

| Repository | Cross-module writers (reason) |
|---|---|
| `IssuesRepository` | sprints (sprint membership), workflows (status migration), boards/move (board moves + cascade), workflow-automation (automation patch), comments+issues listeners (watchers), custom-fields (`touchUpdatedAt`), time-tracking (`updateSpent`), migration (`getNextNumber`) |
| `SprintsRepository` | boards/move (`updateCounters`) |
| `TagsRepository` | issues (bulk tag links), workflow-automation (link/unlink), migration (bulk issue-tag links) |
| `CommentsRepository` | workflow-automation (comment action) — writer-only export, no reader exists |
| `UsersRepository` | auth + sso (user creation/update; also credential reads — `findByEmailWithPasswordHash` is deliberately NOT on `UsersReader`); api-keys (`createServicePrincipal` — the `kind: SERVICE` user backing an issued key) |

`WorkflowsRepository` and `BoardsRepository` are NOT exported — no cross-module writers remain; all consumers use the readers.

## Feature-module repository tier (the second sharing path)

`SharedRepositoriesModule` is not the only place a repository crosses a module
boundary. A handful of repositories are exported by their **own feature module**
and injected by other modules — predominantly for membership/credential checks
and tightly-coupled reads that don't (yet) have a `<X>Reader`:

| Repository (owner) | Cross-module consumers |
|---|---|
| `ProjectMembersRepository` (projects) | attachments, custom-fields, issues, realtime, search, sprints, teams, time-tracking, migration (membership/`isMember` checks; migration bulk-adds members); api-keys (`create`/`remove` — adds/removes the service principal's membership on issue/revoke) |
| `ProjectsRepository` (projects) | ai-docs, search, migration (`findEntityByKey` for board create) |
| `ActivitiesRepository` (activities) | boards |
| `VersionsRepository` (versions) | custom-fields, search |
| `RefreshTokensRepository` (auth) | sso, users |
| `InvitesRepository` (users) | auth, sso |
| `CustomFieldsRepository` (custom-fields) | search, migration (target field/option map) |
| `CustomFieldValuesService` (custom-fields) | issues |

This tier predates the Reader model. When touching it, prefer migrating a
read-only consumer to a `<X>Reader`; don't add NEW direct-repository injections
without the justification in the next section.

## Adding a new cross-module dependency

1. Read-only? Add the method to the owner's `<X>Reader` (delegating to the repo) and inject the reader.
2. A write? Stop and justify: does the operation belong in the owner's service instead? If a foreign write is genuinely required, add the use-case-named method to the owner's repository and add the consumer to the allow-list table above.
3. Never inject `PrismaService` or touch another module's tables directly — see the repository-pattern rules.
