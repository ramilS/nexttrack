import { Token } from './ast.types';

const KEYWORDS = new Set(['me', 'today']);
const SORT_DIRS = new Set(['asc', 'desc']);

export class Lexer {
  private pos = 0;
  private input: string;

  constructor(input: string) {
    this.input = input;
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];

    while (this.pos < this.input.length) {
      this.skipWhitespace();
      if (this.pos >= this.input.length) break;

      const ch = this.char();

      if (ch === '{') {
        tokens.push(this.readBracketedField());
        continue;
      }

      if (ch === '#') {
        tokens.push(this.readHashtag());
        continue;
      }

      if (ch === '"') {
        tokens.push(this.readQuotedValue());
        continue;
      }

      if (this.startsWith('..')) {
        tokens.push({ type: 'RANGE_OP', value: '..', pos: this.pos });
        this.pos += 2;
        continue;
      }

      if (ch === ':') {
        tokens.push({ type: 'COLON', value: ':', pos: this.pos });
        this.pos++;
        continue;
      }

      if (ch === ',') {
        tokens.push({ type: 'COMMA', value: ',', pos: this.pos });
        this.pos++;
        continue;
      }

      if (ch === '-' && this.isWordCharAt(this.pos + 1)) {
        tokens.push({ type: 'NEGATE', value: '-', pos: this.pos });
        this.pos++;
        continue;
      }

      if (this.isWordChar()) {
        tokens.push(this.readWord(tokens));
        continue;
      }

      this.pos++;
    }

    tokens.push({ type: 'EOF', value: '', pos: this.pos });
    return tokens;
  }

  private readBracketedField(): Token {
    const start = this.pos;
    this.pos++; // skip {
    let value = '';
    while (this.pos < this.input.length && this.char() !== '}') {
      value += this.char();
      this.pos++;
    }
    if (this.pos < this.input.length) this.pos++; // skip }
    return { type: 'FIELD', value: value.trim(), pos: start };
  }

  private readHashtag(): Token {
    const start = this.pos;
    this.pos++; // skip #
    let value = '';
    while (this.pos < this.input.length && this.isWordChar()) {
      value += this.char();
      this.pos++;
    }
    return { type: 'HASHTAG', value, pos: start };
  }

  private readQuotedValue(): Token {
    const start = this.pos;
    this.pos++; // skip opening "
    let value = '';
    while (this.pos < this.input.length && this.char() !== '"') {
      value += this.char();
      this.pos++;
    }
    if (this.pos < this.input.length) this.pos++; // skip closing "
    return { type: 'QUOTED_VALUE', value, pos: start };
  }

  private readWord(precedingTokens: Token[]): Token {
    const start = this.pos;
    let word = '';
    while (this.pos < this.input.length && this.isWordChar()) {
      word += this.char();
      this.pos++;
    }

    // fuzzy: "login~"
    if (this.pos < this.input.length && this.char() === '~') {
      this.pos++;
      return { type: 'FUZZY', value: word, pos: start };
    }

    // "sort by" — two-word keyword
    if (word.toLowerCase() === 'sort') {
      const savedPos = this.pos;
      this.skipWhitespace();
      if (this.peekWord() === 'by') {
        this.skipWord();
        return { type: 'SORT_BY', value: 'sort by', pos: start };
      }
      this.pos = savedPos;
    }

    // Sort direction keywords
    if (SORT_DIRS.has(word.toLowerCase())) {
      const lastToken = precedingTokens[precedingTokens.length - 1];
      if (
        lastToken &&
        (lastToken.type === 'VALUE' || lastToken.type === 'SORT_BY')
      ) {
        return { type: 'KEYWORD', value: word.toLowerCase(), pos: start };
      }
    }

    // Known keywords
    if (KEYWORDS.has(word.toLowerCase())) {
      return { type: 'KEYWORD', value: word.toLowerCase(), pos: start };
    }

    // Check if this is a multi-word field name like "due date"
    // by lookahead: if after optional whitespace + maybe another word there's a ":"
    const savedPos = this.pos;
    this.skipWhitespace();
    const nextWord = this.peekWord();
    if (nextWord) {
      const savedPos2 = this.pos;
      // Check if "word nextWord:" pattern
      this.skipWordChars();
      this.skipWhitespace();
      if (this.pos < this.input.length && this.char() === ':') {
        this.pos = savedPos; // restore
        this.skipWhitespace();
        this.skipWordChars(); // consume nextWord
        return { type: 'FIELD', value: `${word} ${nextWord}`, pos: start };
      }
      this.pos = savedPos2;
    }
    this.pos = savedPos;

    // Single word followed by ":" → it's a FIELD
    const savedPos3 = this.pos;
    this.skipWhitespace();
    if (this.pos < this.input.length && this.char() === ':') {
      this.pos = savedPos3;
      return { type: 'FIELD', value: word, pos: start };
    }
    this.pos = savedPos3;

    return { type: 'VALUE', value: word, pos: start };
  }

  private char(): string {
    return this.input[this.pos];
  }

  private startsWith(str: string): boolean {
    return this.input.startsWith(str, this.pos);
  }

  private isWordChar(): boolean {
    return this.isWordCharAt(this.pos);
  }

  private isWordCharAt(pos: number): boolean {
    if (pos >= this.input.length) return false;
    const ch = this.input[pos];
    return (
      ch !== ' ' &&
      ch !== '\t' &&
      ch !== '\n' &&
      ch !== ':' &&
      ch !== ',' &&
      ch !== '"' &&
      ch !== '#' &&
      ch !== '{' &&
      ch !== '}'
    );
  }

  private skipWhitespace(): void {
    while (
      this.pos < this.input.length &&
      (this.char() === ' ' || this.char() === '\t' || this.char() === '\n')
    ) {
      this.pos++;
    }
  }

  private peekWord(): string | null {
    const saved = this.pos;
    this.skipWhitespace();
    if (this.pos >= this.input.length || !this.isWordChar()) {
      this.pos = saved;
      return null;
    }
    let word = '';
    const start = this.pos;
    while (this.pos < this.input.length && this.isWordChar()) {
      word += this.char();
      this.pos++;
    }
    this.pos = start;
    return word;
  }

  private skipWord(): void {
    this.skipWhitespace();
    while (this.pos < this.input.length && this.isWordChar()) {
      this.pos++;
    }
  }

  private skipWordChars(): void {
    while (this.pos < this.input.length && this.isWordChar()) {
      this.pos++;
    }
  }
}
