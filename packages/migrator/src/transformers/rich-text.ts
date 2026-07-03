import { markdownToTiptap, TiptapDoc } from './markdown-to-tiptap';
import { htmlToTiptap, HtmlToTiptapOptions } from './html-to-tiptap';

// YouTrack bodies are usually markdown, but wiki-era comments/descriptions
// arrive as rendered HTML (<div class="wiki …">, <p>, <br>, <a>, lists). Route
// by a cheap structural sniff so markdown isn't mangled and HTML isn't shown as
// literal tags.
const HTML_TAG_RE =
  /<\/?(?:div|p|br|a|ul|ol|li|b|i|strong|em|span|pre|code|blockquote|h[1-6]|table|img)\b[^>]*>/i;

export function richTextToTiptap(text: string, opts?: HtmlToTiptapOptions): TiptapDoc {
  return HTML_TAG_RE.test(text) ? htmlToTiptap(text, opts) : markdownToTiptap(text);
}
