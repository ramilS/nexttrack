/**
 * Client-side tokenizer for query language syntax highlighting.
 * Full parsing happens on the backend — this is only for visual highlighting.
 */

export type TokenType =
  | 'field'
  | 'operator'
  | 'value'
  | 'quoted'
  | 'hashtag'
  | 'keyword'
  | 'date'
  | 'text'
  | 'negation'
  | 'whitespace';

export interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
}

const KNOWN_FIELDS = new Set([
  'assignee', 'reporter', 'priority', 'status', 'type', 'tag',
  'project', 'created', 'updated', 'resolved', 'due date', 'estimate',
  'spent', 'sort',
]);

const KEYWORDS = new Set(['me', 'unassigned', 'none', 'empty']);

const DATE_PATTERN = /^(?:today|yesterday|tomorrow|(?:[+-]?\d+[dwmy](?:\.\.[+-]?\d+[dwmy])?)|(?:\d{4}-\d{2}-\d{2}(?:\.\.\d{4}-\d{2}-\d{2})?))$/i;

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < input.length) {
    // Whitespace
    if (/\s/.test(input[pos]!)) {
      const start = pos;
      while (pos < input.length && /\s/.test(input[pos]!)) pos++;
      tokens.push({ type: 'whitespace', value: input.slice(start, pos), start, end: pos });
      continue;
    }

    // Hashtag: #Word
    if (input[pos] === '#') {
      const start = pos;
      pos++; // skip #
      while (pos < input.length && /\w/.test(input[pos]!)) pos++;
      tokens.push({ type: 'hashtag', value: input.slice(start, pos), start, end: pos });
      continue;
    }

    // Quoted string
    if (input[pos] === '"') {
      const start = pos;
      pos++; // skip opening "
      while (pos < input.length && input[pos] !== '"') pos++;
      if (pos < input.length) pos++; // skip closing "
      tokens.push({ type: 'quoted', value: input.slice(start, pos), start, end: pos });
      continue;
    }

    // Negation prefix
    if (input[pos] === '-' && pos + 1 < input.length && /\w/.test(input[pos + 1]!)) {
      tokens.push({ type: 'negation', value: '-', start: pos, end: pos + 1 });
      pos++;
      continue;
    }

    // Fuzzy prefix
    if (input[pos] === '~') {
      tokens.push({ type: 'operator', value: '~', start: pos, end: pos + 1 });
      pos++;
      continue;
    }

    // Curly-brace wrapped: {Field Name} or {value}
    if (input[pos] === '{') {
      const start = pos;
      pos++; // skip {
      while (pos < input.length && input[pos] !== '}') pos++;
      if (pos < input.length) pos++; // skip }
      // Check if followed by colon => it's a field
      if (pos < input.length && input[pos] === ':') {
        tokens.push({ type: 'field', value: input.slice(start, pos), start, end: pos });
      } else {
        tokens.push({ type: 'keyword', value: input.slice(start, pos), start, end: pos });
      }
      continue;
    }

    // Word or field:value sequence
    const start = pos;
    let word = '';

    // Handle "due date" as a two-word field
    if (input.slice(pos, pos + 8).toLowerCase() === 'due date') {
      word = input.slice(pos, pos + 8);
      pos += 8;
    } else if (input.slice(pos, pos + 7).toLowerCase() === 'sort by') {
      word = input.slice(pos, pos + 7);
      pos += 7;
    } else {
      while (pos < input.length && !/[\s"#{}]/.test(input[pos]!) && input[pos] !== ':') {
        word += input[pos];
        pos++;
      }
    }

    // Check if it's a field (followed by colon)
    if (pos < input.length && input[pos] === ':') {
      const fieldName = word.toLowerCase();
      if (KNOWN_FIELDS.has(fieldName) || fieldName === 'sort by') {
        tokens.push({ type: 'field', value: word + ':', start, end: pos + 1 });
        pos++; // skip :

        // Now tokenize the value part
        const valueStart = pos;
        if (pos < input.length && input[pos] === '"') {
          // Quoted value
          pos++; // skip "
          while (pos < input.length && input[pos] !== '"') pos++;
          if (pos < input.length) pos++; // skip "
          tokens.push({ type: 'quoted', value: input.slice(valueStart, pos), start: valueStart, end: pos });
        } else if (pos < input.length && input[pos] === '{') {
          // Keyword value
          const kwStart = pos;
          pos++; // skip {
          while (pos < input.length && input[pos] !== '}') pos++;
          if (pos < input.length) pos++; // skip }
          tokens.push({ type: 'keyword', value: input.slice(kwStart, pos), start: kwStart, end: pos });
        } else {
          // Unquoted value (may contain commas for multi-value)
          while (pos < input.length && !/\s/.test(input[pos]!)) pos++;
          const rawValue = input.slice(valueStart, pos);
          if (rawValue) {
            const tokenType = classifyValue(rawValue, fieldName);
            tokens.push({ type: tokenType, value: rawValue, start: valueStart, end: pos });
          }
        }
        continue;
      }
    }

    // Operators: .., >=, <=, !=
    if (word === '..' || word === '>=' || word === '<=' || word === '!=') {
      tokens.push({ type: 'operator', value: word, start, end: pos });
      continue;
    }

    // Check if the word is a keyword
    if (KEYWORDS.has(word.toLowerCase())) {
      tokens.push({ type: 'keyword', value: word, start, end: pos });
      continue;
    }

    // Plain text
    if (word) {
      tokens.push({ type: 'text', value: word, start, end: pos });
      continue;
    }

    // Unconsumed delimiter (e.g. ':' after a non-field word like `foo:bar`).
    // Emit it as text and advance, or the loop never progresses past the colon.
    tokens.push({ type: 'text', value: input[pos]!, start: pos, end: pos + 1 });
    pos++;
  }

  return tokens;
}

function classifyValue(value: string, fieldName: string): TokenType {
  // Date fields
  if (['created', 'updated', 'resolved', 'due date'].includes(fieldName)) {
    if (DATE_PATTERN.test(value)) return 'date';
    // Range with ..
    if (value.includes('..')) return 'date';
  }

  // Sort direction
  if (fieldName === 'sort' || fieldName === 'sort by') {
    return 'keyword';
  }

  return 'value';
}

// CSS class mapping for tokens
export const TOKEN_CLASSES: Record<TokenType, string> = {
  field: 'text-blue-600 dark:text-blue-400 font-medium',
  operator: 'text-red-500 dark:text-red-400',
  value: 'text-green-600 dark:text-green-400',
  quoted: 'text-green-600 dark:text-green-400',
  hashtag: 'text-orange-500 dark:text-orange-400',
  keyword: 'text-gray-500 dark:text-gray-400 font-semibold',
  date: 'text-teal-600 dark:text-teal-400',
  text: '',
  negation: 'text-red-500 dark:text-red-400 font-bold',
  whitespace: '',
};
