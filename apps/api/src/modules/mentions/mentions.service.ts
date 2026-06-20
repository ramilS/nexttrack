import { Injectable } from '@nestjs/common';
import type { TiptapDoc } from '@repo/shared/schemas';

@Injectable()
export class MentionsService {
  extractMentionedUserIds(tiptapJson: TiptapDoc | null | undefined): string[] {
    if (!tiptapJson) return [];
    const ids: string[] = [];

    const traverse = (node: TiptapDoc) => {
      if (node.type === 'mention' && node.attrs?.id) {
        ids.push(node.attrs.id as string);
      }
      node.content?.forEach(traverse);
    };

    traverse(tiptapJson);
    return [...new Set(ids)];
  }

  extractPlainText(tiptapJson: TiptapDoc | null | undefined, maxLength = 100): string {
    if (!tiptapJson) return '';
    let text = '';

    const traverse = (node: TiptapDoc) => {
      if (node.type === 'text') text += node.text ?? '';
      if (node.type === 'mention') text += `@${(node.attrs?.label as string) ?? ''}`;
      if (node.type === 'hardBreak') text += ' ';
      node.content?.forEach(traverse);
    };

    traverse(tiptapJson);
    return text.slice(0, maxLength).trim();
  }

  findNewMentions(oldBody: TiptapDoc | null | undefined, newBody: TiptapDoc | null | undefined): string[] {
    const oldIds = new Set(this.extractMentionedUserIds(oldBody));
    const newIds = this.extractMentionedUserIds(newBody);
    return newIds.filter((id) => !oldIds.has(id));
  }
}
