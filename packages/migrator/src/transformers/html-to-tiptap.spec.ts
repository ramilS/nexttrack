import { describe, it, expect } from 'vitest';
import { htmlToTiptap } from './html-to-tiptap';
import { richTextToTiptap } from './rich-text';

describe('htmlToTiptap', () => {
  it('unwraps a YouTrack wiki div into a paragraph of text (not literal tags)', () => {
    const doc = htmlToTiptap(
      '<div class="wiki text prewrapped">проблемы при выгрузке компаний больше 100</div>',
    );
    expect(doc).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'проблемы при выгрузке компаний больше 100' }],
        },
      ],
    });
  });

  it('converts <a> into a text node with a link mark', () => {
    const doc = htmlToTiptap('<p>see <a href="http://x.com/a">docs</a></p>');
    const para = doc.content![0];
    expect(para.content).toEqual([
      { type: 'text', text: 'see ' },
      { type: 'text', text: 'docs', marks: [{ type: 'link', attrs: { href: 'http://x.com/a' } }] },
    ]);
  });

  it('turns a YouTrack user-mention link into a mention node (mapped id)', () => {
    const doc = htmlToTiptap(
      '<p>hi <a href="https://yt/youtrack/users/ramil_s" data-user-id="25-338">Ramil Sayetov</a></p>',
      { resolveUserMention: (ytId) => (ytId === '25-338' ? 'our-user-1' : null) },
    );
    expect(doc.content![0].content).toEqual([
      { type: 'text', text: 'hi ' },
      { type: 'mention', attrs: { id: 'our-user-1', label: 'Ramil Sayetov' } },
    ]);
  });

  it('falls back to plain text (no YouTrack link) for an unmigrated user mention', () => {
    const doc = htmlToTiptap(
      '<p><a href="https://yt/youtrack/users/gone" data-user-id="9-9">Gone User</a></p>',
      { resolveUserMention: () => null },
    );
    expect(doc.content![0].content).toEqual([{ type: 'text', text: 'Gone User' }]);
  });

  it('autolinks a bare URL in text', () => {
    const doc = htmlToTiptap('<div>screenshot http://prntscr.com/mtitrc here</div>');
    expect(doc.content![0].content).toEqual([
      { type: 'text', text: 'screenshot ' },
      {
        type: 'text',
        text: 'http://prntscr.com/mtitrc',
        marks: [{ type: 'link', attrs: { href: 'http://prntscr.com/mtitrc' } }],
      },
      { type: 'text', text: ' here' },
    ]);
  });

  it('maps <br> to a hard break and b/i to marks', () => {
    const doc = htmlToTiptap('<div>a<br><b>bold</b> <i>it</i></div>');
    expect(doc.content![0].content).toEqual([
      { type: 'text', text: 'a' },
      { type: 'hardBreak' },
      { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'it', marks: [{ type: 'italic' }] },
    ]);
  });

  it('converts an unordered list', () => {
    const doc = htmlToTiptap('<ul><li>one</li><li>two</li></ul>');
    expect(doc.content![0]).toEqual({
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }] },
      ],
    });
  });

  it('never yields an empty doc', () => {
    expect(htmlToTiptap('')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });

  it('maps a wiki collapsible (<details>) to a details node with summary + body', () => {
    const doc = htmlToTiptap(
      '<div class="wiki text prewrapped"><details><summary>done</summary><p>line one</p><p>line two</p></details></div>',
    );
    const details = doc.content![0];
    expect(details.type).toBe('details');
    expect(details.attrs).toEqual({ summary: 'done' });
    // Body keeps its own block breaks (no run-together text).
    expect(details.content!.map((p) => p.content?.[0]?.text)).toEqual([
      'line one',
      'line two',
    ]);
  });

  it('defaults the details summary label when <summary> is absent', () => {
    const doc = htmlToTiptap('<details><p>body</p></details>');
    expect(doc.content![0]).toMatchObject({ type: 'details', attrs: { summary: 'Details' } });
  });

  it('coalesces per-line <code>…</code><br/> into a single codeBlock', () => {
    const doc = htmlToTiptap(
      'intro <code>x</code><br/>' +
        '<code>{</code><br/>' +
        '<code>  "a": 1,</code><br/>' +
        '<code>}</code>',
    );
    // "intro …<code>x</code>" is prose (not code-only) → paragraph;
    // the three pure-code lines coalesce into one codeBlock.
    const codeBlocks = doc.content!.filter((n) => n.type === 'codeBlock');
    expect(codeBlocks).toHaveLength(1);
    expect(codeBlocks[0].content![0].text).toBe('{\n  "a": 1,\n}');
    expect(doc.content!.some((n) => n.type === 'paragraph')).toBe(true);
  });

  it('keeps a lone inline code line inline (no spurious codeBlock)', () => {
    const doc = htmlToTiptap('the value is <code>null</code> here');
    expect(doc.content!.every((n) => n.type !== 'codeBlock')).toBe(true);
  });
});

describe('richTextToTiptap', () => {
  it('routes HTML through the HTML converter', () => {
    const doc = richTextToTiptap('<div class="wiki">hi</div>');
    expect(doc.content![0]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] });
  });

  it('routes plain markdown through the markdown converter (heading survives)', () => {
    const doc = richTextToTiptap('# Title\n\nbody');
    expect(doc.content![0]).toMatchObject({ type: 'heading', attrs: { level: 1 } });
  });

  it('linkifies a bare URL in markdown text too', () => {
    const doc = richTextToTiptap('visit http://prntscr.com/mtitrc now');
    const marks = JSON.stringify(doc);
    expect(marks).toContain('"link"');
    expect(marks).toContain('http://prntscr.com/mtitrc');
  });
});
