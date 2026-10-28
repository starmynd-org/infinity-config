import type { Condition, ResolveContext } from './types.js';

export function isPathCondition(value: unknown): value is Condition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if ('all' in item || 'any' in item) {
    const key = 'all' in item ? 'all' : 'any';
    return Object.keys(item).length === 1 && Array.isArray(item[key]) && item[key].length > 0 && item[key].every(isPathCondition);
  }
  if ('not' in item) return Object.keys(item).length === 1 && isPathCondition(item.not);
  if (typeof item.path !== 'string' || !item.path) return false;
  const operators = ['equals', 'in', 'gt', 'gte', 'lt', 'lte', 'empty'].filter(key => key in item);
  if (Object.keys(item).length !== 2 || operators.length !== 1) return false;
  const operator = operators[0];
  if (operator === 'in') return Array.isArray(item.in) && item.in.length > 0;
  if (['gt', 'gte', 'lt', 'lte'].includes(operator)) return typeof item[operator] === 'number' && Number.isFinite(item[operator] as number);
  if (operator === 'empty') return typeof item.empty === 'boolean';
  return true;
}

export function readDependencies(condition: Condition): string[] {
  if ('all' in condition) return [...new Set(condition.all.flatMap(readDependencies))];
  if ('any' in condition) return [...new Set(condition.any.flatMap(readDependencies))];
  if ('not' in condition) return readDependencies(condition.not);
  if ('path' in condition) return [condition.path];
  if ('field' in condition) return [`field:${condition.field}`];
  return [`row:${condition.row}`];
}

export function evaluateCondition(condition: Condition, props: Record<string, unknown>, ctx: ResolveContext = {}): boolean {
  if ('all' in condition) return condition.all.every(item => evaluateCondition(item, props, ctx));
  if ('any' in condition) return condition.any.some(item => evaluateCondition(item, props, ctx));
  if ('not' in condition) return !evaluateCondition(condition.not, props, ctx);
  const value = 'path' in condition ? (condition.path in props ? props[condition.path] : ctx.facts?.[condition.path])
    : 'field' in condition ? ctx.fields?.[condition.field] : ctx.row?.[condition.row];
  if ('equals' in condition) return JSON.stringify(value) === JSON.stringify(condition.equals);
  if ('in' in condition) return !!condition.in?.some(item => JSON.stringify(item) === JSON.stringify(value));
  if ('gt' in condition) return typeof value === 'number' && value > (condition.gt as number);
  if ('gte' in condition) return typeof value === 'number' && value >= (condition.gte as number);
  if ('lt' in condition) return typeof value === 'number' && value < (condition.lt as number);
  if ('lte' in condition) return typeof value === 'number' && value <= (condition.lte as number);
  if ('empty' in condition) {
    const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
    return empty === condition.empty;
  }
  return false;
}
