'use client';

import DOMPurify from 'dompurify';

interface HighlightedTextProps {
  html: string;
  className?: string;
}

/**
 * Renders highlighted HTML from Elasticsearch safely.
 * Only allows <mark> tags for highlighting, strips everything else.
 */
export function HighlightedText({ html, className }: HighlightedTextProps) {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['mark'],
    ALLOWED_ATTR: [],
  });

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
