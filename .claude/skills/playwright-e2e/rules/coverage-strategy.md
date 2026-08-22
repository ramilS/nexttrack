# Coverage Strategy

## E2E Tests = Top of the Pyramid

E2E tests are expensive, slow, and brittle. They verify **critical user journeys**, not every feature detail.

### Rule: 20/80

~20% of functionality generates ~80% of user value. Cover that 20% with E2E.

## What to Test with E2E

| Category | Examples | Why E2E |
|----------|---------|---------|
| **Happy path of key features** | Login → create project → create issue → change status | Verifies the full chain works together |
| **Critical business flows** | Registration, issue lifecycle (backlog → done), sprint management | Breakage = lost users |
| **Frontend-backend integration** | Created issue appears in list, WebSocket updates board | Unit tests can't catch desync |
| **Authorization & navigation** | User without permissions can't see "Delete" button, can't access `/admin` | Security |
| **Smoke tests** | Every main page loads without errors | Quick sanity check after deploy |

## What NOT to Test with E2E

| Don't test | Why | Cover with |
|------------|-----|------------|
| Every form field validation combo | Too many combinations, too slow | Unit tests (Zod schemas) |
| Business logic edge cases | Slow, brittle | Unit tests (services) |
| Pixel-perfect styling | Breaks on every refactor | Visual regression (Chromatic, Percy) |
| API contracts in detail | E2E is too coarse | Integration tests (API) |
| Performance metrics | Unstable in E2E env | Lighthouse, k6, Web Vitals |

## Target Coverage for NextTrack

### Quantitative Targets

| Metric | Target | Notes |
|--------|--------|-------|
| **Total E2E tests** | 55-75 | 5-8 per core module |
| **CI run time** | < 5 minutes | Longer = people skip them |
| **Flaky rate** | < 2% | Higher = lost trust |
| **Feature coverage** | 100% critical paths, ~60% secondary | Not every button — every flow |

### Per-Module Plan

| Group | Modules | Tests | Priority |
|-------|---------|-------|----------|
| **Core** | auth, projects, issues, workflows | 15-20 | P0 |
| **Collaboration** | comments, activities, notifications, realtime | 8-12 | P1 |
| **Planning** | boards, sprints, backlog, gantt | 8-10 | P1 |
| **Management** | roles, permissions, members, teams | 6-8 | P1 |
| **Support** | search, attachments, time-tracking, tags | 6-8 | P2 |
| **API boundary** | validation, authorization bypass | 10-15 | P1 |
| **Smoke** | all routes load | 1 parameterized | P0 |

### Test Pyramid Ratios

```
         /  E2E  \          55-75 tests    (~5%)
        / Integr. \         150-200 tests  (~15%)
       / Unit tests \       1000+ tests    (~80%)
```

## How to Decide: "Should This Be an E2E Test?"

Ask these questions in order:

1. **If this breaks, does the user get stuck?** → Yes → E2E
2. **Does it involve frontend + backend working together?** → Yes → E2E
3. **Is it a security boundary (auth, permissions)?** → Yes → E2E (+ API boundary test)
4. **Can I verify this with a unit/integration test?** → Yes → Do that instead
5. **Is it a visual/styling concern?** → Yes → Visual regression, not E2E
