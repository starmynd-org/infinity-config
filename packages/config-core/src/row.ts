import { evaluateCondition } from './condition.js';
import { stableSlot } from './resolve.js';
import type { Condition, ValueRule } from './types.js';

export type MatchRule = Extract<ValueRule, { kind: 'match' }>;
export interface PaletteChoice { colour: string; dashed: boolean; dash?: string }

function rowsOnly(condition: Condition): boolean {
  if ('all' in condition) return condition.all.every(rowsOnly);
  if ('any' in condition) return condition.any.every(rowsOnly);
  if ('not' in condition) return rowsOnly(condition.not);
  return 'row' in condition;
}

export function matchRow(rule: MatchRule, row: Record<string, unknown>): { tone: MatchRule['cases'][number]['tone']; badge: string } | undefined {
  for (const item of rule.cases) if (!rowsOnly(item.when)) throw new Error('Row rules may read row fields only');
  const found = rule.cases.find(item => evaluateCondition(item.when, {}, { row }));
  return found ? { tone: found.tone, badge: found.badge } : undefined;
}

export function paletteFor(props: Record<string, unknown>, key: string, domain: readonly string[]): PaletteChoice {
  const values = props['colour.paletteValues'];
  if (!Array.isArray(values) || !values.length) throw new Error('paletteFor needs resolved colour.paletteValues');
  const keys = [...new Set([...domain, key])];
  const position = keys.indexOf(key);
  const palette = props['colour.palette'] === 'sequential' || props['colour.palette'] === 'custom'
    ? props['colour.palette'] : 'series';
  let value: unknown;
  let dashed = false;
  if (palette === 'custom' && values.length > 0) {
    value = values[position % values.length];
  } else if (palette === 'sequential') {
    value = values[Math.round(position * (values.length - 1) / Math.max(1, keys.length - 1))];
  } else if (keys.length === 1 && typeof props['colour.primary'] === 'string') {
    value = props['colour.primary'];
  } else {
    let slot = position;
    if (props['colour.stableKeys'] === true) {
      slot = stableSlot(key, 4);
      if (position < 4) {
        const used = new Set<number>();
        for (const prior of keys.slice(0, position)) {
          let priorSlot = stableSlot(prior, 4);
          while (used.has(priorSlot)) priorSlot = (priorSlot + 1) % 4;
          used.add(priorSlot);
        }
        while (used.has(slot)) slot = (slot + 1) % 4;
      }
    }
    value = values[slot < 4 ? slot : (slot - 4) % 3];
    dashed = position >= 4;
  }
  if (typeof value !== 'string' || !value) throw new Error(`No resolved palette colour for ${key}`);
  const dash = props['colour.dash'];
  return { colour: value, dashed, ...(dashed && typeof dash === 'string' && dash ? { dash } : {}) };
}
