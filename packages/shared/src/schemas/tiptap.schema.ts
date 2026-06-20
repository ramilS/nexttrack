import { z } from 'zod';

/**
 * Tiptap JSON document node. Structurally identical to `JSONContent` from
 * `@tiptap/react`, so values typed as `TiptapDoc` can be passed directly to
 * Tiptap APIs without a cast. We can't depend on @tiptap/react from a shared
 * package, so we mirror its shape here.
 */
export interface TiptapDoc {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: TiptapDoc[];
  marks?: { type: string; attrs?: Record<string, unknown>; [key: string]: unknown }[];
  text?: string;
  [key: string]: unknown;
}

/**
 * Tiptap JSON document validator. Loose validation: accepts any object whose
 * top-level `type` is "doc". The deep shape varies by enabled extensions, so
 * we don't validate further here; Tiptap itself rejects malformed nodes at
 * render time.
 *
 * NOTE: keep as `z.any()` until the description contract is reconciled. The web
 * client handles `description` as a `string` (issue-detail.tsx JSON.stringify /
 * JSON.parse); typing this as `TiptapDoc` breaks those call sites and changes
 * the payload shape, so it needs a coordinated full-stack change, not a schema
 * edit.
 */
export const tiptapContentSchema = z.any().refine(
  (val) =>
    val != null &&
    typeof val === 'object' &&
    !Array.isArray(val) &&
    val.type === 'doc',
  { message: 'Content must be a Tiptap document with type "doc"' },
);
