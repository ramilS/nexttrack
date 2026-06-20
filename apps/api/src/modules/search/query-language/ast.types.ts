export type TokenType =
  | 'FIELD'
  | 'COLON'
  | 'VALUE'
  | 'QUOTED_VALUE'
  | 'HASHTAG'
  | 'RANGE_OP'
  | 'COMMA'
  | 'NEGATE'
  | 'SORT_BY'
  | 'KEYWORD'
  | 'FUZZY'
  | 'TEXT'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

export type FilterOperator = 'EQ' | 'IN' | 'RANGE' | 'IS_EMPTY' | 'IS_NOT_EMPTY';

export interface FilterValue {
  raw: string;
  isKeyword: boolean;
  isRange: boolean;
  rangeFrom?: string;
  rangeTo?: string;
  isFuzzy: boolean;
}

export interface FieldFilterNode {
  kind: 'FIELD_FILTER';
  field: string;
  operator: FilterOperator;
  values: FilterValue[];
  negated: boolean;
}

export interface TextSearchNode {
  kind: 'TEXT_SEARCH';
  text: string;
  isExact: boolean;
  isFuzzy: boolean;
}

export interface HashtagNode {
  kind: 'HASHTAG';
  name: string;
}

export interface SortNode {
  kind: 'SORT';
  fields: { field: string; direction: 'asc' | 'desc' }[];
}

export interface ParseError {
  message: string;
  pos: number;
  length: number;
}

export interface ParsedQuery {
  filters: (FieldFilterNode | TextSearchNode | HashtagNode)[];
  sort: SortNode | null;
  errors: ParseError[];
}

export type QueryNode = FieldFilterNode | TextSearchNode | HashtagNode;
