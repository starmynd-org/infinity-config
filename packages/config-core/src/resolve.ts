import { evaluateCondition } from './condition.js';
import type { ColourValue, DefinedComponent, Diagnostic, LayerInput, PropertySource, ResolveContext, ResolvedConfig, Scheme, SeriesInfo, SeriesRule, TokenMap, TokenSets } from './types.js';

const copy = <T>(value: T): T => value === undefined ? value : structuredClone(value);
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isToken = (value: unknown): value is ColourValue => isObject(value) && typeof value.token === 'string';

function tokenMap(layers: LayerInput, scheme: Scheme): TokenMap {
  const tokens = layers.tokens;
  if (!tokens) return {};
  if ('light' in tokens && 'dark' in tokens) return (tokens as TokenSets)[scheme];
  return tokens as TokenMap;
}

function hexMix(a: string, b: string, percent: number): string {
  const aa = /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(a) ? a : '#000000';
  const bb = /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(b) ? b : '#000000';
  const weight = Math.max(0, Math.min(100, percent)) / 100;
  return `#${[1, 3, 5].map(index => {
    const first = parseInt(aa.slice(index, index + 2), 16);
    const second = parseInt(bb.slice(index, index + 2), 16);
    return Math.round(first * (1 - weight) + second * weight).toString(16).padStart(2, '0');
  }).join('')}${aa.length === 9 ? aa.slice(7) : ''}`.toUpperCase();
}

export function resolveValue(value: unknown, tokens: TokenMap, path: string, warnings: Diagnostic[]): unknown {
  if (path === 'layout.gap' && typeof value === 'string' && /^s-[0-8]$/.test(value)) {
    const name = `--${value}`;
    return tokens[name] ?? `var(${name})`;
  }
  if (isToken(value)) {
    const primary = tokens[value.token];
    if (!primary) {
      warnings.push({ path, code: 'unknown_token', message: `Token ${value.token} is unavailable`, fix: 'Choose a token present in the active theme' });
      return copy(value);
    }
    if (value.mix) {
      const other = tokens[value.mix.with];
      if (!other) {
        warnings.push({ path, code: 'unknown_token', message: `Token ${value.mix.with} is unavailable`, fix: 'Choose a token present in the active theme' });
        return primary;
      }
      return hexMix(primary, other, value.mix.percent);
    }
    if ('scale' in value && typeof value.scale === 'number') {
      const numeric = parseFloat(primary);
      return Number.isFinite(numeric) ? `${numeric * value.scale}${primary.replace(/^[\d.]+/, '')}` : primary;
    }
    return primary;
  }
  if (typeof value === 'string' && value.startsWith('--') && tokens[value]) return tokens[value];
  return copy(value);
}

function computedDefault(value: unknown, component: DefinedComponent, ctx: ResolveContext): unknown {
  if (!isObject(value) || typeof value.computed !== 'string') return value;
  if (value.computed === 'seriesCountMoreThanOne') return (ctx.series?.length ?? 0) > 1;
  if (value.computed === 'hasComparisonSeries') return !!ctx.series?.some(item => item.role === 'comparison');
  const fn = component.computed?.[value.computed];
  if (!fn) throw new Error(`Unknown computed default: ${value.computed}`);
  return fn(ctx);
}

function reportDefault(defaults: Record<string, unknown> | undefined, name: string, path: string): unknown {
  if (!defaults) return undefined;
  const byName = defaults[name];
  if (isObject(byName) && path in byName) return byName[path];
  return defaults[path];
}

function matches(rule: SeriesRule, info: SeriesInfo, index: number): boolean {
  const match = rule.match;
  if (match.id !== undefined && match.id !== info.id) return false;
  if (match.role !== undefined && match.role !== info.role) return false;
  if (match.index !== undefined && match.index !== index) return false;
  if (match.label !== undefined) {
    try { if (!new RegExp(match.label).test(info.label ?? '')) return false; }
    catch { return false; }
  }
  return Object.keys(match).length > 0;
}

export function stableSlot(id: string, length: number): number {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash % length;
}

export function resolve(component: DefinedComponent, layers: LayerInput = {}, ctx: ResolveContext = {}): ResolvedConfig {
  const scheme = ctx.scheme ?? ('scheme' in (layers.tokens ?? {}) ? (layers.tokens as TokenSets).scheme : 'light');
  const tokens = tokenMap(layers, scheme);
  const props: Record<string, unknown> = {};
  const sources: Record<string, PropertySource> = {};
  const warnings: Diagnostic[] = [];
  for (const [path, property] of Object.entries(component.properties)) {
    const builtIn = computedDefault(property.default, component, ctx);
    const chain: PropertySource['chain'] = [{ layer: 'L0 built in', value: copy(builtIn) }];
    let winner = 'L0 built in';
    let value = builtIn;
    const report = reportDefault(layers.defaults, component.name, path);
    if (report !== undefined) {
      value = report;
      winner = 'L2 report or interface';
      chain.push({ layer: winner, value: copy(value) });
    }
    const visual = layers.overrides?.[path];
    if (visual !== undefined) {
      value = visual;
      winner = 'L3 visual';
      chain.push({ layer: winner, value: copy(value) });
    }
    let token: string | undefined;
    if (property.type !== 'json') {
      if (isToken(value)) token = value.token;
      else if (typeof value === 'string' && value.startsWith('--')) token = value;
      else if (path === 'layout.gap' && typeof value === 'string' && /^s-[0-8]$/.test(value)) token = `--${value}`;
    }
    const resolved = property.type === 'json' ? copy(value) : resolveValue(value, tokens, path, warnings);
    if (token && tokens[token]) {
      chain.push({ layer: 'L1 workspace theme', token, value: copy(resolved), scheme });
      if (winner === 'L0 built in') winner = 'L1 workspace theme';
    }
    // Keep existing visual props stable while the new card header default remains implicit.
    if (path !== 'chrome.header' || winner !== 'L0 built in') props[path] = resolved;
    sources[path] = { winner, chain, token, hidden: !!property.hidden };
  }
  const facts: Record<string, unknown> = {
    'series.count': ctx.series?.length ?? 0,
    ...ctx.facts,
  };
  for (const [path, property] of Object.entries(component.properties)) {
    if (property.hidden || (property.visibleWhen && !evaluateCondition(property.visibleWhen, props, { ...ctx, facts }))) {
      delete props[path];
      sources[path].hidden = true;
    }
  }
  if ('colour.palette' in props) {
    const palette = props['colour.palette'];
    const custom = Array.isArray(props['colour.custom']) ? props['colour.custom'] : [];
    const entries = palette === 'custom' && custom.length ? custom
      : palette === 'sequential' ? Array.from({ length: 6 }, (_, index) => ({ token: `--seq-${index + 2}` }))
        : Array.from({ length: 4 }, (_, index) => ({ token: `--series-${index + 1}` }));
    props['colour.paletteValues'] = entries.map((entry, index) => {
      const value = resolveValue(entry, tokens, `colour.paletteValues.${index}`, warnings);
      return typeof value === 'string' ? value : '';
    });
    const dash = resolveValue({ token: '--series-dash' }, tokens, 'colour.dash', warnings);
    props['colour.dash'] = typeof dash === 'string' ? dash : '';
  }
  const series: ResolvedConfig['series'] = {};
  const seriesSources: ResolvedConfig['seriesSources'] = {};
  const allSeries = ctx.series ?? [];
  const primaryCount = allSeries.filter(info => info.role !== 'comparison').length;
  const usedSlots = new Set<number>();
  let valueIndex = 0;
  for (const [index, info] of allSeries.entries()) {
    const perSeries: Record<string, unknown> = {};
    if (component.properties['axis.y.show']) {
      perSeries.axis = 'y';
      seriesSources[`series.${info.id}.axis`] = {
        winner: 'L0 default', hidden: false, chain: [{ layer: 'L0 default', value: 'y' }],
      };
    }
    const position = info.role === 'comparison' ? valueIndex : valueIndex++;
    if (component.series?.colour && 'colour.palette' in props) {
      const palette = String(props['colour.palette']);
      const stable = props['colour.stableKeys'] !== false;
      const custom = Array.isArray(props['colour.custom']) ? props['colour.custom'] : [];
      let colour: unknown;
      let token: string | undefined;
      if (info.role === 'comparison') {
        colour = props['colour.comparison'];
        token = sources['colour.comparison']?.token;
        perSeries.dashed = true;
      } else if (primaryCount === 1) {
        colour = props['colour.primary'];
        token = sources['colour.primary']?.token;
      } else if (palette === 'custom' && custom.length) {
        const entry = custom[position % custom.length];
        colour = resolveValue(entry, tokens, `series.${info.id}.colour`, warnings);
        if (isToken(entry)) token = entry.token;
      } else {
        let slot = position;
        if (stable && palette === 'series') {
          slot = stableSlot(info.id, 4);
          if (position < 4) {
            while (usedSlots.has(slot)) slot = (slot + 1) % 4;
            usedSlots.add(slot);
          }
        }
        const name = palette === 'sequential'
          ? `--seq-${2 + Math.round(position * 5 / Math.max(1, primaryCount - 1))}`
          : `--series-${slot < 4 ? slot + 1 : (slot - 4) % 3 + 1}`;
        colour = resolveValue({ token: name }, tokens, `series.${info.id}.colour`, warnings);
        token = name;
        if (palette === 'series' && position >= 4) perSeries.dashed = true;
      }
      perSeries.colour = colour;
      seriesSources[`series.${info.id}.colour`] = {
        winner: 'palette', hidden: false, token,
        chain: [{ layer: 'palette', value: copy(colour), ...(token ? { token, scheme } : {}) }],
      };
      if (perSeries.dashed) seriesSources[`series.${info.id}.dashed`] = {
        winner: 'palette', hidden: false, chain: [{ layer: 'palette', value: true }],
      };
      if (perSeries.dashed) {
        perSeries.dash = resolveValue({ token: '--series-dash' }, tokens, `series.${info.id}.dash`, warnings);
        seriesSources[`series.${info.id}.dash`] = {
          winner: 'palette', hidden: false, token: '--series-dash',
          chain: [{ layer: 'palette', value: copy(perSeries.dash), token: '--series-dash', scheme }],
        };
      }
    }
    for (const rule of layers.series ?? []) {
      if (!matches(rule, info, index)) continue;
      for (const [key, value] of Object.entries(rule.set)) {
        if ((key === 'axis' && value === 'y2' && !component.properties['axis.y2.show']) ||
          (key === 'type' && !component.seriesTypes?.includes(value as 'bar' | 'line' | 'area'))) {
          warnings.push({ path: `series.${info.id}.${key}`, code: 'not_allowed', message: `${key} is not allowed for ${component.name}` });
          continue;
        }
        if (!component.series?.[key] && key !== 'type') {
          warnings.push({ path: `series.${info.id}.${key}`, code: 'unsupported_series_key', message: `${key} is not enabled for ${component.name}` });
          continue;
        }
        const path = `series.${info.id}.${key}`;
        const resolved = resolveValue(value, tokens, path, warnings);
        perSeries[key] = resolved;
        const previous = seriesSources[path];
        seriesSources[path] = {
          winner: 'L4 per-series rule', hidden: false,
          chain: [...(previous?.chain ?? []), { layer: 'L4 per-series rule', value: copy(resolved),
            ...(isToken(value) ? { token: value.token, scheme } : {}) }],
          ...(isToken(value) ? { token: value.token } : {}),
        };
      }
    }
    series[info.id] = perSeries;
  }
  const raw = copy(layers.raw ?? {});
  props.raw = raw;
  sources.raw = { winner: 'L5 raw override', chain: [{ layer: 'L5 raw override', value: copy(raw) }], hidden: false };
  return { props, sources, warnings, series, seriesSources, raw, rawNote: layers.rawNote, component };
}
