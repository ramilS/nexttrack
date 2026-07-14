# User Project Role Selector Design

## Problem

The admin user detail page shows a role selector for every project membership. The selector changes the user's project-specific role, not the account's global `ADMIN`/`USER` role. This distinction is not explicit in the UI.

The API also prevents demoting the last Project Admin. Seed data makes the global admin the sole Project Admin in every project, so changing that user's role fails. The page converts every failure into the generic `Failed to update role` toast, making the selector appear broken.

## Intended behavior

- The Project Memberships card continues to show the user's role in every project.
- A membership whose role can be changed displays a select labeled `Project role`.
- A membership for the last Project Admin displays a non-interactive `Project Admin` badge instead of a select.
- The protected badge has accessible explanatory text: `Assign another Project Admin before changing this role.`
- The global account role remains read-only and separate from project membership roles.

## Data contract

`GET /users/:id/memberships` will add `canChangeRole: boolean` to each membership.

The backend computes the value from the same invariant enforced by `ProjectsMembersService`: a membership cannot change role when it is the only Project Admin in its project. The computation must be batched rather than issuing one count query per membership.

The existing PATCH endpoint remains authoritative. It will continue rejecting a last-admin demotion to protect against stale UI data and concurrent changes.

## Frontend behavior

The user detail page uses `canChangeRole` to choose between the editable select and the protected badge. The selector is disabled while its request is pending, preventing duplicate updates. A successful update refreshes the membership data.

If the PATCH endpoint rejects a change with `CANNOT_REMOVE_LAST_OWNER` despite an earlier `canChangeRole: true`, the page shows the same specific explanation used by the protected badge. Other failures retain a generic error message.

## Testing

- Shared schema test/type validation covers the new boolean field.
- API tests cover editable non-admin membership, editable Project Admin when another admin exists, and protected sole Project Admin.
- Frontend tests cover rendering a select for editable membership, rendering the explanatory badge for protected membership, and the specific stale-data error path.
- Relevant API and web type checks and tests must pass.

## Out of scope

- Changing a user's global `ADMIN`/`USER` role.
- Removing project memberships from this page.
- Changing the last-admin invariant.
