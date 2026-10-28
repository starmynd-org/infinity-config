import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { defineComponent } from './define.js';
import { axis, chrome, colour, dataLabels, delta, layout, legend, tone, value } from './groups/index.js';
import { evaluateCondition, readDependencies } from './condition.js';
import { resolve } from './resolve.js';
import { explain } from './explain.js';
import { validate } from './validate.js';
import { applyPatch } from './patch.js';
import { migrate, registerMigration } from './migrate.js';
import { toJSONSchema } from './json-schema.js';
import { tokensFromCss, tokensFromBridge } from './tokens.js';
import type { SavedDocument } from './types.js';

const property = (type: 'text' | 'integer' | 'enum' | 'colour', value: unknown, extra = {}) => ({
  type, default: value, cost: 'layout' as const, label: 'Value', description: 'A test value', agentNote: 'Change for test cases', ...extra,
});
const component = defineComponent({
  name: 'test-card', version: '1.0.0', kind: 'visual', groups: [chrome(), legend()],
  props: {
    'custom.value': property('integer', 2, { min: 0, max: 10 }),
    'custom.choice': property('enum', 'a', { values: ['a', 'b'] }),
    'custom.text': property('text', ''),
    'custom.colour': property('colour', { token: '--series-1' }),
    'custom.hidden': property('text', 'secret', { visibleWhen: { path: 'custom.value', gt: 3 } }),
  },
  series: { colour: true, hidden: true }, variants: {},
});
const tokens = { light: { '--card': '#FFFFFF', '--series-1': '#111111', '--series-2': '#333333', '--rule': '#333333', '--ink': '#111111', '--soft': '#444444' }, dark: { '--card': '#111111', '--series-1': '#EEEEEE', '--series-2': '#CCCCCC', '--rule': '#CCCCCC', '--ink': '#EEEEEE', '--soft': '#BBBBBB' }, scheme: 'light' as const };
const doc = (overrides: Record<string, unknown> = {}): SavedDocument => ({ component: 'test-card', version: '1.0.0', overrides });

describe('declaration', () => {
  it('limits series mark types and exposes them in the schema', () => {
    const combo = defineComponent({ name: 'combo-test', version: '1.0.0', kind: 'visual',
      groups: [axis('y'), axis('y2')], seriesTypes: ['bar', 'line', 'area'], series: { axis: true } });
    expect(toJSONSchema(combo)['x-series-types']).toEqual(['bar', 'line', 'area']);
    expect(() => defineComponent({ name: 'bad-combo', version: '1.0.0', kind: 'visual',
      seriesTypes: ['bar', 'bar'] })).toThrow();
    const saved: SavedDocument = { component: 'combo-test', version: '1.0.0', overrides: {}, series: [
      { match: { id: 'revenue' }, set: { type: 'line', axis: 'y2' } },
    ] };
    expect(validate(combo, saved).ok).toBe(true);
    expect(resolve(combo, { series: saved.series }, { series: [{ id: 'revenue' }, { id: 'orders' }] }).series)
      .toMatchObject({ revenue: { type: 'line', axis: 'y2' }, orders: { axis: 'y' } });
    const noTypes = defineComponent({ name: 'no-types', version: '1.0.0', kind: 'visual',
      groups: [axis('y')], series: { axis: true } });
    expect(validate(noTypes, { component: 'no-types', version: '1.0.0', overrides: {},
      series: [{ match: { id: 'revenue' }, set: { type: 'line', axis: 'y2' } }] }).errors)
      .toEqual(expect.arrayContaining([expect.objectContaining({ path: 'series[0].type', code: 'not_allowed' }),
        expect.objectContaining({ path: 'series[0].axis', code: 'not_allowed' })]));
  });
  it('resolves shared value and delta defaults and a component default override', () => {
    const grouped = defineComponent({ name: 'metric-test', version: '1.0.0', kind: 'visual',
      groups: [value(), delta()] });
    expect(Object.keys(grouped.originalProperties)).toEqual([
      'value.format', 'value.font', 'value.size', 'value.align',
      'delta.show', 'delta.kind', 'delta.decimals', 'delta.polarity', 'delta.label',
    ]);
    const resolved = resolve(grouped, { tokens: { '--ink': '#123456' } }).props;
    expect(resolved).toMatchObject({
      'value.format': { kind: 'auto' },
      'value.font.family': '--font', 'value.font.size': '--t-24',
      'value.font.weight': 600, 'value.font.italic': false,
      'value.font.colour': '#123456', 'value.size': 'standard', 'value.align': 'start',
      'delta.show': true, 'delta.kind': 'percent', 'delta.decimals': 1,
      'delta.polarity': { kind: 'polarity', good: 'up' }, 'delta.label': 'vs previous',
    });
    const changed = defineComponent({ name: 'metric-large', version: '1.0.0', kind: 'visual',
      groups: [value(), delta()], overrides: { 'value.size': { default: 'large' } } });
    expect(resolve(changed, { tokens: {} }).props['value.size']).toBe('large');
    expect(validate(grouped, { component: 'metric-test', version: '1.0.0',
      overrides: { 'delta.decimals': 5 } }).ok).toBe(false);
  });
  it('expands box into scalar paths', () => expect(component.properties['chrome.padding.left']).toBeDefined());
  it('expands font into five scalar paths', () => expect(Object.keys(component.properties).filter(path => path.startsWith('chrome.title.font.'))).toEqual(['chrome.title.font.family', 'chrome.title.font.size', 'chrome.title.font.weight', 'chrome.title.font.italic', 'chrome.title.font.colour']));
  it('uses soft defaults for axis and legend font colour', () => {
    const grouped = defineComponent({ name: 'fonts', version: '1.0.0', kind: 'visual', groups: [axis('x'), legend(), dataLabels()] });
    expect(grouped.properties['axis.x.labels.font.colour'].default).toEqual({ token: '--soft' });
    expect(grouped.properties['legend.font.colour'].default).toEqual({ token: '--soft' });
    expect(grouped.properties['labels.font.colour'].default).toEqual({ token: '--ink' });
  });
  it('declares and resolves the shared layout group', () => {
    const grouped = defineComponent({ name: 'layout-test', version: '1.0.0', kind: 'interface', groups: [layout()] });
    expect(Object.keys(grouped.properties)).toEqual([
      'layout.gap', 'layout.align', 'layout.justify', 'layout.wrap', 'layout.columns',
      'layout.collapseBelow', 'layout.maxWidth',
    ]);
    expect(Object.values(grouped.properties).every(property => property.cost === 'layout')).toBe(true);
    const result = resolve(grouped, { tokens: { '--s-4': '16px', '--s-6': '32px' } });
    expect(result.props).toMatchObject({ 'layout.gap': '16px', 'layout.align': 'stretch',
      'layout.justify': 'start', 'layout.wrap': true, 'layout.columns': 2,
      'layout.collapseBelow': 'phone', 'layout.maxWidth': 'full' });
    expect(result.sources['layout.gap'].token).toBe('--s-4');
    expect(resolve(grouped, { tokens: { '--s-6': '32px' }, overrides: { 'layout.gap': 's-6' } })
      .props['layout.gap']).toBe('32px');
    expect(validate(grouped, { component: 'layout-test', version: '1.0.0',
      overrides: { 'layout.align': 'stretch', 'layout.columns': 4 } }).ok).toBe(true);
    expect(validate(grouped, { component: 'layout-test', version: '1.0.0',
      overrides: { 'layout.columns': 5 } }).ok).toBe(false);
    const schema = toJSONSchema(grouped).properties as Record<string, any>;
    expect(schema.overrides.properties['layout.gap'].enum).toEqual(Array.from({ length: 9 }, (_, index) => `s-${index}`));
    expect(schema.overrides.properties['layout.align'].enum).toEqual(['start', 'center', 'end', 'stretch']);
    expect(schema.overrides.properties['layout.columns']).toMatchObject({ type: 'integer', minimum: 1, maximum: 4 });
  });
  it('declares the shared chrome header setting in the JSON Schema', () => {
    const properties = (toJSONSchema(component).properties as Record<string, any>).overrides.properties;
    expect(component.properties['chrome.header']).toMatchObject({ type: 'enum', default: 'card', cost: 'layout' });
    expect(properties['chrome.header'].enum).toEqual(['card', 'none']);
    const defaultConfig = resolve(component);
    expect(defaultConfig.props['chrome.header']).toBeUndefined();
    expect(explain(defaultConfig, 'chrome.header').value).toBe('card');
    expect(resolve(component, { overrides: { 'chrome.header': 'none' } }).props['chrome.header']).toBe('none');
  });
  it('requires labelled text and enforces its minimum length', () => {
    const button = defineComponent({ name: 'button', version: '1.0.0', kind: 'interface', props: {
      'button.label': { ...property('text', ''), required: true, minLength: 2 },
      'button.help': property('text', ''),
    } });
    const check = (overrides: Record<string, unknown>) => validate(button, { component: 'button', version: '1.0.0', overrides });
    expect(check({}).errors[0]).toMatchObject({ path: 'button.label', code: 'required', fix: expect.any(String) });
    expect(check({ 'button.label': '  ' }).errors[0]).toMatchObject({ path: 'button.label', code: 'required' });
    expect(check({ 'button.label': 'A' }).errors[0]).toMatchObject({ path: 'button.label', code: 'min_length', fix: expect.any(String) });
    expect(check({ 'button.label': 'Go', 'button.help': '' }).ok).toBe(true);
    const overrides = (toJSONSchema(button).properties as Record<string, any>).overrides;
    expect(overrides.required).toEqual(['button.label']);
    expect(overrides.properties['button.label'].minLength).toBe(2);
    expect(overrides.properties['button.help'].minLength).toBeUndefined();
  });
  it('shares tone values while reserving accent for opted in components', () => {
    const neutral = defineComponent({ name: 'notice', version: '1.0.0', kind: 'interface', groups: [tone()] });
    const accented = defineComponent({ name: 'button', version: '1.0.0', kind: 'interface', groups: [tone()], allowAccent: true });
    expect(neutral.properties.tone).toMatchObject({ type: 'enum', default: 'neutral', cost: 'style' });
    expect(validate(neutral, { component: 'notice', version: '1.0.0', overrides: { tone: 'accent' } }).errors[0])
      .toMatchObject({ path: 'tone', code: 'accent_forbidden' });
    expect(validate(accented, { component: 'button', version: '1.0.0', overrides: { tone: 'accent' } }).ok).toBe(true);
    const neutralTone = (toJSONSchema(neutral).properties as Record<string, any>).overrides.properties.tone;
    const accentedTone = (toJSONSchema(accented).properties as Record<string, any>).overrides.properties.tone;
    expect(neutralTone.enum).not.toContain('accent');
    expect(accentedTone.enum).toContain('accent');
    expect(toJSONSchema(accented)['x-allow-accent']).toBe(true);
  });
  it('gates accent against resolved path conditions', () => {
    const condition = { path: 'button.kind', equals: 'go' } as const;
    const button = defineComponent({ name: 'conditional-button', version: '1.0.0', kind: 'interface',
      groups: [tone()], allowAccent: condition,
      props: { 'button.kind': { type: 'enum', default: 'plain', cost: 'style', label: 'Button kind',
        description: 'Action emphasis', agentNote: 'Use go for the main action', values: ['go', 'plain', 'quiet'] } } });
    const doc = (overrides: Record<string, unknown>) => ({ component: button.name, version: button.version, overrides });
    expect(validate(button, doc({ 'button.kind': 'go', tone: 'accent' })).ok).toBe(true);
    const rejected = validate(button, doc({ 'button.kind': 'plain', tone: 'accent' }));
    expect(rejected.errors[0]).toMatchObject({ path: 'tone', code: 'accent_not_allowed' });
    expect(rejected.errors[0].fix).toContain('button.kind');
    expect(validate(button, doc({ 'button.kind': 'plain', tone: 'neutral' })).ok).toBe(true);
    expect(toJSONSchema(button)['x-allow-accent']).toEqual(condition);
    const schemaTone = ((toJSONSchema(button).properties as Record<string, any>).overrides.properties as Record<string, any>).tone;
    expect(schemaTone.enum).toContain('accent');
  });
  it('accepts only declared path leaves in an accent condition', () => {
    const base = { name: 'invalid-accent', version: '1.0.0', kind: 'interface' as const, groups: [tone()] };
    expect(() => defineComponent({ ...base, allowAccent: { field: 'kind', equals: 'go' } })).toThrow('path leaves only');
    expect(() => defineComponent({ ...base, allowAccent: { path: 'button.kind', equals: 'go' } })).toThrow('not a declared property');
    expect(() => defineComponent({ ...base, allowAccent: { all: [] } })).toThrow('path leaves only');
  });
  it('freezes the declaration', () => expect(Object.isFrozen(component.properties['chrome.card.background'])).toBe(true));
  it('rejects missing notes', () => expect(() => defineComponent({ name: 'bad', version: '1.0.0', kind: 'visual', props: { a: { type: 'bool', default: true, cost: 'style', label: 'A', description: 'A', agentNote: '' } } })).toThrow());
  it('rejects shared group renaming', () => expect(() => defineComponent({ name: 'bad', version: '1.0.0', kind: 'visual', groups: [chrome()], overrides: { 'chrome.card.show': { label: 'Renamed' } } })).toThrow());
  it('applies default overrides', () => expect(defineComponent({ name: 'ok', version: '1.0.0', kind: 'visual', groups: [chrome()], overrides: { 'chrome.card.show': { default: false } } }).properties['chrome.card.show'].default).toBe(false));
  it('defaults component bundle to main and exports it', () => {
    expect(component.bundle).toBe('main');
    expect(toJSONSchema(component)['x-bundle']).toBe('main');
  });
  it('accepts charts as a component bundle and exports it', () => {
    const chart = defineComponent({ name: 'chart', version: '1.0.0', kind: 'visual', bundle: 'charts' });
    expect(chart.bundle).toBe('charts');
    expect(toJSONSchema(chart)['x-bundle']).toBe('charts');
  });
  it('exports category member series metadata only for categorical declarations', () => {
    const memberChart = defineComponent({ name: 'member-chart', version: '1.0.0', kind: 'visual',
      data: { shape: 'categorical', seriesFrom: 'category' } });
    expect(toJSONSchema(memberChart)['x-data-seriesFrom']).toBe('category');
    expect(toJSONSchema(defineComponent({ name: 'regular-chart', version: '1.0.0', kind: 'visual',
      data: { shape: 'categorical' } }))['x-data-seriesFrom']).toBeUndefined();
    expect(() => defineComponent({ name: 'bad-member-chart', version: '1.0.0', kind: 'visual',
      data: { shape: 'table', seriesFrom: 'category' } })).toThrow('Category series require categorical data');
  });
  it('declares the shared primary colour', () => {
    const primary = defineComponent({ name: 'primary', version: '1.0.0', kind: 'visual', groups: [colour()] }).properties['colour.primary'];
    expect(primary).toEqual(expect.objectContaining({ type: 'colour', default: { token: '--series-1' }, contrast: 'mark', cost: 'style' }));
  });
});

describe('cascade', () => {
  const paletteComponent = defineComponent({ name: 'palette-test', version: '1.0.0', kind: 'visual', groups: [colour()], series: { colour: true } });
  const paletteTokens = Object.fromEntries([
    ...Array.from({ length: 4 }, (_, index) => [`--series-${index + 1}`, `#${String(index + 1).repeat(6)}`]),
    ...Array.from({ length: 6 }, (_, index) => [`--seq-${index + 2}`, `#${(index + 5).toString(16).toUpperCase().repeat(6)}`]),
    ['--series-dash', '5 3'],
  ]);
  it('assigns four positional series colours and reuses the first with a dash for a fifth', () => {
    const result = resolve(paletteComponent, { tokens: paletteTokens }, {
      series: ['a', 'b', 'c', 'd', 'e'].map(id => ({ id })),
    });
    expect(Object.values(result.series).map(item => item.colour)).toEqual(['#111111', '#222222', '#333333', '#444444', '#111111']);
    expect(result.series.e.dashed).toBe(true);
    expect(result.series.e.dash).toBe('5 3');
    expect(explain(result, 'series.b.colour').winner).toBe('palette');
  });
  it('uses primary for the only value series and comparison colour for its comparison', () => {
    const result = resolve(paletteComponent, { tokens: paletteTokens }, {
      series: [{ id: 'a' }, { id: 'prior', role: 'comparison' }],
    });
    expect(result.series.a.colour).toBe('#111111');
    expect(result.series.prior.colour).toBe('#444444');
    expect(result.series.prior.dashed).toBe(true);
    expect(result.series.prior.dash).toBe('5 3');
  });
  it('lets L4 override the palette and supports sequential and custom palettes', () => {
    const infos = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const sequential = resolve(paletteComponent, { tokens: paletteTokens, overrides: { 'colour.palette': 'sequential' } }, { series: infos });
    expect(Object.values(sequential.series).map(item => item.colour)).toEqual(['#555555', '#888888', '#AAAAAA']);
    const custom = resolve(paletteComponent, { tokens: paletteTokens, overrides: {
      'colour.palette': 'custom', 'colour.custom': [{ token: '--series-2' }, { token: '--series-3' }],
    }, series: [{ match: { id: 'b' }, set: { colour: { token: '--series-4' } } }] }, { series: infos });
    expect(Object.values(custom.series).map(item => item.colour)).toEqual(['#222222', '#444444', '#222222']);
    expect(explain(custom, 'series.b.colour').chain.map(step => step.layer)).toEqual(['palette', 'L4 per-series rule']);
  });
  it('keeps a series colour stable when data order changes', () => {
    const first = resolve(paletteComponent, { tokens: paletteTokens, overrides: { 'colour.stableKeys': true } }, { series: [{ id: 'revenue' }, { id: 'orders' }] });
    const second = resolve(paletteComponent, { tokens: paletteTokens, overrides: { 'colour.stableKeys': true } }, { series: [{ id: 'orders' }, { id: 'revenue' }] });
    expect(first.series.revenue.colour).toBe(second.series.revenue.colour);
  });
  it('probes past stable hash collisions while free palette slots remain', () => {
    const result = resolve(paletteComponent, { tokens: paletteTokens, overrides: { 'colour.stableKeys': true } }, {
      series: ['a', 'e', 'i', 'm'].map(id => ({ id })),
    });
    expect(Object.values(result.series).map(item => item.colour)).toEqual(['#111111', '#222222', '#333333', '#444444']);
  });
  it('uses L0', () => expect(resolve(component).props['custom.value']).toBe(2));
  it('uses L1 light', () => expect(resolve(component, { tokens }, { scheme: 'light' }).props['custom.colour']).toBe('#111111'));
  it('uses L1 dark', () => expect(resolve(component, { tokens }, { scheme: 'dark' }).props['custom.colour']).toBe('#EEEEEE'));
  it('resolves font colour in the active scheme', () => {
    expect(resolve(component, { tokens }, { scheme: 'light' }).props['chrome.title.font.colour']).toBe('#111111');
    expect(resolve(component, { tokens }, { scheme: 'dark' }).props['chrome.title.font.colour']).toBe('#EEEEEE');
  });
  it('uses L2', () => expect(resolve(component, { defaults: { 'custom.value': 3 } }).props['custom.value']).toBe(3));
  it('uses component L2', () => expect(resolve(component, { defaults: { 'test-card': { 'custom.value': 4 } } }).props['custom.value']).toBe(4));
  it('uses L3 over L2', () => expect(resolve(component, { defaults: { 'custom.value': 3 }, overrides: { 'custom.value': 5 } }).props['custom.value']).toBe(5));
  it('uses L4 series matching by id', () => expect(resolve(component, { tokens, series: [{ match: { id: 'a' }, set: { colour: { token: '--series-2' } } }] }, { series: [{ id: 'a' }] }).series.a.colour).toBe('#333333'));
  it('uses L4 later rule', () => expect(resolve(component, { series: [{ match: { id: 'a' }, set: { hidden: false } }, { match: { id: 'a' }, set: { hidden: true } }] }, { series: [{ id: 'a' }] }).series.a.hidden).toBe(true));
  it('matches labels and comparison roles and explains the winning rule', () => {
    const result = resolve(component, { tokens, series: [
      { match: { id: 'revenue' }, set: { colour: { token: '--series-1' } } },
      { match: { label: '^Prior' }, set: { hidden: true } },
      { match: { role: 'comparison' }, set: { colour: { token: '--series-2' } } },
      { match: { id: 'revenue' }, set: { colour: { token: '--series-2' } } },
    ] }, { series: [{ id: 'revenue', label: 'Revenue' }, { id: 'prior', label: 'Prior revenue', role: 'comparison' }], scheme: 'dark' });
    expect(result.series).toEqual({ revenue: { colour: '#CCCCCC' }, prior: { hidden: true, colour: '#CCCCCC' } });
    expect(explain(result, 'series.revenue.colour')).toEqual(expect.objectContaining({
      winner: 'L4 per-series rule', value: '#CCCCCC',
      chain: [expect.objectContaining({ layer: 'L4 per-series rule' }), expect.objectContaining({ layer: 'L4 per-series rule', token: '--series-2', scheme: 'dark' })],
    }));
  });
  it('keeps L5 raw', () => expect(resolve(component, { raw: { chart: { barGap: 5 } } }).raw?.chart.barGap).toBe(5));
  it('mixes tokens', () => expect(resolve(component, { tokens, overrides: { 'custom.colour': { token: '--series-1', mix: { with: '--card', percent: 50 } } } }).props['custom.colour']).toBe('#888888'));
  it('keeps a value rule as a rule', () => {
    const rule = { kind: 'polarity', good: 'up' };
    expect(resolve(component, { overrides: { 'custom.text': rule } }).props['custom.text']).toEqual(rule);
  });
  it('skips hidden paths', () => expect(resolve(component).props['custom.hidden']).toBeUndefined());
  it('restores visible paths', () => expect(resolve(component, { overrides: { 'custom.value': 4 } }).props['custom.hidden']).toBe('secret'));
  it('computes legend default', () => expect(resolve(component, {}, { series: [{ id: 'a' }, { id: 'b' }] }).props['legend.show']).toBe(true));
  it('reports token winner', () => expect(explain(resolve(component, { tokens }), 'custom.colour').winner).toBe('L1 workspace theme'));
  it('reports L3 winner', () => expect(explain(resolve(component, { overrides: { 'custom.value': 4 } }), 'custom.value').winner).toBe('L3 visual'));
  it('is pure across repeated calls', () => {
    const layers = { tokens, overrides: { 'custom.value': 4 } };
    const before = structuredClone(layers);
    const a = resolve(component, layers), b = resolve(component, layers);
    expect(a).toEqual(b);
    expect(layers).toEqual(before);
  });
});

describe('conditions', () => {
  const context = { facts: { count: 4 }, fields: { email: '' }, row: { amount: 25 } };
  it.each([
    [{ path: 'count', equals: 4 }, true],
    [{ path: 'count', in: [3, 4] }, true],
    [{ path: 'count', gt: 3 }, true],
    [{ path: 'count', gte: 4 }, true],
    [{ path: 'count', lt: 5 }, true],
    [{ path: 'count', lte: 4 }, true],
    [{ field: 'email', empty: true }, true],
    [{ row: 'amount', gt: 20 }, true],
    [{ not: { path: 'count', equals: 3 } }, true],
    [{ all: [{ path: 'count', gt: 3 }, { row: 'amount', lt: 30 }] }, true],
    [{ any: [{ path: 'count', lt: 1 }, { field: 'email', empty: true }] }, true],
  ] as const)('evaluates %j', (condition, expected) => expect(evaluateCondition(condition, {}, context)).toBe(expected));
  it('reports dependencies', () => expect(readDependencies({ all: [{ path: 'a', equals: 1 }, { field: 'b', empty: true }] })).toEqual(['a', 'field:b']));
});

describe('validation', () => {
  it('accepts a document', () => expect(validate(component, doc()).ok).toBe(true));
  it('rejects wrong component', () => expect(validate(component, { ...doc(), component: 'other' }).errors[0].code).toBe('wrong_component'));
  it('rejects a non-integer', () => expect(validate(component, doc({ 'custom.value': 1.5 })).ok).toBe(false));
  it('rejects an out of range number', () => expect(validate(component, doc({ 'custom.value': 11 })).ok).toBe(false));
  it('rejects an invalid enum', () => expect(validate(component, doc({ 'custom.choice': 'z' })).ok).toBe(false));
  it('rejects hex colours', () => expect(validate(component, doc({ 'custom.colour': '#FFFFFF' })).ok).toBe(false));
  it('rejects bronze', () => expect(validate(component, doc({ 'custom.colour': { token: '--bronze' } })).errors.some(item => item.code === 'bronze_forbidden')).toBe(true));
  it('rejects bronze settings on interface and visual components with their paths', () => {
    const interfaceComponent = defineComponent({ name: 'interface-card', version: '1.0.0', kind: 'interface', groups: [chrome()] });
    const interfaceDoc: SavedDocument = { component: 'interface-card', version: '1.0.0', overrides: { 'chrome.card.background': { token: '--bronze' } } };
    expect(validate(interfaceComponent, interfaceDoc).errors).toContainEqual(expect.objectContaining({ path: 'chrome.card.background', code: 'bronze_forbidden' }));
    expect(validate(component, doc({ 'chrome.card.background': { token: '--on-bronze' } })).errors).toContainEqual(expect.objectContaining({ path: 'chrome.card.background', code: 'bronze_forbidden' }));
    expect(validate(interfaceComponent, { ...interfaceDoc, overrides: { 'chrome.card.background': { token: '--bronze-soft' } } }).errors).toContainEqual(expect.objectContaining({ path: 'chrome.card.background', code: 'bronze_forbidden' }));
  });
  it('rejects bronze in title font colour', () => expect(validate(component, doc({ 'chrome.title.font.colour': { token: '--bronze' } })).errors.some(item => item.code === 'bronze_forbidden')).toBe(true));
  it('rejects an invalid mix', () => expect(validate(component, doc({ 'custom.colour': { token: '--series-1', mix: { with: '--card', percent: 101 } } })).ok).toBe(false));
  it('warns on an unknown key and keeps it valid', () => expect(validate(component, doc({ future: 7 })).warnings[0].code).toBe('unknown_key'));
  it('warns on state series colours', () => expect(validate(component, { ...doc(), series: [{ match: { id: 'a' }, set: { colour: { token: '--ok' } } }] }).warnings.some(item => item.code === 'state_series_colour')).toBe(true));
  it('rejects a bad regex', () => expect(validate(component, { ...doc(), series: [{ match: { label: '[' }, set: { hidden: true } }] }).ok).toBe(false));
  it('rejects unknown raw props', () => expect(validate(component, { ...doc(), raw: { chart: { fake: 1 } } }).ok).toBe(false));
  it('warns on low contrast', () => expect(validate(component, doc({ 'custom.colour': { token: '--card' } }), { tokens: tokens.light }).warnings.some(item => item.code === 'low_contrast')).toBe(true));
  it('validates a list of theme colours', () => {
    const withColour = defineComponent({ name: 'with-colours', version: '1.0.0', kind: 'visual', groups: [chrome(), { 'colour.custom': { type: 'list', default: [], cost: 'style', label: 'Custom colours', description: 'Colours', agentNote: 'Change for series', item: { type: 'colour', default: { token: '--series-1' }, cost: 'style', label: 'Colour', description: 'Colour token', agentNote: 'Choose a series token' }, maxItems: 12 } }] });
    expect(validate(withColour, { component: 'with-colours', version: '1.0.0', overrides: { 'colour.custom': [{ token: '--series-1' }] } }).ok).toBe(true);
  });
});

describe('closed value validation', () => {
  const detailed = defineComponent({ name: 'detailed', version: '1.0.0', kind: 'visual', props: {
    enabled: { type: 'bool', default: true, cost: 'style', label: 'Enabled', description: 'Enabled', agentNote: 'Change for visibility' },
    title: { type: 'text', default: '', maxLength: 3, cost: 'layout', label: 'Title', description: 'Title', agentNote: 'Keep short' },
    align: { type: 'alignment', default: 'start', cost: 'layout', label: 'Align', description: 'Align', agentNote: 'Change for layout' },
    format: { type: 'format', default: { kind: 'auto' }, cost: 'style', label: 'Format', description: 'Format', agentNote: 'Change for values' },
    when: { type: 'condition', default: { path: 'enabled', equals: true }, cost: 'layout', label: 'When', description: 'Condition', agentNote: 'Change for visibility' },
    rule: { type: 'rule', default: { kind: 'polarity', good: 'up' }, cost: 'style', label: 'Rule', description: 'Rule', agentNote: 'Change for meaning' },
    rows: { type: 'list', default: [], cost: 'layout', label: 'Rows', description: 'Rows', agentNote: 'Change content', key: 'name', item: { name: { type: 'text', default: '', cost: 'layout', label: 'Name', description: 'Name', agentNote: 'Use stable names' } } },
    colour: { type: 'colour', default: { token: '--series-1' }, cost: 'style', label: 'Colour', description: 'Colour', agentNote: 'Choose series token', allowRules: true },
  }, series: { hidden: true, 'line.style': true, 'line.width': true } });
  const d = (overrides: Record<string, unknown>): SavedDocument => ({ component: 'detailed', version: '1.0.0', overrides });
  it('rejects nonboolean values', () => expect(validate(detailed, d({ enabled: 'yes' })).ok).toBe(false));
  it('rejects text beyond max length', () => expect(validate(detailed, d({ title: 'too long' })).ok).toBe(false));
  it('rejects unknown alignment', () => expect(validate(detailed, d({ align: 'left' })).ok).toBe(false));
  it('rejects extra format fields', () => expect(validate(detailed, d({ format: { kind: 'auto', decimals: 2 } })).ok).toBe(false));
  it('rejects malformed currency', () => expect(validate(detailed, d({ format: { kind: 'currency', currency: 'usd' } })).ok).toBe(false));
  it('accepts a closed date format', () => expect(validate(detailed, d({ format: { kind: 'date', pattern: 'month-year' } })).ok).toBe(true));
  it('rejects conditions with two operators', () => expect(validate(detailed, d({ when: { path: 'enabled', equals: true, empty: false } })).ok).toBe(false));
  it('rejects malformed rules', () => expect(validate(detailed, d({ rule: { kind: 'polarity', good: 'sideways' } })).ok).toBe(false));
  it('rejects duplicate list keys', () => expect(validate(detailed, d({ rows: [{ name: 'a' }, { name: 'a' }] })).ok).toBe(false));
  it('rejects bronze inside a threshold rule', () => expect(validate(detailed, d({ colour: { kind: 'threshold', steps: [{ colour: { token: '--bronze' } }] } })).ok).toBe(false));
  it('rejects bad series value types', () => expect(validate(detailed, { ...d({}), series: [{ match: { id: 'a' }, set: { hidden: 'yes' } }] }).ok).toBe(false));
  it('rejects nested non-JSON raw values', () => expect(validate(detailed, { ...d({}), raw: { chart: { margin: { left: () => 1 } } } }).ok).toBe(false));
});

describe('patches', () => {
  it('sets a declared key', () => expect(applyPatch(component, doc(), [{ op: 'set', path: 'custom.value', value: 4 }]).doc.overrides['custom.value']).toBe(4));
  it('refuses a new unknown key atomically', () => {
    const original = doc();
    const result = applyPatch(component, original, [{ op: 'set', path: 'custom.value', value: 4 }, { op: 'set', path: 'unknown', value: 2 }]);
    expect(result.ok).toBe(false);
    expect(result.doc).toBe(original);
  });
  it('resets a single key', () => expect(applyPatch(component, doc({ 'custom.value': 3 }), [{ op: 'reset', path: 'custom.value' }]).doc.overrides).toEqual({}));
  it('resets one font scalar without deleting its siblings', () => {
    const result = applyPatch(component, doc({ 'chrome.title.font.colour': { token: '--series-1' }, 'chrome.title.font.weight': 700 }), [{ op: 'reset', path: 'chrome.title.font.colour' }]);
    expect(result.doc.overrides).toEqual({ 'chrome.title.font.weight': 700 });
  });
  it('resets a group', () => expect(applyPatch(component, doc({ 'custom.value': 3, 'custom.text': 'a' }), [{ op: 'reset', path: 'custom' }]).doc.overrides).toEqual({}));
  it('resets style only', () => expect(applyPatch(component, doc({ 'custom.value': 3, 'chrome.card.background': { token: '--card' } }), [{ op: 'reset', scope: 'style' }]).doc.overrides['custom.value']).toBe(3));
  it('resets series', () => expect(applyPatch(component, { ...doc(), series: [{ match: { id: 'a' }, set: { hidden: true } }] }, [{ op: 'reset', scope: 'series' }]).doc.series).toEqual([]));
  it('resets raw', () => expect(applyPatch(component, { ...doc(), raw: { chart: { barGap: 1 } } }, [{ op: 'reset', scope: 'raw' }]).doc.raw).toEqual({}));
  it('returns layout cost', () => expect(applyPatch(component, doc(), [{ op: 'set', path: 'custom.value', value: 4 }]).cost).toBe('layout'));
  it('allows a documented raw key with a note', () => expect(applyPatch(component, doc(), [{ op: 'set', path: 'raw.chart.barGap', value: 3 }], { note: 'No schema key for this renderer spacing' }).doc.raw?.chart.barGap).toBe(3));
  it('allows a raw override without a note by default', () => expect(applyPatch(component, doc(), [{ op: 'set', path: 'raw.chart.barGap', value: 3 }]).ok).toBe(true));
  it('requires a note when the policy asks for one', () => expect(applyPatch(component, doc(), [{ op: 'set', path: 'raw.chart.barGap', value: 3 }], { policy: { rawNoteRequired: true } }).errors.some(item => item.code === 'note_required')).toBe(true));
  it('allows a raw override without a note when the policy permits it', () => {
    const result = applyPatch(component, doc(), [{ op: 'set', path: 'raw.chart.barGap', value: 3 }], { policy: { rawNoteRequired: false } });
    expect(result.ok).toBe(true);
    expect(result.doc.raw?.chart.barGap).toBe(3);
  });
  it.each([true, false])('refuses an unknown raw prop when rawNoteRequired is %s', rawNoteRequired => {
    const result = applyPatch(component, doc(), [{ op: 'set', path: 'raw.chart.fake', value: 3 }], { policy: { rawNoteRequired }, note: 'test' });
    expect(result.errors.some(item => item.code === 'unknown_raw_key')).toBe(true);
  });
  it('stores, caps, replaces and resets a raw note', () => {
    const first = applyPatch(component, doc(), [{ op: 'set', path: 'raw.chart.barGap', value: 3 }], { note: 'first' });
    expect(first.doc.rawNote).toBe('first');
    const capped = applyPatch(component, first.doc, [{ op: 'set', path: 'raw.chart.barGap', value: 4 }], { note: 'x'.repeat(300) });
    expect(capped.doc.rawNote).toHaveLength(280);
    const replaced = applyPatch(component, capped.doc, [{ op: 'set', path: 'raw.chart.barGap', value: 5 }], { note: 'later' });
    expect(replaced.doc.rawNote).toBe('later');
    const reset = applyPatch(component, replaced.doc, [{ op: 'reset', scope: 'raw' }]);
    expect(reset.doc.rawNote).toBeUndefined();
  });
  it('explains a raw path with its saved note', () => {
    const resolved = resolve(component, { raw: { chart: { barGap: 3 } }, rawNote: 'Spacing adjustment' });
    expect(explain(resolved, 'raw.chart.barGap').rawNote).toBe('Spacing adjustment');
    expect(explain(resolved, 'raw.chart.barGap').value).toBe(3);
  });
  it('exports the raw note schema', () => {
    const schema = toJSONSchema(component);
    expect((schema.properties as Record<string, unknown>).rawNote).toEqual({ type: 'string', maxLength: 280 });
  });
});

describe('contrast roles', () => {
  const contrastComponent = defineComponent({
    name: 'contrast-test', version: '1.0.0', kind: 'visual',
    props: {
      'chrome.card.background': property('colour', { token: '--card' }),
      'custom.text': property('colour', { token: '--mid' }, { contrast: 'text' }),
      'custom.mark': property('colour', { token: '--mid' }, { contrast: 'mark' }),
      'custom.decor': property('colour', { token: '--light' }, { contrast: 'decor' }),
    },
  });
  const contrastDoc: SavedDocument = { component: 'contrast-test', version: '1.0.0', overrides: {} };
  const contrastTokens = { '--card': '#FFFFFF', '--mid': '#888888', '--light': '#EEEEEE' };

  it('warns for text at 3.5 to 1 but skips a pale decoration', () => {
    const warnings = validate(contrastComponent, contrastDoc, { tokens: contrastTokens }).warnings.filter(item => item.code === 'low_contrast');
    expect(warnings.map(item => item.path)).toEqual(['custom.text']);
  });
  it('measures the visible alpha colour over the card', () => {
    const alphaComponent = defineComponent({ name: 'alpha-contrast', version: '1.0.0', kind: 'visual', props: {
      'chrome.card.background': property('colour', { token: '--card' }),
      'custom.text': property('colour', { token: '--faint' }, { contrast: 'text' }),
    } });
    const alphaDoc: SavedDocument = { component: 'alpha-contrast', version: '1.0.0', overrides: {} };
    expect(validate(alphaComponent, alphaDoc, { tokens: { '--card': '#FFFFFF', '--faint': '#0000001A' } }).warnings)
      .toContainEqual(expect.objectContaining({ path: 'custom.text', code: 'low_contrast' }));
    expect(validate(alphaComponent, alphaDoc, { tokens: { '--card': '#FFFFFF', '--faint': '#111111' } }).warnings)
      .not.toContainEqual(expect.objectContaining({ path: 'custom.text', code: 'low_contrast' }));
  });
  it('exports each colour role in JSON Schema', () => {
    const schema = toJSONSchema(contrastComponent);
    const properties = ((schema.properties as Record<string, unknown>).overrides as { properties: Record<string, Record<string, unknown>> }).properties;
    expect(properties['custom.text']['x-contrast-role']).toBe('text');
    expect(properties['custom.decor']['x-contrast-role']).toBe('decor');
    expect(properties['custom.mark']['x-contrast-role']).toBe('mark');
  });
  it('marks shared font colours as text and shared borders and grids as decor', () => {
    const shared = defineComponent({ name: 'contrast-groups', version: '1.0.0', kind: 'visual', groups: [chrome(), axis('y'), legend()] });
    expect(shared.properties['chrome.title.font.colour'].contrast).toBe('text');
    expect(shared.properties['axis.y.labels.font.colour'].contrast).toBe('text');
    expect(shared.properties['legend.font.colour'].contrast).toBe('text');
    expect(shared.properties['chrome.card.border.colour'].contrast).toBe('decor');
    expect(shared.properties['axis.y.grid.colour'].contrast).toBe('decor');
  });
});

describe('migration and exports', () => {
  it('runs a registered migration', () => {
    registerMigration('test-card', '0.9.0', '1.0.0', old => ({ ...old, overrides: { ...old.overrides, 'custom.value': 3 } }));
    expect(migrate(component, { ...doc(), version: '0.9.0' }).doc.overrides['custom.value']).toBe(3);
  });
  it('keeps shared keys during type switch', () => {
    const result = migrate(component, { component: 'other', version: '1.0.0', overrides: { 'chrome.title.text': 'Hi', 'bar.gap': 2 } });
    expect(result.doc.overrides).toEqual({ 'chrome.title.text': 'Hi' });
    expect(result.warnings).toHaveLength(1);
  });
  it('exports draft 2020-12', () => expect(toJSONSchema(component).$schema).toBe('https://json-schema.org/draft/2020-12/schema'));
  it('exports property labels', () => expect(((toJSONSchema(component).properties as Record<string, unknown>).overrides as { properties: Record<string, { title: string }> }).properties['custom.value'].title).toBe('Value'));
  it('reads both CSS schemes', () => {
    const css = ':root { --card: light-dark(#FFFFFF, #111111); }';
    expect(tokensFromCss(css, 'light')['--card']).toBe('#FFFFFF');
    expect(tokensFromCss(css, 'dark')['--card']).toBe('#111111');
  });
  it('copies bridge tokens', () => expect(tokensFromBridge(tokens).scheme).toBe('light'));
  it('keeps grid alpha from CSS and bridge tokens in both schemes', () => {
    const css = readFileSync(new URL('./__fixtures__/theme-default.css', import.meta.url), 'utf8');
    const light = tokensFromCss(css, 'light');
    const dark = tokensFromCss(css, 'dark');
    expect(light['--grid']).toBe('#1B1C1E0B');
    expect(dark['--grid']).toBe('#EBEAE60A');
    expect(light['--grid2']).toBe('#1B1C1E17');
    expect(dark['--grid2']).toBe('#EBEAE614');
    expect(light['--card']).toBe('#FDFCFA');
    const bridged = tokensFromBridge({ light: { '--grid': 'rgb(27 28 30 / 0.045)' }, dark: { '--grid': 'rgb(235 234 230 / 0.04)' }, scheme: 'dark' });
    expect(bridged.light['--grid']).toBe(light['--grid']);
    expect(bridged.dark['--grid']).toBe(dark['--grid']);
  });
  it('keeps alpha when mixing a translucent token', () => {
    const resolved = resolve(component, { tokens: { '--grid': '#1B1C1E0B', '--card': '#FFFFFF' },
      overrides: { 'custom.colour': { token: '--grid', mix: { with: '--card', percent: 50 } } } });
    expect(resolved.props['custom.colour']).toBe('#8D8E8F0B');
  });
});
