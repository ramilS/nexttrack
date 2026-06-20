import { Test } from '@nestjs/testing';
import { MentionsService } from './mentions.service';

describe('MentionsService', () => {
  let service: MentionsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [MentionsService],
    }).compile();

    service = module.get(MentionsService);
  });

  // ---------------------------------------------------------------------------
  // extractMentionedUserIds
  // ---------------------------------------------------------------------------
  describe('extractMentionedUserIds', () => {
    it('should return empty array for null input', () => {
      expect(service.extractMentionedUserIds(null)).toEqual([]);
    });

    it('should return empty array for undefined input', () => {
      expect(service.extractMentionedUserIds(undefined)).toEqual([]);
    });

    it('should return empty array when there are no mentions', () => {
      const doc = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
      };
      expect(service.extractMentionedUserIds(doc)).toEqual([]);
    });

    it('should extract a single mention id', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'mention', attrs: { id: 'user-1', label: 'Alice' } },
            ],
          },
        ],
      };
      expect(service.extractMentionedUserIds(doc)).toEqual(['user-1']);
    });

    it('should extract multiple mention ids', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'mention', attrs: { id: 'user-1', label: 'Alice' } },
              { type: 'text', text: ' and ' },
              { type: 'mention', attrs: { id: 'user-2', label: 'Bob' } },
            ],
          },
        ],
      };
      expect(service.extractMentionedUserIds(doc)).toEqual(['user-1', 'user-2']);
    });

    it('should deduplicate mention ids', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'mention', attrs: { id: 'user-1', label: 'Alice' } },
              { type: 'mention', attrs: { id: 'user-1', label: 'Alice' } },
            ],
          },
        ],
      };
      expect(service.extractMentionedUserIds(doc)).toEqual(['user-1']);
    });

    it('should extract mentions from deeply nested content', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      { type: 'mention', attrs: { id: 'user-deep', label: 'Deep' } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      expect(service.extractMentionedUserIds(doc)).toEqual(['user-deep']);
    });

    it('should skip mention nodes without attrs.id', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'mention', attrs: {} },
              { type: 'mention' },
            ],
          },
        ],
      };
      expect(service.extractMentionedUserIds(doc)).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // extractPlainText
  // ---------------------------------------------------------------------------
  describe('extractPlainText', () => {
    it('should return empty string for null input', () => {
      expect(service.extractPlainText(null)).toBe('');
    });

    it('should return empty string for undefined input', () => {
      expect(service.extractPlainText(undefined)).toBe('');
    });

    it('should extract plain text from text nodes', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Hello world' }],
          },
        ],
      };
      expect(service.extractPlainText(doc)).toBe('Hello world');
    });

    it('should render mention as @label', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Hi ' },
              { type: 'mention', attrs: { id: 'user-1', label: 'Alice' } },
            ],
          },
        ],
      };
      expect(service.extractPlainText(doc)).toBe('Hi @Alice');
    });

    it('should replace hardBreak with a space', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'line1' },
              { type: 'hardBreak' },
              { type: 'text', text: 'line2' },
            ],
          },
        ],
      };
      expect(service.extractPlainText(doc)).toBe('line1 line2');
    });

    it('should truncate text to default maxLength of 100', () => {
      const longText = 'a'.repeat(150);
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: longText }],
          },
        ],
      };
      expect(service.extractPlainText(doc)).toHaveLength(100);
    });

    it('should truncate text to custom maxLength', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Hello wonderful world' }],
          },
        ],
      };
      expect(service.extractPlainText(doc, 5)).toBe('Hello');
    });

    it('should trim trailing whitespace after truncation', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Hi ' },
              { type: 'hardBreak' },
              { type: 'text', text: 'there' },
            ],
          },
        ],
      };
      // "Hi  there" — truncate at 4 gives "Hi  " → trimmed to "Hi"
      expect(service.extractPlainText(doc, 4)).toBe('Hi');
    });

    it('should handle mention without label gracefully', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'mention', attrs: { id: 'user-1' } }],
          },
        ],
      };
      expect(service.extractPlainText(doc)).toBe('@');
    });
  });

  // ---------------------------------------------------------------------------
  // findNewMentions
  // ---------------------------------------------------------------------------
  describe('findNewMentions', () => {
    const makeMentionDoc = (...ids: string[]) => ({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: ids.map((id) => ({
            type: 'mention',
            attrs: { id, label: id },
          })),
        },
      ],
    });

    it('should return all ids when old body is null', () => {
      const result = service.findNewMentions(null, makeMentionDoc('user-1', 'user-2'));
      expect(result).toEqual(['user-1', 'user-2']);
    });

    it('should return empty array when new body is null', () => {
      expect(service.findNewMentions(makeMentionDoc('user-1'), null)).toEqual([]);
    });

    it('should return empty array when both bodies are null', () => {
      expect(service.findNewMentions(null, null)).toEqual([]);
    });

    it('should return only new mention ids not present in old body', () => {
      const oldBody = makeMentionDoc('user-1', 'user-2');
      const newBody = makeMentionDoc('user-2', 'user-3');
      expect(service.findNewMentions(oldBody, newBody)).toEqual(['user-3']);
    });

    it('should return empty array when mentions are the same', () => {
      const body = makeMentionDoc('user-1', 'user-2');
      expect(service.findNewMentions(body, body)).toEqual([]);
    });

    it('should return empty array when new body has fewer mentions', () => {
      const oldBody = makeMentionDoc('user-1', 'user-2');
      const newBody = makeMentionDoc('user-1');
      expect(service.findNewMentions(oldBody, newBody)).toEqual([]);
    });
  });
});
