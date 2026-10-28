import type { ExplainResult, ResolvedConfig } from './types.js';

export function explain(resolved: ResolvedConfig, path: string): ExplainResult {
  const seriesSource = resolved.seriesSources[path];
  if (seriesSource) {
    const seriesPath = path.slice('series.'.length);
    const id = Object.keys(resolved.series).find(candidate => seriesPath.startsWith(`${candidate}.`));
    if (!id) throw new Error(`Unknown property: ${path}`);
    const key = seriesPath.slice(id.length + 1);
    return {
      path, value: resolved.series[id][key], winner: seriesSource.winner,
      chain: seriesSource.chain.map(step => ({ ...step })),
      cost: key === 'hidden' ? 'layout' : 'style', hidden: false,
    };
  }
  if (path === 'raw' || path.startsWith('raw.')) {
    const segments = path === 'raw' ? [] : path.slice(4).split('.');
    let value: unknown = resolved.raw;
    for (const segment of segments) {
      if (!value || typeof value !== 'object' || !(segment in value)) throw new Error(`Unknown property: ${path}`);
      value = (value as Record<string, unknown>)[segment];
    }
    return {
      path, value, winner: 'L5 raw override',
      chain: [{ layer: 'L5 raw override', value }], cost: 'style', hidden: false,
      ...(resolved.rawNote ? { rawNote: resolved.rawNote } : {}),
    };
  }
  const source = resolved.sources[path];
  const declaration = resolved.component.properties[path];
  if (!source || !declaration) throw new Error(`Unknown property: ${path}`);
  return {
    path,
    value: path === 'chrome.header' && !(path in resolved.props) ? declaration.default : resolved.props[path],
    winner: source.winner,
    chain: source.chain.map(step => ({ ...step })),
    cost: declaration.cost,
    hidden: source.hidden,
  };
}
