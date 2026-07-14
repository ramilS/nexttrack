# YouTrack Cloud Full-Fidelity Migration Design

**Date:** 2026-07-14

**Status:** Approved in conversation; pending review of this written specification

## Goal

Build a resumable, verifiable migration from the current YouTrack Cloud public
REST API into native NextTrack entities. Daily working features must remain
fully usable after migration. Rare historical categories may be omitted only
when they appear in the explicitly approved exclusion list in this document.

The migration targets tens of thousands of issues across a relatively small
number of projects.

## Scope Boundary

The migration includes project data and user-facing project functionality. It
does not attempt to clone the YouTrack Cloud service itself.

Included:

- Projects, project metadata, access, teams, groups, and role assignments.
- Users referenced by migrated project data.
- Complete project custom-field definitions and values.
- Issues, hierarchy, links, content, access lists, and current social state.
- Complete issue change history.
- Agile boards, sprints, and their operational configuration.
- Active workflow behavior that affects migrated projects.
- Project knowledge-base content.
- Saved searches used by migrated users or project features.
- Original source identifiers and timestamps for migrated entities.

Excluded from the product migration boundary:

- YouTrack Cloud server settings, license, backup, locale, appearance, and
  telemetry configuration.
- Authentication secrets, permanent tokens, OAuth secrets, webhook secrets,
  SMTP credentials, and other external-integration credentials.
- Configuration and historical delivery logs of external integrations.

## Approved Historical Exclusions

The following data may be omitted. Adding another exclusion requires explicit
user approval and a specification update.

- Historical revisions of comment text; the current comment body is migrated.
- Deleted comments, attachments, work items, and drafts.
- Old VCS and pull-request events and their state-change history.
- Attachment OCR/recognized-text history.
- Workflow execution logs.
- Notification history.
- Personal UI state such as the last opened screen, collapsed sections,
  transient sorting, and the last selected board.
- Deprecated YouTrack attributes when their effective current state is
  represented by the supported replacement attribute.

Issue change history is explicitly **not excluded**. It must be migrated in
full for the retained issues.

## Success Criteria

A migration run is successful only when:

1. Every discovered in-scope source entity is `VERIFIED` or is covered by an
   approved exclusion above.
2. No entity or relationship has an unresolved load or verification error.
3. Current project behavior is preserved for issues, permissions, boards,
   sprints, workflows, time tracking, articles, and saved searches.
4. Original timestamps and authorship match the source data exposed by the
   YouTrack Cloud API.
5. Running the same migration again without source changes produces no new
   target records and no semantic changes.
6. Resuming after interruption produces the same result as an uninterrupted
   run.
7. The verification report contains no unexplained missing IDs, extra IDs,
   checksum differences, broken references, or graph differences.

## Architectural Approach

Use a phased native migration. Extend NextTrack where a daily YouTrack feature
has no native representation, rather than retaining a permanent YouTrack JSON
mirror in the product model.

The design has four layers.

### 1. Source Adapters

Each YouTrack domain has a focused extractor with a typed output contract:

- users, groups, roles, project teams, and access;
- projects and project settings;
- custom fields and bundles;
- issues and issue relationships;
- comments, attachments, watchers, and voters;
- activities and history;
- time tracking and work-item settings;
- agile boards and sprints;
- workflows;
- articles and saved searches.

Extractors own YouTrack REST fields, pagination, rate limiting, and compatibility
with the current YouTrack Cloud API. They do not call NextTrack.

### 2. Canonical Migration Model

Extracted data is transformed into typed canonical entities independent of
YouTrack response shapes and NextTrack request DTOs. Canonical entities retain:

- source system, entity type, and source ID;
- source version/checksum inputs;
- semantic fields required by NextTrack;
- original timestamps and actor references;
- relationship references expressed by source ID;
- an optional approved-exclusion reason.

This layer exists in TypeScript and test fixtures. It is not a second permanent
product database model.

### 3. Native Loaders

Migration-only API endpoints accept canonical DTOs and perform atomic,
idempotent upserts into native NextTrack models. Each supported entity has a
stable source mapping:

```text
(sourceSystem, sourceEntityType, sourceId) -> targetEntityId
```

The target stores source IDs for entities whose lifecycle must be independently
resumable: users, projects, field definitions, field options, issues, links,
comments, attachments, activities, watchers, votes, work items, boards,
sprints, articles, article content entities, workflows, and saved searches.

### 4. Manifest and Verification

A persistent migration manifest tracks every discovered entity. The manifest
contains run ID, source identity, target identity, source checksum, state,
attempt count, timestamps, and structured error details.

It is operational migration state, not a source-data mirror.

## Entity-State Model

Each entity progresses through:

```text
DISCOVERED -> TRANSFORMED -> LOADED -> VERIFIED
                         \-> FAILED
                         \-> EXCLUDED_APPROVED
```

Rules:

- Only `VERIFIED` and `EXCLUDED_APPROVED` are terminal success states.
- A phase cannot be marked complete while it has failed or unverified entities.
- Resume uses source IDs and manifest state, not numeric counters.
- A changed source checksum reopens the entity for transformation and upsert.
- Resume validates source URL/tenant, target URL, project set, feature flags,
  schema version, and approved-exclusion version against the original run.
- Errors remain queryable and are never hidden by later phase completion.

## Dependency Order

The migration runs in dependency order:

1. Run registration and compatibility preflight.
2. Users, groups, and role definitions.
3. Projects, teams, memberships, and project access.
4. Custom-field definitions, bundles, options, and versions.
5. Workflow definitions required to validate issue state.
6. Issues and current field values.
7. Hierarchy, links, watchers, voters, tags, and other relationships.
8. Comments, attachments, time logs, and issue history.
9. Boards, sprints, and sprint membership.
10. Articles and saved searches.
11. Timestamp reconciliation.
12. Referential, semantic, and checksum verification.
13. Search reindex after successful project verification.

## Projects and Access

Preserve project key, name, description, archived state, lead, icon when
available, and the access configuration that affects daily work.

Project membership is derived from the source project team and assigned roles,
not from the global YouTrack user list. Groups and group-derived membership are
preserved as effective access. Where NextTrack lacks a matching group or
permission concept, the target access model must be extended before that
project can verify.

The migration must not grant broader project access than the source.

## Custom Fields and Bundles

Definitions come from project custom-field and bundle APIs, never from only the
values observed on issues.

Preserve:

- field name, type, cardinality, description, aliases where useful, and order;
- required/can-be-empty state and empty-value presentation;
- public/private state and conditional visibility;
- default values;
- all options, including unused values;
- option order, color, owner, archived state, released state, and dates when
  supported by the source type;
- user and group bundle membership;
- version entities as native NextTrack versions, not generic enum values;
- issue values including empty and multi-value semantics.

Unsupported source field types block verification until a native mapping or an
approved exclusion is added.

## Issues, Hierarchy, and Links

Preserve current issue number, summary, description, reporter, assignee, type,
priority, state, due date, estimate, project, custom values, tags, visibility,
watchers, voters, resolved state, and original timestamps.

Hierarchy uses explicit YouTrack `parent` and `subtasks` data. Link-name
heuristics may be used only as validation fallback.

YouTrack link-type definitions are migrated before link instances. NextTrack
must support the source type name, source-to-target presentation,
target-to-source presentation, symmetry/direction, and relationship instances.
The fixed built-in link enum is insufficient for this requirement and must be
replaced or extended with native dynamic link types.

Cross-project relationships are loaded only after all selected projects have
completed issue creation. A relationship to an out-of-scope project is reported
as a blocking scope dependency rather than silently dropped.

## Comments, Attachments, Watchers, and Votes

Comments preserve source ID, current body, author, parent comment, pinned state,
visibility, reactions, and original timestamps. Deleted comments and historical
body revisions follow the approved exclusions.

Attachments preserve source ID, bytes, filename, MIME type, author, visibility,
and original timestamps. Upload remains streaming/bounded so large files do not
accumulate in migrator memory. Target object creation and metadata registration
must be recoverable without duplicate files or orphaned manifest state.

Watchers and voters are native relationships with source-aware idempotency.
Votes and watcher state must remain usable after migration, not only visible as
archived metadata.

## Issue History

The complete retained-issue activity history is required.

- Extract all relevant activity categories exposed by the current YouTrack
  Cloud API.
- Preserve source activity ID, type/category, actor, source timestamp, and the
  semantic before/after payload.
- Map activities to native NextTrack activity types where the semantics match.
- Extend the target activity model for source categories that are part of the
  retained history but have no faithful target representation.
- Migration loaders must suppress ordinary live activities and notifications.
- Idempotency is per source activity ID. The presence of unrelated target
  activity must never suppress history import.

## Time Tracking

Preserve work items, author, duration, date, description, work-item type, custom
work-item attributes, and original timestamps. Preserve project time-tracking
settings and work-item type definitions required for daily use.

Imported work items use native NextTrack time-log records with stable source
IDs. Recalculation of aggregate spent time happens once per affected issue or
batch, without creating user-action history at migration time.

## Agile Boards and Sprints

A YouTrack multi-project board remains one board associated with multiple
projects. Preserve:

- board name, source ID, template/type, owner, and effective sharing;
- project associations;
- columns and mapped field values;
- swimlane configuration and orphan behavior;
- WIP limits;
- board filter/query;
- color coding and estimation fields;
- sprint settings;
- current/default sprint behavior;
- sprint name, goal, order, schedule, archived/active/closed state;
- issue membership.

NextTrack's current one-project board model must be extended for shared boards.
Board switching remains native NextTrack behavior over the migrated set of
boards. Personal last-selected-board state is excluded.

## Workflows

Do not replace source workflow behavior with permissive all-to-all transitions.

Preserve status definitions and properties exactly. Declarative source behavior
that has an equivalent maps to native `WorkflowTransition` or `WorkflowRule`
records. Arbitrary YouTrack JavaScript workflows require inventory and explicit
translation into reviewed NextTrack rules or code.

An active source workflow that affects a migrated project cannot be silently
omitted. If it cannot be translated automatically, the migration preflight
emits a blocking manual-mapping item. Completion requires an implemented mapping
or a newly approved exclusion.

Workflow execution logs are excluded; active behavior is not.

## Knowledge Base and Saved Searches

Preserve project articles, parent/child structure, current content, authors,
visibility, tags, attachments, comments, and original timestamps. Historical
content revisions are not required unless exposed as current issue history.

Preserve saved searches used by migrated users, board configuration, or project
workflows. Query translation must be semantic: unsupported YouTrack query
constructs block verification instead of producing a silently broader or
narrower NextTrack query.

## Timestamp Contract

Every migrated entity preserves every original timestamp made available by the
source and represented by the target, including created, updated, resolved,
edited, deleted-for-retained-tombstones, sprint, release, and activity dates.

Backdating is part of the atomic migration operation. Subsequent relationship,
aggregation, and indexing operations must not change imported business
timestamps. A final reconciliation phase repairs only explicitly identified
target fields and is idempotent.

Verification compares timestamps at the precision exposed by the YouTrack API.

## Error Handling and Atomicity

- API retries must be safe after a timeout at any point in a request.
- A native entity and its required dependent values are created or reconciled
  atomically where possible.
- Where external storage prevents a single database transaction, use a staged
  state machine with deterministic object keys and cleanup/reconciliation.
- Expected per-entity failures are recorded in the manifest with stable error
  codes and do not disappear when processing continues.
- Authentication expiry stops the run instead of recording thousands of entity
  failures.
- Rate limiting and transient upstream failures use bounded retry with jitter
  and server-provided retry hints.
- Permanent validation or mapping failures are not retried indefinitely.

## Throughput and Resource Use

The design targets 50,000-100,000 issues without changing architecture.

- Use bounded pages and bounded worker pools.
- Apply separate concurrency limits for YouTrack reads, NextTrack writes, and
  attachment transfers.
- Do not hold a project-sized issue list or file corpus in memory.
- Persist manifest progress continuously in batches.
- Make batch size and concurrency observable and configurable within validated
  limits.
- Reindex only verified project data and expose background reindex completion
  to the final report.

## Verification Report

Verification is source-aware and reports, by entity type and project:

- discovered, transformed, loaded, verified, failed, and approved-excluded
  counts;
- missing and unexpected source IDs;
- checksum and timestamp mismatches;
- broken references;
- hierarchy and link graph differences;
- membership and permission differences;
- board, sprint, workflow, and query configuration differences;
- attachment byte size/checksum mismatches;
- every approved exclusion used by the run.

Target aggregate counts alone are never treated as proof of correctness.

## Testing Strategy

### Unit Tests

- YouTrack response to canonical entity conversion for every supported type.
- Canonical entity to target DTO conversion.
- Stable checksums and source identity.
- Link direction, hierarchy, query, field, workflow, and board mappings.
- Approved-exclusion classification.

### API Integration Tests

- Atomic creation/upsert of every native migration entity.
- Idempotency after success, timeout, and partial internal failure.
- Source-ID uniqueness and checksum reconciliation.
- Backdated timestamp preservation.
- Migration-mode suppression of notifications and live activities.
- Access-control equivalence.

### Resume and Fault-Injection Tests

Interrupt after each durable step of each phase, resume, and compare the final
database with an uninterrupted migration. Repeat for comments, attachments,
activities, time logs, links, boards, sprints, articles, and workflows.

### Contract Fixture

Maintain a representative YouTrack Cloud fixture/export contract containing:

- cross-project hierarchy and every link direction;
- custom and renamed link types;
- complete custom-field type and bundle coverage;
- public/private issues and fields;
- threaded/pinned comments, reactions, attachments, watchers, and voters;
- work-item types;
- single-project and multi-project boards with configuration variants;
- sprint lifecycle states;
- declarative and script workflows;
- article hierarchy and saved searches;
- full issue activity history.

### End-to-End Acceptance

Run extract -> migrate -> verify -> unchanged migrate -> verify. The second
migration must create no entities and report no semantic updates. Run the same
fixture with injected interruptions and require an identical verified result.

### Performance Test

Exercise generated data in the 50,000-100,000 issue range with bounded
attachments. Assert bounded memory, stable pagination, no unbounded queries,
and acceptable configurable throughput rather than a fixed environment-specific
wall-clock threshold.

## Delivery Strategy

Implement vertical, independently reviewable phases:

1. Manifest, source identity, error model, idempotency, and resume.
2. Projects, users, groups, teams, and permissions.
3. Custom-field definitions, bundles, versions, and values.
4. Issues, hierarchy, dynamic links, watchers, voters, and visibility.
5. Comments, attachments, time tracking, and complete history.
6. Multi-project boards and sprint semantics.
7. Workflow inventory and translation.
8. Articles and saved searches.
9. Full verification, fault injection, and performance validation.

Each phase must leave the codebase testable and may be reviewed independently.
Later phases consume explicit interfaces produced by earlier phases.

## Non-Goals

- Supporting historical YouTrack Server API versions.
- Maintaining a permanent raw YouTrack JSON mirror in NextTrack.
- Migrating secrets or recreating external systems.
- Claiming workflow equivalence for untranslated JavaScript.
- Treating a count-only comparison as migration verification.

