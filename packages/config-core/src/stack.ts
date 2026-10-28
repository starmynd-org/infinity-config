export type StackMode = 'none' | 'stacked' | 'percent';

export interface StackSegment {
  id: string;
  raw: number | null;
  value: number;
  start: number;
  end: number;
  share: number;
  missing: boolean;
}

export interface StackRow {
  row: Readonly<Record<string, unknown>>;
  segments: Record<string, StackSegment>;
  positiveTotal: number;
  negativeTotal: number;
}

function roundedShares(values: readonly number[], decimals: number): number[] {
  const units = 100 * 10 ** decimals;
  const total = values.reduce((sum, value) => sum + Math.abs(value), 0);
  if (total === 0) return values.map(() => 0);
  const exact = values.map(value => Math.abs(value) / total * units);
  const whole = exact.map(Math.floor);
  const remainder = units - whole.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, fraction: value - whole[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; i < remainder; i++) whole[order[i % order.length].index]++;
  return whole.map(value => value / 10 ** decimals);
}

export function stackSeries(rows: readonly Record<string, unknown>[], ids: readonly string[], mode: StackMode,
  decimals = 1): StackRow[] {
  if (!['none', 'stacked', 'percent'].includes(mode)) throw new Error('Unknown stack mode');
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6) throw new Error('Stack decimals must be from 0 to 6');
  if (new Set(ids).size !== ids.length) throw new Error('Stack series ids must be distinct');
  return rows.map(row => {
    const raw = ids.map(id => {
      const value = row[id];
      if (value === null || value === undefined) return null;
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid stack value for ${id}`);
      return value;
    });
    const numeric = raw.map(value => value ?? 0);
    const shares = mode === 'percent' ? roundedShares(numeric, decimals) : numeric.map(() => 0);
    const positiveTotal = numeric.filter(value => value > 0).reduce((sum, value) => sum + value, 0);
    const negativeTotal = numeric.filter(value => value < 0).reduce((sum, value) => sum + value, 0);
    let positive = 0;
    let negative = 0;
    const segments = Object.fromEntries(ids.map((id, index) => {
      const signedShare = numeric[index] < 0 ? -shares[index] : shares[index];
      const value = mode === 'percent' ? signedShare : numeric[index];
      const start = mode === 'none' ? 0 : value < 0 ? negative : positive;
      const end = start + value;
      if (mode !== 'none') {
        if (value < 0) negative = end;
        else positive = end;
      }
      return [id, { id, raw: raw[index], value, start, end, share: shares[index], missing: raw[index] === null }];
    })) as Record<string, StackSegment>;
    return { row, segments, positiveTotal, negativeTotal };
  });
}

export interface TickSet { domain: [number, number]; ticks: number[] }
export interface AlignedTickSets { left: TickSet; right: TickSet }

function candidateSteps(domain: readonly [number, number], intervals: number): number[] {
  const span = domain[1] - domain[0];
  const size = span > 0 ? span : Math.max(Math.abs(domain[0]), 1);
  const exponent = Math.floor(Math.log10(size / intervals));
  const steps: number[] = [];
  for (let power = exponent - 2; power <= exponent + 8; power++) {
    for (const factor of [1, 2, 2.5, 5]) steps.push(factor * 10 ** power);
  }
  return steps.sort((a, b) => a - b);
}

function bounds(domain: readonly [number, number], step: number): { low: number; high: number } {
  return { low: Math.floor(domain[0] / step + 1e-10), high: Math.ceil(domain[1] / step - 1e-10) };
}

function tickSet(step: number, start: number, intervals: number): TickSet {
  const ticks = Array.from({ length: intervals + 1 }, (_, index) => Number(((start + index) * step).toPrecision(12)));
  return { domain: [ticks[0], ticks[ticks.length - 1]], ticks };
}

export function alignedTicks(leftDomain: readonly [number, number], rightDomain: readonly [number, number],
  count = 5): AlignedTickSets {
  if (!Number.isInteger(count) || count < 2 || count > 20) throw new Error('Tick count must be from 2 to 20');
  for (const domain of [leftDomain, rightDomain]) {
    if (domain.length !== 2 || !domain.every(Number.isFinite) || domain[0] > domain[1])
      throw new Error('Tick domains must be finite ascending pairs');
  }
  const intervals = count - 1;
  const candidates = [candidateSteps(leftDomain, intervals), candidateSteps(rightDomain, intervals)];
  const bothIncludeZero = [leftDomain, rightDomain].every(domain => domain[0] <= 0 && domain[1] >= 0);
  for (let sum = 0; sum < candidates[0].length + candidates[1].length; sum++) {
    for (let leftIndex = 0; leftIndex <= sum; leftIndex++) {
      const rightIndex = sum - leftIndex;
      if (leftIndex >= candidates[0].length || rightIndex >= candidates[1].length) continue;
      const leftStep = candidates[0][leftIndex], rightStep = candidates[1][rightIndex];
      const left = bounds(leftDomain, leftStep), right = bounds(rightDomain, rightStep);
      if (left.high - left.low > intervals || right.high - right.low > intervals) continue;
      if (bothIncludeZero) {
        const zeroIndex = Math.max(-left.low, -right.low);
        if (zeroIndex + Math.max(left.high, right.high) > intervals) continue;
        return { left: tickSet(leftStep, -zeroIndex, intervals), right: tickSet(rightStep, -zeroIndex, intervals) };
      }
      return { left: tickSet(leftStep, left.low, intervals), right: tickSet(rightStep, right.low, intervals) };
    }
  }
  throw new Error('Unable to align tick domains');
}
