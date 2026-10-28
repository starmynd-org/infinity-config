export type Cost = 'style' | 'layout' | 'data';
export type Scheme = 'light' | 'dark';
export type ColourValue = { token: string; mix?: { with: string; percent: number } };
export interface FontValue { family?: string; size?: string | number; weight?: number; italic?: boolean; colour?: ColourValue }
export type TokenScaleValue = { token: string; scale: number };
export type ComputedValue = { computed: string };
export type FormatValue =
  | { kind: 'auto' }
  | { kind: 'number' | 'percent'; decimals?: number; compact?: boolean }
  | { kind: 'currency'; currency: string; decimals?: number; compact?: boolean }
  | { kind: 'date'; pattern: 'day' | 'day-month' | 'month-year' | 'quarter' | 'year' | 'time' };
export type ConditionLeaf = ({ path: string } | { field: string } | { row: string }) & {
  equals?: unknown; in?: readonly unknown[]; gt?: number; gte?: number; lt?: number; lte?: number; empty?: boolean;
};
export type Condition = ConditionLeaf | { all: readonly Condition[] } | { any: readonly Condition[] } | { not: Condition };
export type ValueRule =
  | { kind: 'threshold'; steps: Array<{ when?: Condition; colour: ColourValue }> }
  | { kind: 'polarity'; good: 'up' | 'down' }
  | { kind: 'match'; cases: Array<{ when: Condition; tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'; badge: string }> };
export type DefaultValue = unknown | ColourValue | TokenScaleValue | ComputedValue;
export type PropertyType = 'bool' | 'number' | 'integer' | 'text' | 'enum' | 'colour' | 'font' | 'alignment' | 'format' | 'box' | 'rule' | 'list' | 'condition' | 'json';
export interface JsonShape {
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
  properties?: Record<string, JsonShape>;
  required?: string[];
  items?: JsonShape;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  minLength?: number;
  oneOf?: JsonShape[];
  discriminator?: string;
}
export interface PropertyDeclaration {
  type: PropertyType;
  default: DefaultValue;
  cost: Cost;
  label: string;
  description: string;
  agentNote: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: 'px' | '%' | 'deg';
  maxLength?: number;
  minLength?: number;
  required?: boolean;
  maxBytes?: number;
  shape?: JsonShape;
  typeFrom?: string;
  multiline?: boolean;
  values?: Array<string | { value: string; label: string }>;
  forbidTokens?: string[];
  contrast?: 'text' | 'mark' | 'decor';
  sizes?: number[];
  vertical?: boolean;
  kinds?: FormatValue['kind'][];
  ruleKinds?: ValueRule['kind'][];
  item?: PropertyDeclaration | Record<string, PropertyDeclaration>;
  minItems?: number;
  maxItems?: number;
  key?: string;
  leaves?: Array<'path' | 'field' | 'row'>;
  group?: string;
  order?: number;
  width?: 'full' | 'half' | 'third';
  widget?: string;
  visibleWhen?: Condition;
  allowRules?: boolean;
  since?: string;
  deprecated?: string;
  hidden?: boolean;
}
export type PropertyMap = Record<string, PropertyDeclaration>;
export interface ComponentDeclaration {
  name: string;
  version: string;
  kind: 'visual' | 'interface';
  bundle?: 'main' | 'charts';
  data?: { shape: string; seriesFrom?: 'category' };
  seriesTypes?: Array<'bar' | 'line' | 'area'>;
  groups?: PropertyMap[];
  props?: PropertyMap;
  series?: Record<string, boolean>;
  overrides?: Record<string, { default?: unknown; hidden?: boolean; label?: string }>;
  variants?: Record<string, { config?: SavedDocument; data?: unknown }>;
  computed?: Record<string, (ctx: ResolveContext) => unknown>;
  allowAccent?: true | Condition;
}
export interface DefinedComponent extends ComponentDeclaration {
  bundle: 'main' | 'charts';
  properties: PropertyMap;
  originalProperties: PropertyMap;
}
export interface SeriesRule {
  match: { id?: string; label?: string; role?: string; index?: number };
  set: Record<string, unknown>;
}
export interface SavedDocument {
  component: string;
  version: string;
  overrides: Record<string, unknown>;
  series?: SeriesRule[];
  raw?: Record<string, Record<string, unknown>>;
  rawNote?: string;
}
export type TokenMap = Record<string, string>;
export interface ConfigPolicy { rawNoteRequired?: boolean }
export interface TokenSets { light: TokenMap; dark: TokenMap; scheme: Scheme }
export interface LayerInput {
  tokens?: TokenMap | TokenSets;
  defaults?: Record<string, unknown>;
  overrides?: Record<string, unknown>;
  series?: SeriesRule[];
  raw?: SavedDocument['raw'];
  rawNote?: SavedDocument['rawNote'];
}
export interface SeriesInfo { id: string; label?: string; role?: string }
export interface ResolveContext {
  scheme?: Scheme;
  series?: SeriesInfo[];
  facts?: Record<string, unknown>;
  fields?: Record<string, unknown>;
  row?: Record<string, unknown>;
}
export interface SourceStep { layer: string; value: unknown; token?: string; scheme?: Scheme }
export interface PropertySource { winner: string; chain: SourceStep[]; token?: string; hidden: boolean }
export interface Diagnostic { path: string; code: string; message: string; fix?: string }
export interface ResolvedConfig {
  props: Record<string, unknown>;
  sources: Record<string, PropertySource>;
  warnings: Diagnostic[];
  series: Record<string, Record<string, unknown>>;
  seriesSources: Record<string, PropertySource>;
  raw: SavedDocument['raw'];
  rawNote?: string;
  component: DefinedComponent;
}
export interface ExplainResult { path: string; value: unknown; winner: string; chain: SourceStep[]; cost: Cost; hidden: boolean; rawNote?: string }
export type PatchOperation =
  | { op: 'set'; path: string; value: unknown }
  | { op: 'reset'; path?: string; scope?: 'style' | 'layout' | 'series' | 'raw' | 'all' | string }
  | { op: 'addSeriesRule'; rule: SeriesRule };
export interface ValidationResult { ok: boolean; errors: Diagnostic[]; warnings: Diagnostic[] }
export interface PatchResult extends ValidationResult { doc: SavedDocument; changed: string[]; cost: Cost }
