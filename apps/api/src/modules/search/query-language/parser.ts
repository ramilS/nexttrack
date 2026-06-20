import {
  Token,
  TokenType,
  ParsedQuery,
  FieldFilterNode,
  TextSearchNode,
  HashtagNode,
  SortNode,
  FilterValue,
  FilterOperator,
  ParseError,
} from './ast.types';

export class Parser {
  private tokens: Token[];
  private pos = 0;
  private errors: ParseError[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): ParsedQuery {
    const filters: (FieldFilterNode | TextSearchNode | HashtagNode)[] = [];
    let sort: SortNode | null = null;

    while (!this.isEOF()) {
      if (this.check('SORT_BY')) {
        sort = this.parseSort();
        continue;
      }

      if (this.check('HASHTAG')) {
        filters.push(this.parseHashtag());
        continue;
      }

      if (this.check('FIELD') && this.peekType(1) === 'COLON') {
        filters.push(this.parseFieldFilter());
        continue;
      }

      if (
        this.check('VALUE') ||
        this.check('QUOTED_VALUE') ||
        this.check('FUZZY') ||
        this.check('KEYWORD') ||
        this.check('TEXT')
      ) {
        filters.push(this.parseTextSearch());
        continue;
      }

      this.errors.push({
        message: `Unexpected token: ${this.current().value}`,
        pos: this.current().pos,
        length: this.current().value.length || 1,
      });
      this.advance();
    }

    return { filters, sort, errors: this.errors };
  }

  private parseFieldFilter(): FieldFilterNode {
    const fieldToken = this.advance(); // FIELD
    const field = fieldToken.value;
    this.expect('COLON');

    let negated = false;
    if (this.check('NEGATE')) {
      this.advance();
      negated = true;
    }

    const values: FilterValue[] = [];
    values.push(this.parseValue());

    while (this.check('COMMA')) {
      this.advance();
      if (this.check('NEGATE')) this.advance();
      values.push(this.parseValue());
    }

    const operator = this.inferOperator(values);

    return { kind: 'FIELD_FILTER', field, operator, values, negated };
  }

  private parseValue(): FilterValue {
    const raw = this.readRawValue();
    if (raw === null) {
      this.errors.push({
        message: 'Expected a value',
        pos: this.current().pos,
        length: 1,
      });
      return { raw: '', isKeyword: false, isRange: false, isFuzzy: false };
    }

    if (this.check('RANGE_OP')) {
      this.advance();
      const to = this.readRawValue();
      return {
        raw: `${raw}..${to ?? ''}`,
        isKeyword: false,
        isRange: true,
        rangeFrom: raw,
        rangeTo: to ?? undefined,
        isFuzzy: false,
      };
    }

    const isKeyword = ['me', 'today', '{no value}', '{unassigned}'].includes(
      raw.toLowerCase(),
    );

    return { raw, isKeyword, isRange: false, isFuzzy: false };
  }

  private readRawValue(): string | null {
    if (this.isEOF()) return null;

    const token = this.current();
    if (
      token.type === 'VALUE' ||
      token.type === 'KEYWORD' ||
      token.type === 'QUOTED_VALUE' ||
      token.type === 'FUZZY'
    ) {
      this.advance();
      return token.value;
    }

    return null;
  }

  private parseHashtag(): HashtagNode {
    const token = this.advance();
    return { kind: 'HASHTAG', name: token.value };
  }

  private parseTextSearch(): TextSearchNode {
    const token = this.advance();

    if (token.type === 'QUOTED_VALUE') {
      return { kind: 'TEXT_SEARCH', text: token.value, isExact: true, isFuzzy: false };
    }

    if (token.type === 'FUZZY') {
      return { kind: 'TEXT_SEARCH', text: token.value, isExact: false, isFuzzy: true };
    }

    // Collect consecutive text/value tokens into one text search
    let text = token.value;
    while (
      !this.isEOF() &&
      (this.check('VALUE') || this.check('TEXT')) &&
      !this.isFieldStart()
    ) {
      text += ' ' + this.advance().value;
    }

    return { kind: 'TEXT_SEARCH', text, isExact: false, isFuzzy: false };
  }

  private parseSort(): SortNode {
    this.advance(); // SORT_BY
    if (this.check('COLON')) this.advance();

    const fields: { field: string; direction: 'asc' | 'desc' }[] = [];

    while (!this.isEOF()) {
      const fieldToken = this.current();
      if (
        fieldToken.type !== 'VALUE' &&
        fieldToken.type !== 'FIELD' &&
        fieldToken.type !== 'KEYWORD'
      ) {
        break;
      }
      this.advance();
      const fieldName = fieldToken.value;

      let direction: 'asc' | 'desc' = 'asc';
      if (
        this.check('KEYWORD') &&
        (this.current().value === 'asc' || this.current().value === 'desc')
      ) {
        direction = this.advance().value as 'asc' | 'desc';
      }

      fields.push({ field: fieldName, direction });

      if (this.check('COMMA')) {
        this.advance();
      } else {
        break;
      }
    }

    return { kind: 'SORT', fields };
  }

  private inferOperator(values: FilterValue[]): FilterOperator {
    if (values.length === 1) {
      const v = values[0];
      if (v.isRange) return 'RANGE';
      if (
        v.raw.toLowerCase() === '{no value}' ||
        v.raw.toLowerCase() === '{unassigned}'
      ) {
        return 'IS_EMPTY';
      }
      return 'EQ';
    }
    return 'IN';
  }

  private isFieldStart(): boolean {
    return (
      this.check('FIELD') ||
      (this.check('VALUE') && this.peekType(1) === 'COLON')
    );
  }

  private current(): Token {
    return this.tokens[this.pos] ?? { type: 'EOF', value: '', pos: 0 };
  }

  private check(type: TokenType): boolean {
    return this.current().type === type;
  }

  private peekType(offset: number): TokenType | null {
    const idx = this.pos + offset;
    return idx < this.tokens.length ? this.tokens[idx].type : null;
  }

  private advance(): Token {
    const token = this.current();
    this.pos++;
    return token;
  }

  private expect(type: TokenType): Token | null {
    if (this.check(type)) {
      return this.advance();
    }
    this.errors.push({
      message: `Expected ${type}, got ${this.current().type}`,
      pos: this.current().pos,
      length: this.current().value.length || 1,
    });
    return null;
  }

  private isEOF(): boolean {
    return this.pos >= this.tokens.length || this.current().type === 'EOF';
  }
}
