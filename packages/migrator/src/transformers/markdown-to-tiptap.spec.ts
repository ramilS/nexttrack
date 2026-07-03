import { describe, it, expect } from 'vitest';
import { markdownToTiptap } from './markdown-to-tiptap';

describe('markdownToTiptap', () => {
  it('converts a heading', () => {
    expect(markdownToTiptap('# Title')).toEqual({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
      ],
    });
  });

  it('converts bold and italic marks', () => {
    const doc = markdownToTiptap('a **b** and *c*');
    const nodes = doc.content![0]!.content!;
    expect(nodes).toContainEqual({ type: 'text', text: 'b', marks: [{ type: 'bold' }] });
    expect(nodes).toContainEqual({ type: 'text', text: 'c', marks: [{ type: 'italic' }] });
  });

  it('converts inline code', () => {
    const doc = markdownToTiptap('run `npm test` now');
    expect(doc.content![0]!.content!).toContainEqual({
      type: 'text',
      text: 'npm test',
      marks: [{ type: 'code' }],
    });
  });

  it('converts a fenced code block with language', () => {
    const doc = markdownToTiptap('```ts\nconst x = 1;\n```');
    expect(doc.content![0]).toEqual({
      type: 'codeBlock',
      attrs: { language: 'ts' },
      content: [{ type: 'text', text: 'const x = 1;\n' }],
    });
  });

  it('converts a bullet list', () => {
    const doc = markdownToTiptap('- one\n- two');
    expect(doc.content![0]!.type).toBe('bulletList');
    expect(doc.content![0]!.content).toHaveLength(2);
    expect(doc.content![0]!.content![0]!.type).toBe('listItem');
  });

  it('converts an ordered list', () => {
    const doc = markdownToTiptap('1. first\n2. second');
    expect(doc.content![0]!.type).toBe('orderedList');
    expect(doc.content![0]!.content).toHaveLength(2);
  });

  it('converts a link', () => {
    const doc = markdownToTiptap('[x](https://e.com)');
    expect(doc.content![0]!.content![0]).toEqual({
      type: 'text',
      text: 'x',
      marks: [{ type: 'link', attrs: { href: 'https://e.com' } }],
    });
  });

  it('converts a blockquote', () => {
    const doc = markdownToTiptap('> quoted');
    expect(doc.content![0]!.type).toBe('blockquote');
  });

  it('falls back to a single paragraph for empty or plain input', () => {
    expect(markdownToTiptap('')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
    expect(markdownToTiptap('plain line')).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'plain line' }] }],
    });
  });
});
