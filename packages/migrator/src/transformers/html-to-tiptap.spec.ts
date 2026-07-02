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

  it('keeps block breaks inside a wiki wrapper / collapsible (no run-together text)', () => {
    const doc = htmlToTiptap(
      '<div class="wiki text prewrapped"><details><summary>Details</summary><p>line one</p><p>line two</p></details></div>',
    );
    expect(doc.content!.map((p) => p.content?.[0]?.text)).toEqual([
      'Details',
      'line one',
      'line two',
    ]);
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
