import { parse, HTMLElement, Node, NodeType, TextNode } from 'node-html-parser';
import { TiptapDoc } from './markdown-to-tiptap';

type Mark = { type: string; attrs?: Record<string, unknown> };

const MARK_TAGS: Record<string, Mark> = {
  B: { type: 'bold' },
  STRONG: { type: 'bold' },
  I: { type: 'italic' },
  EM: { type: 'italic' },
  CODE: { type: 'code' },
  S: { type: 'strike' },
  DEL: { type: 'strike' },
  STRIKE: { type: 'strike' },
};

const HEADING_LEVELS: Record<string, number> = {
  H1: 1, H2: 2, H3: 3, H4: 4, H5: 5, H6: 6,
};

// Bare URL matcher for autolinking plain-text runs (YouTrack wiki HTML carries
// raw links like http://prntscr.com/… as text, not <a> tags).
const URL_RE = /https?:\/\/[^\s<>()]+[^\s<>().,;:!?]/g;

/**
 * Convert YouTrack wiki-era HTML (comment/description bodies rendered as HTML,
 * e.g. `<div class="wiki text prewrapped">…</div>`) into the target editor's
 * Tiptap JSON. Uses a real HTML parser (not regex) so nested markup, links and
 * lists survive; unknown tags degrade to their text content.
 */
export function htmlToTiptap(html: string): TiptapDoc {
  const root = parse(html);
  const content = blocksFrom(root.childNodes);
  return {
    type: 'doc',
    content: content.length ? content : [{ type: 'paragraph' }],
  };
}

function isText(node: Node): node is TextNode {
  return node.nodeType === NodeType.TEXT_NODE;
}

function tagOf(node: Node): string {
  return node.nodeType === NodeType.ELEMENT_NODE
    ? (node as HTMLElement).tagName?.toUpperCase() ?? ''
    : '';
}

// Block-level walk: element children become their own block nodes; loose text
// and inline elements are buffered into paragraphs, flushed at each block.
function blocksFrom(nodes: Node[]): TiptapDoc[] {
  const blocks: TiptapDoc[] = [];
  let inline: TiptapDoc[] = [];
  const flush = () => {
    blocks.push(...segmentInlineToBlocks(inline));
    inline = [];
  };

  for (const node of nodes) {
    const tag = tagOf(node);
    switch (tag) {
      case 'P':
      case 'DIV': {
        flush();
        const el = node as HTMLElement;
        // A div/p wrapping block content (wiki wrappers nest paragraphs, lists,
        // collapsibles) is a transparent container — recurse so inner blocks
        // keep their breaks; otherwise it's a single paragraph.
        if (hasBlockChild(el)) {
          blocks.push(...blocksFrom(el.childNodes));
        } else {
          blocks.push(...segmentInlineToBlocks(inlineFrom(el.childNodes, [])));
        }
        break;
      }
      case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6': {
        flush();
        blocks.push({
          type: 'heading',
          attrs: { level: HEADING_LEVELS[tag] },
          content: inlineFrom((node as HTMLElement).childNodes, []),
        });
        break;
      }
      case 'UL': case 'OL': {
        flush();
        blocks.push(listFrom(node as HTMLElement, tag === 'OL' ? 'orderedList' : 'bulletList'));
        break;
      }
      case 'BLOCKQUOTE': {
        flush();
        blocks.push({
          type: 'blockquote',
          content: blocksFrom((node as HTMLElement).childNodes),
        });
        break;
      }
      case 'PRE': {
        flush();
        blocks.push({
          type: 'codeBlock',
          content: [{ type: 'text', text: (node as HTMLElement).text }],
        });
        break;
      }
      case 'BR':
        inline.push({ type: 'hardBreak' });
        break;
      default:
        // An unknown element wrapping block content (e.g. a wiki <details>
        // collapsible, <section>) — treat as a transparent container so nested
        // paragraphs keep their breaks instead of running together. Otherwise
        // it's inline (a, b, span, code, summary label, …) — accumulate.
        if (
          node.nodeType === NodeType.ELEMENT_NODE &&
          hasBlockChild(node as HTMLElement)
        ) {
          flush();
          blocks.push(...blocksFrom((node as HTMLElement).childNodes));
        } else {
          inline.push(...inlineFrom([node], []));
        }
    }
  }
  flush();
  return blocks;
}

const BLOCK_TAGS = new Set([
  'DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'DETAILS', 'SECTION', 'ARTICLE', 'TABLE',
]);

function hasBlockChild(el: HTMLElement): boolean {
  return el.childNodes.some((n) => BLOCK_TAGS.has(tagOf(n)));
}

// Turn an inline run into block nodes. YouTrack wiki HTML renders a multi-line
// code block as consecutive per-line `<code>…</code><br/>` (not a <pre>), which
// naively becomes fragmented inline code + hardBreaks. Split the run on
// hardBreaks into lines and coalesce a run of 2+ "code-only" lines into one
// codeBlock; everything else stays a paragraph.
function segmentInlineToBlocks(inline: TiptapDoc[]): TiptapDoc[] {
  if (!inline.some((n) => n.type !== 'hardBreak')) return [];

  const lines = splitOnHardBreaks(inline);
  const blocks: TiptapDoc[] = [];
  let paraLines: TiptapDoc[][] = [];
  const flushPara = () => {
    if (paraLines.length === 0) return;
    const content = joinWithHardBreaks(paraLines);
    if (content.some((n) => n.type !== 'hardBreak')) {
      blocks.push({ type: 'paragraph', content });
    }
    paraLines = [];
  };

  for (let i = 0; i < lines.length; ) {
    let j = i;
    while (j < lines.length && isCodeOnlyLine(lines[j]!)) j++;
    if (j - i >= 2) {
      flushPara();
      const text = lines.slice(i, j).map(lineText).join('\n');
      blocks.push({ type: 'codeBlock', content: [{ type: 'text', text }] });
      i = j;
    } else {
      paraLines.push(lines[i]!);
      i++;
    }
  }
  flushPara();
  return blocks;
}

function splitOnHardBreaks(inline: TiptapDoc[]): TiptapDoc[][] {
  const lines: TiptapDoc[][] = [[]];
  for (const node of inline) {
    if (node.type === 'hardBreak') lines.push([]);
    else lines[lines.length - 1]!.push(node);
  }
  return lines;
}

function joinWithHardBreaks(lines: TiptapDoc[][]): TiptapDoc[] {
  const out: TiptapDoc[] = [];
  lines.forEach((line, idx) => {
    if (idx > 0) out.push({ type: 'hardBreak' });
    out.push(...line);
  });
  return out;
}

// A line is "code-only" when it has text and every text node carries the `code`
// mark (a standalone wiki code line). Prose lines that merely end in inline code
// are not code-only, so they stay paragraphs.
function isCodeOnlyLine(line: TiptapDoc[]): boolean {
  const texts = line.filter((n) => n.type === 'text' && (n.text ?? '').length > 0);
  return (
    texts.length > 0 &&
    texts.every((n) => (n.marks ?? []).some((m) => m.type === 'code'))
  );
}

function lineText(line: TiptapDoc[]): string {
  return line
    .filter((n) => n.type === 'text')
    .map((n) => n.text ?? '')
    .join('');
}

function listFrom(el: HTMLElement, type: 'bulletList' | 'orderedList'): TiptapDoc {
  const items = el.childNodes
    .filter((n) => tagOf(n) === 'LI')
    .map((li) => {
      const inner = blocksFrom((li as HTMLElement).childNodes);
      return {
        type: 'listItem',
        content: inner.length ? inner : [{ type: 'paragraph' }],
      };
    });
  return { type, content: items.length ? items : [{ type: 'listItem', content: [{ type: 'paragraph' }] }] };
}

// Inline walk: text nodes → text (with autolinked URLs), <a> → link mark,
// b/i/code/… → the corresponding mark, <br> → hardBreak, other → recurse.
function inlineFrom(nodes: Node[], marks: Mark[]): TiptapDoc[] {
  const out: TiptapDoc[] = [];
  for (const node of nodes) {
    if (isText(node)) {
      out.push(...linkifyText(node.text, marks));
      continue;
    }
    const el = node as HTMLElement;
    const tag = tagOf(node);
    if (tag === 'BR') {
      out.push({ type: 'hardBreak' });
      continue;
    }
    if (tag === 'A') {
      const href = el.getAttribute('href');
      const linkMarks = href
        ? [...marks, { type: 'link', attrs: { href } }]
        : marks;
      out.push(...inlineFrom(el.childNodes, linkMarks));
      continue;
    }
    const mark = MARK_TAGS[tag];
    out.push(...inlineFrom(el.childNodes, mark ? [...marks, mark] : marks));
  }
  return out;
}

// Split a plain-text run on bare URLs, emitting link marks for the URLs so they
// render clickable (matches markdown-it's linkify behaviour for the md path).
function linkifyText(text: string, marks: Mark[]): TiptapDoc[] {
  if (!text) return [];
  const out: TiptapDoc[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0];
    const start = m.index ?? 0;
    if (start > last) {
      out.push(textNode(text.slice(last, start), marks));
    }
    out.push(textNode(url, [...marks, { type: 'link', attrs: { href: url } }]));
    last = start + url.length;
  }
  if (last < text.length) out.push(textNode(text.slice(last), marks));
  return out;
}

function textNode(text: string, marks: Mark[]): TiptapDoc {
  return {
    type: 'text',
    text,
    ...(marks.length ? { marks: marks.map((m) => ({ ...m })) } : {}),
  };
}
