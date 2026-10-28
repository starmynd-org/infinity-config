import type { Diagnostic, JsonShape } from './types.js';

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = new Set(['type', 'properties', 'required', 'items', 'enum', 'minimum', 'maximum', 'minLength', 'maxLength', 'oneOf', 'discriminator']);
const types = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);
export const columnTypes = new Set(['text', 'email', 'url', 'long_text', 'number', 'integer', 'boolean', 'date', 'single_select']);

export function checkShapeDeclaration(candidate: unknown, path: string): void {
  if (!object(candidate) || Object.getPrototypeOf(candidate) !== Object.prototype) throw new Error(`${path}: shape must be an object`);
  const shape = candidate as JsonShape;
  for (const key of Object.keys(shape)) if (!keys.has(key)) throw new Error(`${path}.${key}: unsupported shape keyword`);
  if (shape.type !== undefined && (typeof shape.type !== 'string' || !types.has(shape.type))) throw new Error(`${path}.type: unsupported JSON type`);
  if (shape.properties !== undefined) {
    if (!object(shape.properties)) throw new Error(`${path}.properties: expected an object`);
    for (const [name, child] of Object.entries(shape.properties as Record<string, JsonShape>)) checkShapeDeclaration(child, `${path}.properties.${name}`);
  }
  if (shape.required !== undefined && (!Array.isArray(shape.required) || shape.required.some(name => typeof name !== 'string'))) throw new Error(`${path}.required: expected string names`);
  if (shape.items !== undefined) checkShapeDeclaration(shape.items, `${path}.items`);
  if (shape.oneOf !== undefined) {
    if (!Array.isArray(shape.oneOf) || shape.oneOf.length === 0) throw new Error(`${path}.oneOf: expected one or more shapes`);
    if (!shape.discriminator) throw new Error(`${path}.oneOf: discriminator is required`);
    shape.oneOf.forEach((branch, index) => checkShapeDeclaration(branch, `${path}.oneOf[${index}]`));
  }
  if (shape.discriminator !== undefined) {
    if (typeof shape.discriminator !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(shape.discriminator) || !shape.oneOf)
      throw new Error(`${path}.discriminator: expected a key with oneOf branches`);
    const values = new Set<string>();
    for (const [index, branch] of shape.oneOf.entries()) {
      const choices = branch.properties?.[shape.discriminator]?.enum;
      if (!choices?.length || choices.some(choice => typeof choice !== 'string'))
        throw new Error(`${path}.oneOf[${index}]: discriminator needs string enum values`);
      for (const choice of choices as string[]) {
        if (values.has(choice)) throw new Error(`${path}.oneOf[${index}]: discriminator value ${choice} is duplicated`);
        values.add(choice);
      }
    }
  }
  if (shape.enum !== undefined && (!Array.isArray(shape.enum) || shape.enum.some(value => jsonIssue(value, path)))) throw new Error(`${path}.enum: expected plain JSON values`);
  for (const key of ['minimum', 'maximum'] as const) if (shape[key] !== undefined && (typeof shape[key] !== 'number' || !Number.isFinite(shape[key]))) throw new Error(`${path}.${key}: expected a finite number`);
  for (const key of ['minLength', 'maxLength'] as const) if (shape[key] !== undefined && (!Number.isInteger(shape[key]) || shape[key] < 0)) throw new Error(`${path}.${key}: expected a nonnegative integer`);
}

export function jsonIssue(value: unknown, path: string, seen = new Set<object>()): Diagnostic | undefined {
  const bad = (message: string): Diagnostic => ({ path, code: 'non_json', message });
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') return Number.isFinite(value) ? undefined : bad('JSON numbers must be finite');
  if (typeof value !== 'object') return bad('Expected a plain JSON value');
  if (seen.has(value)) return bad('JSON values cannot contain cycles');
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) return bad('Expected a plain JSON object');
  if (Object.getOwnPropertySymbols(value).length) return bad('JSON values cannot have symbol keys');
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) if (!(index in value)) return { path: `${path}[${index}]`, code: 'non_json', message: 'JSON arrays cannot have gaps' };
    if (Object.keys(value).some(key => !/^(0|[1-9]\d*)$/.test(key))) return bad('JSON arrays cannot have named properties');
  }
  seen.add(value);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!('value' in descriptor)) return { path: Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`, code: 'non_json', message: 'JSON values cannot have accessors' };
    if (Array.isArray(value) && key === 'length') continue;
    const child = descriptor.value;
    const childPath = Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`;
    const problem = jsonIssue(child, childPath, seen);
    if (problem) return problem;
  }
  seen.delete(value);
  return;
}

function sameJson(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, index) => sameJson(value, b[index]));
  if (object(a) && object(b)) return Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([key, value]) => key in b && sameJson(value, b[key]));
  return false;
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'null': return value === null;
    case 'object': return object(value);
    case 'array': return Array.isArray(value);
    case 'string': return typeof value === 'string';
    case 'boolean': return typeof value === 'boolean';
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    default: return false;
  }
}

export function shapeIssues(value: unknown, shape: JsonShape, path: string): Diagnostic[] {
  const errors: Diagnostic[] = [];
  const add = (at: string, message: string) => errors.push({ path: at, code: 'json_shape', message });
  if (shape.type && !matchesType(value, shape.type)) { add(path, `Expected ${shape.type}`); return errors; }
  if (shape.enum && !shape.enum.some(item => sameJson(item, value))) add(path, 'Value is outside the allowed enum');
  if (typeof value === 'number') {
    if (shape.minimum !== undefined && value < shape.minimum) add(path, `Value must be at least ${shape.minimum}`);
    if (shape.maximum !== undefined && value > shape.maximum) add(path, `Value must be at most ${shape.maximum}`);
  }
  if (typeof value === 'string') {
    if (shape.minLength !== undefined && value.length < shape.minLength) add(path, `Text needs at least ${shape.minLength} characters`);
    if (shape.maxLength !== undefined && value.length > shape.maxLength) add(path, `Text exceeds ${shape.maxLength} characters`);
  }
  if (object(value)) {
    for (const key of shape.required ?? []) if (!(key in value)) errors.push({ path: `${path}.${key}`, code: 'required', message: 'Required value is missing', fix: `Add ${key}` });
    for (const [key, child] of Object.entries(shape.properties ?? {})) if (key in value) errors.push(...shapeIssues(value[key], child, `${path}.${key}`));
  }
  if (Array.isArray(value) && shape.items) value.forEach((item, index) => errors.push(...shapeIssues(item, shape.items!, `${path}[${index}]`)));
  if (shape.oneOf && shape.discriminator) {
    const allowed = shape.oneOf.flatMap(branch => branch.properties?.[shape.discriminator!]?.enum ?? []).map(String);
    const choice = object(value) ? value[shape.discriminator] : undefined;
    const branch = shape.oneOf.find(item => item.properties?.[shape.discriminator!]?.enum?.includes(choice));
    if (!branch) errors.push({ path: `${path}.${shape.discriminator}`, code: 'one_of',
      message: `Choose one of: ${allowed.join(', ')}`, fix: `Set ${shape.discriminator} to an allowed value` });
    else errors.push(...shapeIssues(value, branch, path));
  }
  return errors;
}

export function columnIssue(value: unknown, columnType: unknown, path: string): Diagnostic | undefined {
  const bad = (message: string): Diagnostic => ({ path, code: `json_type_from`, message });
  if (typeof columnType !== 'string' || !columnTypes.has(columnType)) return bad(`Unknown column type ${String(columnType)}`);
  if (value === null) return;
  if (columnType === 'boolean') return typeof value === 'boolean' ? undefined : bad('Expected a boolean');
  if (columnType === 'number') return typeof value === 'number' && Number.isFinite(value) ? undefined : bad('Expected a finite number');
  if (columnType === 'integer') return typeof value === 'number' && Number.isInteger(value) ? undefined : bad('Expected an integer');
  if (typeof value !== 'string') return bad(`Expected a ${columnType} string`);
  if (columnType === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)) return bad('Expected a date in YYYY-MM-DD form');
  if (columnType === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return bad('Expected an email address');
  if (columnType === 'url') { try { new URL(value); } catch { return bad('Expected a URL'); } }
  return;
}
