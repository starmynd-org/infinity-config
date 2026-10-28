import { describe, expect, it } from 'vitest';
import { colour, defineComponent, matchRow, paletteFor, resolve, type MatchRule } from './index.js';

describe('row rules', () => {
  const rule: MatchRule = { kind: 'match', cases: [
    { when: { row: 'status', equals: 'late' }, tone: 'danger', badge: 'Late' },
    { when: { row: 'status', equals: 'late' }, tone: 'warning', badge: 'Delayed' },
    { when: { row: 'status', equals: 'done' }, tone: 'success', badge: 'Done' },
  ] };
  it('returns the first matching case and leaves unmatched rows alone', () => {
    expect(matchRow(rule, { status: 'late' })).toEqual({ tone: 'danger', badge: 'Late' });
    expect(matchRow(rule, { status: 'done' })).toEqual({ tone: 'success', badge: 'Done' });
    expect(matchRow(rule, { status: 'open' })).toBeUndefined();
  });
  it('refuses field and path leaves, including a later case', () => {
    expect(() => matchRow({ kind: 'match', cases: [
      { when: { row: 'status', equals: 'late' }, tone: 'danger', badge: 'Late' },
      { when: { field: 'status', equals: 'late' }, tone: 'warning', badge: 'Delayed' },
    ] }, { status: 'late' })).toThrow('row fields only');
    expect(() => matchRow({ kind: 'match', cases: [
      { when: { any: [{ row: 'status', equals: 'late' }, { path: 'chrome.title.show', equals: true }] },
        tone: 'danger', badge: 'Late' },
    ] }, { status: 'late' })).toThrow('row fields only');
  });
});

describe('row identity palette', () => {
  const tokens = { '--series-1': '#111111', '--series-2': '#222222', '--series-3': '#333333',
    '--series-4': '#444444', '--series-dash': '5 3', '--seq-2': '#555555', '--seq-3': '#666666',
    '--seq-4': '#777777', '--seq-5': '#888888', '--seq-6': '#999999', '--seq-7': '#AAAAAA' };
  const component = defineComponent({ name: 'row-palette-test', version: '1.0.0', kind: 'visual', groups: [colour()] });
  const propsFor = (overrides: Record<string, unknown> = {}) => resolve(component, { tokens, overrides }).props;
  const props = propsFor();
  it('assigns four distinct colours and dashes the reused fifth colour', () => {
    expect(props['colour.paletteValues']).toEqual(['#111111', '#222222', '#333333', '#444444']);
    expect(props['colour.dash']).toBe('5 3');
    expect('tokens' in props).toBe(false);
    const domain = ['Ada', 'Ben', 'Cleo', 'Dee', 'Eli'];
    const choices = domain.map(key => paletteFor(props, key, domain));
    expect(choices.slice(0, 4).map(item => item.colour)).toEqual(['#111111', '#222222', '#333333', '#444444']);
    expect(choices[4]).toEqual({ colour: '#111111', dashed: true, dash: '5 3' });
    expect(paletteFor(props, 'Cleo', domain)).toEqual(choices[2]);
  });
  it('probes stable hash collisions and keeps a key in its slot across domains', () => {
    const stable = propsFor({ 'colour.stableKeys': true });
    const domain = ['a', 'e', 'i', 'm'];
    expect(domain.map(key => paletteFor(stable, key, domain).colour)).toEqual(['#111111', '#222222', '#333333', '#444444']);
    expect(paletteFor(stable, 'a', ['a', 'b']).colour).toBe(paletteFor(stable, 'a', ['a', 'e']).colour);
  });
  it('supports sequential and custom palettes with resolved token colours', () => {
    const domain = ['a', 'b', 'c'];
    expect(domain.map(key => paletteFor(propsFor({ 'colour.palette': 'sequential' }), key, domain).colour))
      .toEqual(['#555555', '#888888', '#AAAAAA']);
    expect(paletteFor(propsFor({ 'colour.palette': 'custom', 'colour.custom': [{ token: '--series-2' }] }), 'a', domain))
      .toEqual({ colour: '#222222', dashed: false });
  });
  it('re-resolves palette values when the scheme changes', () => {
    const dark = Object.fromEntries(Object.entries(tokens).map(([name, value]) => [name,
      name === '--series-dash' ? value : '#EEEEEE']));
    const sets = { light: tokens, dark, scheme: 'light' as const };
    const light = resolve(component, { tokens: sets }, { scheme: 'light' });
    const changed = resolve(component, { tokens: sets }, { scheme: 'dark' });
    expect(light.props['colour.paletteValues']).toEqual(['#111111', '#222222', '#333333', '#444444']);
    expect(changed.props['colour.paletteValues']).toEqual(['#EEEEEE', '#EEEEEE', '#EEEEEE', '#EEEEEE']);
  });
});
