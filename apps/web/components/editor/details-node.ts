import { Node, mergeAttributes } from '@tiptap/react';

/**
 * Collapsible section rendered as a native <details>/<summary> — it toggles
 * with zero JS and works in the read-only editor. Used for YouTrack wiki "cut"
 * blocks imported by the migrator (`{ type: 'details', attrs: { summary } }`).
 * There is intentionally no toolbar button; the node exists so migrated content
 * renders (and round-trips) as a real collapsible, collapsed by default.
 */
export const Details = Node.create({
  name: 'details',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      summary: {
        default: 'Details',
        parseHTML: (element) =>
          element.querySelector(':scope > summary')?.textContent?.trim() || 'Details',
        // Rendered as the <summary> text in renderHTML, not as an attribute.
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'details',
        // Content is everything except the <summary> (which becomes the attr).
        contentElement: (element) => {
          const clone = element.cloneNode(true) as HTMLElement;
          clone.querySelector(':scope > summary')?.remove();
          return clone;
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'details',
      mergeAttributes(HTMLAttributes, { class: 'wiki-details' }),
      ['summary', {}, (node.attrs.summary as string) || 'Details'],
      ['div', { class: 'details-body' }, 0],
    ];
  },
});
