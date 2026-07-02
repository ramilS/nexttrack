import MarkdownIt from 'markdown-it';

// Default preset (not 'commonmark') so `linkify` actually runs — the commonmark
// preset disables the linkify rule regardless of the option, leaving bare URLs
// as plain text.
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
});

// Derived from markdown-it itself so we don't depend on its internal type path.
type Token = ReturnType<typeof md.parse>[number];

// Structural mirror of the target editor's Tiptap JSON node (the migrator is a
// standalone CLI and does not depend on @repo/shared).
export interface TiptapDoc {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: TiptapDoc[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

type Mark = { type: string; attrs?: Record<string, unknown> };

// Inline tokens → Tiptap inline nodes (text with marks, images, hard breaks).
function inlineToNodes(tokens: Token[]): TiptapDoc[] {
  const out: TiptapDoc[] = [];
  const marks: Mark[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case 'text':
        if (t.content) {
          out.push({
            type: 'text',
            text: t.content,
            ...(marks.length ? { marks: [...marks] } : {}),
          });
        }
        break;
      case 'softbreak':
        out.push({
          type: 'text',
          text: ' ',
          ...(marks.length ? { marks: [...marks] } : {}),
        });
        break;
      case 'hardbreak':
        out.push({ type: 'hardBreak' });
        break;
      case 'code_inline':
        out.push({
          type: 'text',
          text: t.content,
          marks: [...marks, { type: 'code' }],
        });
        break;
      case 'strong_open':
        marks.push({ type: 'bold' });
        break;
      case 'em_open':
        marks.push({ type: 'italic' });
        break;
      case 's_open':
        marks.push({ type: 'strike' });
        break;
      case 'strong_close':
      case 'em_close':
      case 's_close':
        marks.pop();
        break;
      case 'link_open':
        marks.push({ type: 'link', attrs: { href: t.attrGet('href') ?? '' } });
        break;
      case 'link_close':
        marks.pop();
        break;
      case 'image':
        out.push({
          type: 'image',
          attrs: { src: t.attrGet('src') ?? '', alt: t.content || null },
        });
        break;
      default:
        break;
    }
  }
  return out;
}

function blocksToNodes(tokens: Token[], start: number, end: number): TiptapDoc[] {
  const out: TiptapDoc[] = [];
  let i = start;
  while (i < end) {
    const t = tokens[i]!;
    switch (t.type) {
      case 'paragraph_open': {
        const inline = tokens[i + 1];
        out.push({
          type: 'paragraph',
          content: inline?.children ? inlineToNodes(inline.children) : [],
        });
        i += 3; // open, inline, close
        break;
      }
      case 'heading_open': {
        const level = Number(t.tag.slice(1));
        const inline = tokens[i + 1];
        out.push({
          type: 'heading',
          attrs: { level },
          content: inline?.children ? inlineToNodes(inline.children) : [],
        });
        i += 3;
        break;
      }
      case 'fence':
      case 'code_block':
        out.push({
          type: 'codeBlock',
          attrs: { language: t.info?.trim() || null },
          content: t.content ? [{ type: 'text', text: t.content }] : [],
        });
        i += 1;
        break;
      case 'bullet_list_open':
      case 'ordered_list_open': {
        const closeType =
          t.type === 'bullet_list_open'
            ? 'bullet_list_close'
            : 'ordered_list_close';
        const listEnd = findClose(tokens, i, t.type, closeType);
        out.push({
          type: t.type === 'bullet_list_open' ? 'bulletList' : 'orderedList',
          content: listItems(tokens, i + 1, listEnd),
        });
        i = listEnd + 1;
        break;
      }
      case 'blockquote_open': {
        const qEnd = findClose(tokens, i, 'blockquote_open', 'blockquote_close');
        out.push({
          type: 'blockquote',
          content: blocksToNodes(tokens, i + 1, qEnd),
        });
        i = qEnd + 1;
        break;
      }
      case 'hr':
        out.push({ type: 'horizontalRule' });
        i += 1;
        break;
      default:
        i += 1;
        break;
    }
  }
  return out;
}

function listItems(tokens: Token[], start: number, end: number): TiptapDoc[] {
  const items: TiptapDoc[] = [];
  let i = start;
  while (i < end) {
    if (tokens[i]!.type === 'list_item_open') {
      const itemEnd = findClose(tokens, i, 'list_item_open', 'list_item_close');
      items.push({
        type: 'listItem',
        content: blocksToNodes(tokens, i + 1, itemEnd),
      });
      i = itemEnd + 1;
    } else {
      i += 1;
    }
  }
  return items;
}

// Matching close index, respecting nesting of the same open/close pair.
function findClose(
  tokens: Token[],
  openIdx: number,
  openType: string,
  closeType: string,
): number {
  let depth = 0;
  for (let i = openIdx; i < tokens.length; i++) {
    if (tokens[i]!.type === openType) depth++;
    else if (tokens[i]!.type === closeType) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return tokens.length - 1;
}

/**
 * Converts a Markdown string (YouTrack descriptions/comments are Markdown) into
 * a Tiptap document matching the node/mark names of the target editor
 * (starter-kit + link/image). Empty input yields an empty paragraph.
 */
export function markdownToTiptap(markdown: string): TiptapDoc {
  const src = (markdown ?? '').trim();
  if (!src) return { type: 'doc', content: [{ type: 'paragraph' }] };
  const tokens = md.parse(src, {});
  const content = blocksToNodes(tokens, 0, tokens.length);
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}
