# AI-Assisted Documentation Updates (`ai-docs` module)

When an issue is resolved, the AI evaluates whether project documentation (the
Knowledge Base) needs updating and, if so, **creates a "doc-update" issue**
carrying a proposed draft. The draft is applied to the article only when a human
moves that doc-update issue to **Done**; cancelling it discards the draft. The
issue tracker itself is the human-in-the-loop review surface — there is no
separate approval inbox.

Module: `apps/api/src/modules/ai-docs/`. Disabled by default (`AI_DOCS_ENABLED`).

## Flow & the recursion guard

`AiDocsListener` (`@OnEvent('issue.updated')`) fires on resolution:

- The `DocUpdateProposal` row **is** the recursion guard. A doc-update issue
  *has* a proposal (`docIssueId`), so resolving it routes to apply/reject
  instead of re-triggering AI. A normal resolved issue (no proposal) that passes
  the candidate gate is queued for an AI suggestion.
- **Candidate gate** (`candidate-gate.ts`): trigger tag (`AI_DOCS_TRIGGER_TAG`,
  default `docs`) OR heuristic (type `FEATURE`/`BUG`/`STORY` with a description).
- Suggestion runs in a BullMQ processor (`doc-generation.processor.ts`); on
  `shouldUpdate` it creates the doc-update issue (`IssuesService`) + a PENDING
  `DocUpdateProposal` capturing the OCC base hash.

## Done vs Cancelled (no schema support — name convention)

`StatusCategory` has no `CANCELLED`. Reject vs apply is decided by status name
against `AI_DOCS_REJECTION_STATUS_NAMES` (default `Cancelled, Won't Do,
Rejected`, case-insensitive). Any other resolved status applies the draft.

## Staleness / OCC (never overwrite a human edit)

`Article` has no version column, so the OCC base is `canonicalTiptapHash` (stable
key order) of the target's content at draft time. On Done (`doc-update-apply.service.ts`):

- new article, or target unchanged (hash matches) → apply directly;
- target changed → **AI three-way merge** (`doc-merge.service.ts`): disjoint
  edits → auto-apply the merge; overlapping/ambiguous → do NOT overwrite, persist
  the reconciled draft, re-baseline the hash, and reopen the doc-issue for review.

## Pluggable LLM provider

The domain depends on the `StructuredLlm` port (`llm/structured-llm.ts`), never a
vendor SDK. Adapters: `AnthropicStructuredLlm` (native structured outputs +
adaptive thinking) and `OpenAiStructuredLlm` (OpenAI/Azure **and** local
Ollama/LM Studio/vLLM/OpenRouter via `AI_DOCS_BASE_URL`; JSON mode + client-side
zod validation). Selected by `AI_DOCS_PROVIDER` (`anthropic` | `openai`).

```
AI_DOCS_ENABLED=true
AI_DOCS_PROVIDER=anthropic            # or openai
ANTHROPIC_API_KEY=...                 # (or AI_DOCS_API_KEY)
AI_DOCS_BASE_URL=http://localhost:11434/v1   # openai provider only; local server
AI_DOCS_MODEL=...                     # required for openai; defaults to claude-opus-4-8 for anthropic
```

Adapters return null on unusable output; services degrade (skip) gracefully.
Small local models are flakier at producing valid Tiptap JSON — drafts may be
skipped more often. When adding a provider, implement the port; do not couple
services to an SDK.

## Custom prompts (per-project, UI-editable)

Two prompts — *suggestion* and *merge* — are overridable per project
(`ProjectAiDocsSettings`), edited at **Settings → AI Docs** (frontend) via
`GET`/`PUT /projects/:key/ai-docs/settings` (gated by `PROJECT_SETTINGS_UPDATE`).
`PromptResolver` resolves per-project override → built-in default
(`DEFAULT_SUGGESTION_PROMPT` / `DEFAULT_MERGE_PROMPT`). Blank = use default.

## Idempotency

No `EventIdempotencyService` here (AI calls must not run inside a DB tx). Instead:
enqueue dedup via BullMQ `jobId` + `hasPendingForSource`; apply dedup via the
proposal-status gate (act only while PENDING).

## Frontend

- `ProposedDocUpdate` panel (`components/ai-docs/`) on the issue detail page —
  renders only when the issue has a proposal (read-only Tiptap preview + status +
  conflict warning).
- `AiDocsSettingsForm` + `settings/ai-docs/page.tsx` — the two prompt editors.
