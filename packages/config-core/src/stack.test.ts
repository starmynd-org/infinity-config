import { describe, expect, it } from 'vitest';
import { alignedTicks, stackSeries } from './stack.js';

describe('stackSeries', () => {
  const ids = ['revenue', 'orders', 'returns'];

  it('stacks positives and negatives separately and keeps row totals', () => {
    const [result] = stackSeries([{ revenue: 12, orders: 7, returns: -4 }], ids, 'stacked');
    expect(result.positiveTotal).toBe(19);
    expect(result.negativeTotal).toBe(-4);
    expect(result.segments.revenue).toMatchObject({ raw: 12, start: 0, end: 12 });
    expect(result.segments.orders).toMatchObject({ raw: 7, start: 12, end: 19 });
    expect(result.segments.returns).toMatchObject({ raw: -4, start: 0, end: -4 });
  });

  it('uses largest remainders so rounded absolute shares total 100', () => {
    const [result] = stackSeries([{ revenue: 1, orders: 1, returns: -1 }], ids, 'percent', 1);
    expect(ids.map(id => result.segments[id].share)).toEqual([33.4, 33.3, 33.3]);
    expect(ids.reduce((sum, id) => sum + result.segments[id].share, 0).toFixed(1)).toBe('100.0');
    expect(result.segments.returns).toMatchObject({ raw: -1, value: -33.3, start: 0, end: -33.3 });
  });

  it('makes zero rows and null segments safe without changing the input', () => {
    const row = { revenue: 0, orders: null, returns: 0 };
    const [percent] = stackSeries([row], ids, 'percent');
    expect(ids.map(id => percent.segments[id].share)).toEqual([0, 0, 0]);
    expect(percent.segments.orders).toMatchObject({ raw: null, value: 0, missing: true, start: 0, end: 0 });
    expect(percent.row).toBe(row);
    const [plain] = stackSeries([row], ids, 'none');
    expect(plain.segments.orders).toMatchObject({ raw: null, value: 0, missing: true });
  });
});

describe('alignedTicks', () => {
  it('aligns revenue and percent axes with nice steps', () => {
    const { left, right } = alignedTicks([0, 950], [0, 0.37], 5);
    expect(left.ticks).toEqual([0, 250, 500, 750, 1000]);
    expect(right.ticks).toEqual([0, 0.1, 0.2, 0.3, 0.4]);
    expect(left.ticks).toHaveLength(right.ticks.length);
  });

  it('includes zero at one aligned gridline when both axes cross it', () => {
    const { left, right } = alignedTicks([-80, 120], [-0.2, 0.5], 6);
    expect(left.ticks).toHaveLength(6);
    expect(right.ticks).toHaveLength(6);
    expect(left.ticks.indexOf(0)).toBe(right.ticks.indexOf(0));
    expect(left.domain[0]).toBeLessThanOrEqual(-80);
    expect(left.domain[1]).toBeGreaterThanOrEqual(120);
    expect(right.domain[0]).toBeLessThanOrEqual(-0.2);
    expect(right.domain[1]).toBeGreaterThanOrEqual(0.5);
  });
});
