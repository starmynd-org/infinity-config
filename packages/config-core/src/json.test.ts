import { describe, expect, it } from 'vitest';
import { defineComponent } from './define.js';
import { resolve } from './resolve.js';
import { validate } from './validate.js';
import { toJSONSchema } from './json-schema.js';
import type { ComponentDeclaration, JsonShape, PropertyDeclaration, SavedDocument } from './types.js';

const json = (extra: Partial<PropertyDeclaration> = {}): PropertyDeclaration => ({
  type: 'json', default: {}, cost: 'layout', label: 'JSON', description: 'JSON value', agentNote: 'Edit the JSON value', ...extra,
});
const make = (property: PropertyDeclaration = json()) => defineComponent({
  name: 'json-test', version: '1.0.0', kind: 'interface', props: { 'form.values': property },
});
const doc = (value: unknown): SavedDocument => ({ component: 'json-test', version: '1.0.0', overrides: { 'form.values': value } });
const declaration = (property: PropertyDeclaration): ComponentDeclaration => ({ name: 'json-test', version: '1.0.0', kind: 'interface', props: { 'form.values': property } });

describe('json property', () => {
  it('checks discriminated action shapes and nested list items', () => {
    const actionShape: JsonShape = { type: 'object', discriminator: 'type', oneOf: [
      { type: 'object', required: ['type', 'ref'], properties: {
        type: { type: 'string', enum: ['nav.open'] }, ref: { type: 'string', minLength: 1 },
      } },
      { type: 'object', required: ['type', 'table_id'], properties: {
        type: { type: 'string', enum: ['rows.add'] }, table_id: { type: 'string', minLength: 1 },
      } },
      { type: 'object', required: ['type', 'name'], properties: {
        type: { type: 'string', enum: ['emit'] }, name: { type: 'string', minLength: 1 },
      } },
    ] };
    const action = json({ shape: actionShape, default: { type: 'emit', name: 'ready' } });
    const component = defineComponent({ name: 'actions', version: '1.0.0', kind: 'interface', props: {
      'button.action': action,
      'form.actions': { type: 'list', default: [], cost: 'layout', label: 'Actions', description: 'Actions',
        agentNote: 'Edit actions', item: action },
    } });
    const check = (value: unknown) => validate(component, { component: 'actions', version: '1.0.0',
      overrides: { 'button.action': value } });
    expect(check({ type: 'nav.open' }).errors[0]).toMatchObject({ path: 'button.action.ref', code: 'required' });
    expect(check({ type: 'rows.add' }).errors[0]).toMatchObject({ path: 'button.action.table_id', code: 'required' });
    expect(check({ type: 'emit' }).errors[0]).toMatchObject({ path: 'button.action.name', code: 'required' });
    for (const value of [{ type: 'nav.open', ref: 'infinity://page/1' },
      { type: 'rows.add', table_id: 'table-1' }, { type: 'emit', name: 'ready' }]) expect(check(value).ok).toBe(true);
    expect(check({ type: 'unknown' }).errors[0]).toMatchObject({ path: 'button.action.type', code: 'one_of',
      message: expect.stringContaining('nav.open') });
    const list = validate(component, { component: 'actions', version: '1.0.0', overrides: {
      'form.actions': [{ type: 'nav.open' }],
    } });
    expect(list.errors[0]).toMatchObject({ path: 'form.actions[0].ref', code: 'required' });
    expect(validate(component, { component: 'actions', version: '1.0.0', overrides: {
      'form.actions': [{ type: 'nav.open', ref: 'infinity://page/1' }],
    } }).ok).toBe(true);
    const overrides = (toJSONSchema(component).properties as Record<string, { properties: Record<string, any> }>).overrides.properties;
    expect(overrides['button.action'].oneOf).toHaveLength(3);
    expect(overrides['button.action'].discriminator).toBe('type');
    expect(overrides['form.actions'].items.oneOf).toHaveLength(3);
  });
  it('accepts plain JSON and a data cost', () => {
    const component = make(json({ cost: 'data' }));
    expect(validate(component, doc({ email: 'a@example.com', count: 3, active: true, empty: null, rows: [1, 2] })).ok).toBe(true);
  });
  it('rejects functions, undefined, nonfinite numbers, nonplain objects and cycles with a path', () => {
    const component = make();
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    for (const [value, path] of [
      [{ email: () => 1 }, 'form.values.email'],
      [{ email: undefined }, 'form.values.email'],
      [{ count: NaN }, 'form.values.count'],
      [{ when: new Date() }, 'form.values.when'],
      [cycle, 'form.values.self'],
    ] as Array<[unknown, string]>) {
      expect(validate(component, doc(value)).errors[0]).toMatchObject({ path, code: 'non_json' });
    }
  });
  it('enforces the UTF-8 byte cap and exposes the default cap in JSON Schema', () => {
    const component = make(json({ maxBytes: 8 }));
    expect(validate(component, doc('éééé')).ok).toBe(false);
    expect(validate(component, doc('ééé')).ok).toBe(true);
    const schema = toJSONSchema(component);
    const overrides = (schema.properties as Record<string, { properties: Record<string, Record<string, unknown>> }>).overrides.properties;
    expect(overrides['form.values']['x-max-bytes']).toBe(8);
    expect(toJSONSchema(make()).properties).toBeDefined();
  });
  it('checks every supported shape rule and reports nested paths', () => {
    const shape: JsonShape = {
      type: 'object', required: ['email'], properties: {
        email: { type: 'string', maxLength: 5 },
        score: { type: 'number', minimum: 1, maximum: 4 },
        rows: { type: 'array', items: { type: 'integer', enum: [1, 2] } },
      },
    };
    const component = make(json({ shape, default: { email: 'ok', score: 3, rows: [1] } }));
    expect(validate(component, doc({ email: 'ok', score: 3, rows: [1, 2] })).ok).toBe(true);
    expect(validate(component, doc({ score: 0, rows: [3] })).errors.map(error => error.path)).toEqual([
      'form.values.email', 'form.values.score', 'form.values.rows[0]',
    ]);
    expect(validate(component, doc({ email: 'too long', score: 5, rows: ['bad'] })).errors.map(error => error.path)).toEqual([
      'form.values.email', 'form.values.score', 'form.values.rows[0]',
    ]);
    const schema = toJSONSchema(component);
    const overrides = (schema.properties as Record<string, { properties: Record<string, Record<string, unknown>> }>).overrides.properties;
    expect(overrides['form.values']).toMatchObject({ type: 'object', required: ['email'], 'x-max-bytes': 16384 });
  });
  it('rejects unsupported shape keywords when loading a declaration', () => {
    expect(() => defineComponent(declaration(json({ shape: { type: 'object', properties: { email: { pattern: 'x' } as JsonShape } } })))).toThrow('unsupported shape keyword');
  });
  it('checks a typed field default against its sibling column type', () => {
    const component = defineComponent({ name: 'json-test', version: '1.0.0', kind: 'interface', props: {
      'form.fields': { type: 'list', default: [], cost: 'layout', label: 'Fields', description: 'Fields', agentNote: 'Edit fields', key: 'name', item: {
        name: { type: 'text', default: '', cost: 'layout', label: 'Name', description: 'Name', agentNote: 'Name' },
        type: { type: 'enum', default: 'text', cost: 'layout', label: 'Type', description: 'Type', agentNote: 'Type', values: ['text', 'date'] },
        default: json({ default: null, typeFrom: 'type' }),
      } },
    } });
    const bad: SavedDocument = { component: 'json-test', version: '1.0.0', overrides: { 'form.fields': [{ name: 'birth', type: 'date', default: 42 }] } };
    expect(validate(component, bad).errors).toContainEqual(expect.objectContaining({ path: 'form.fields[birth].default', code: 'json_type_from' }));
    bad.overrides['form.fields'] = [{ name: 'birth', type: 'date', default: '2026-10-27' }];
    expect(validate(component, bad).ok).toBe(true);
    expect(() => defineComponent({ name: 'bad-default', version: '1.0.0', kind: 'interface', props: {
      'form.fields': { type: 'list', default: [{ name: 'birth', type: 'date', default: 42 }], cost: 'layout', label: 'Fields', description: 'Fields', agentNote: 'Edit fields', key: 'name', item: {
        name: { type: 'text', default: '', cost: 'layout', label: 'Name', description: 'Name', agentNote: 'Name' },
        type: { type: 'enum', default: 'text', cost: 'layout', label: 'Type', description: 'Type', agentNote: 'Type', values: ['text', 'date'] },
        default: json({ default: null, typeFrom: 'type' }),
      } },
    } })).toThrow('Expected a date string');
  });
  it('accepts the simple column types and rejects mismatches', () => {
    const component = defineComponent({ name: 'typed-json', version: '1.0.0', kind: 'interface', props: {
      'field.type': { type: 'enum', default: 'number', cost: 'layout', label: 'Type', description: 'Type', agentNote: 'Type', values: ['number', 'integer', 'boolean', 'email', 'url', 'date', 'single_select'] },
      'field.default': json({ default: 0, typeFrom: 'type' }),
    } });
    const check = (type: string, value: unknown) => validate(component, { component: 'typed-json', version: '1.0.0', overrides: { 'field.type': type, 'field.default': value } });
    expect(check('integer', 3).ok).toBe(true);
    expect(check('integer', 3.5).errors[0].path).toBe('field.default');
    expect(check('boolean', true).ok).toBe(true);
    expect(check('email', 'a@example.com').ok).toBe(true);
    expect(check('url', 'https://example.com').ok).toBe(true);
    expect(check('date', '2026-02-31').errors[0].path).toBe('field.default');
    expect(check('single_select', 'a').ok).toBe(true);
  });
  it('passes token shaped JSON and token strings through unchanged', () => {
    const component = make();
    const value = { nested: { token: '--accent' }, value: '--accent' };
    const result = resolve(component, { tokens: { '--accent': '#ABCDEF' }, overrides: { 'form.values': value } });
    expect(result.props['form.values']).toEqual(value);
    expect(result.warnings).toEqual([]);
  });
  it('rejects colour, token and format defaults', () => {
    for (const value of [{ token: '--accent' }, '--accent', { kind: 'currency', currency: 'USD' }]) {
      expect(() => make(json({ default: value }))).toThrow('json default cannot be a token, colour or format');
    }
  });
});
