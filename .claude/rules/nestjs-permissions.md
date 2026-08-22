# Permissions & Authorization System

## Architecture

The project uses **atomic permissions** (not role-based access). Permissions are defined in `packages/shared/src/permissions.ts`.

### Two Layers

1. **Global roles** (`GlobalRole.ADMIN`, `GlobalRole.USER`) — system-level, checked by `RolesGuard`
2. **Project permissions** (`Permission.ISSUE_CREATE`, etc.) — per-project, checked by `PermissionGuard`

Admins bypass all project-level permission checks.

### System Roles (seeded)

| Role | Permissions |
|------|------------|
| Project Admin | All permissions |
| Developer | `AGENT_RUN`, issues, comments, articles, tags, boards, sprints, time |
| QA | Same as Developer minus `TAG_MANAGE`, `BOARD_MANAGE` |
| Reporter | `ISSUE_READ`, `ISSUE_CREATE`, comments, articles, time |
| Observer | `ISSUE_READ`, `ARTICLE_READ` |

Custom roles can be created with any combination of permissions.

## Decorators

### `@ProjectAuth()` — composite decorator for project-scoped routes

```typescript
@Controller('projects/:key/tags')
@ProjectAuth()
export class TagsController {
  @Get()
  @RequirePermission(Permission.ISSUE_READ)
  findAll(@ReqProject() project: Project) { ... }
}
```

Combines: `JwtAuthGuard` → `RolesGuard` → `PermissionGuard` + `ProjectContextInterceptor`

### `@IssueAuth()` — for routes that resolve project from issue ID

```typescript
@Controller('issues')
@IssueAuth()
export class IssueCommentsController { ... }
```

Uses `IssueContextGuard` to load project from `:issueId` param before permission check.

### `@BoardAuth()` — same pattern for board-scoped routes

### `@Roles(GlobalRole.ADMIN)` — global role check (admin-only routes)

```typescript
// ALWAYS use enum constant, never string literal
@Roles(GlobalRole.ADMIN)  // Correct
@Roles('ADMIN')           // Wrong — bypasses type safety
```

### `@RequirePermission(Permission.X)` — project permission check

Multiple permissions = ALL must be present (AND logic, not OR).

## Guard Execution Order Matters

Context guards MUST run before `PermissionGuard` so `req.project` is populated:

```typescript
// Correct order
@UseGuards(JwtAuthGuard, RolesGuard, IssueContextGuard, PermissionGuard)

// Wrong — PermissionGuard has no project context
@UseGuards(JwtAuthGuard, PermissionGuard, IssueContextGuard)
```

## Rules

- EVERY controller that accesses project data MUST use `@ProjectAuth()`, `@IssueAuth()`, or `@BoardAuth()`
- EVERY mutating endpoint MUST have `@RequirePermission()` with the appropriate permission
- Read endpoints MUST require at minimum `Permission.ISSUE_READ` or `Permission.ARTICLE_READ`
- Use `@Roles(GlobalRole.ADMIN)` for admin-only routes (role management, system settings)
- NEVER use string literals in `@Roles()` — always `GlobalRole.ADMIN`, never `'ADMIN'`
- When adding a new permission: add to `packages/shared/src/permissions.ts`, update system roles in seed, update relevant controllers
