import type { Scheme, TokenMap, TokenSets } from './types.js';

function rgbToHex(input: string): string {
  if (input.startsWith('#')) return input.toUpperCase();
  const rgb = /^rgba?\(\s*([^)]*)\)$/.exec(input);
  if (!rgb) return input;
  const channels = rgb[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  if ((channels.length !== 3 && channels.length !== 4) ||
    channels.slice(0, 3).some(value => !Number.isInteger(value) || value < 0 || value > 255) ||
    (channels.length === 4 && (!Number.isFinite(channels[3]) || channels[3] < 0 || channels[3] > 1))) return input;
  const bytes = channels.slice(0, 3);
  if (channels.length === 4) bytes.push(Math.round(channels[3] * 255));
  return `#${bytes.map(value => value.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function tokensFromCss(cssText: string, scheme: Scheme): TokenMap {
  const css = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const result: TokenMap = {};
  const tokenPattern = /(--[\w-]+)\s*:\s*(light-dark\((?:[^()]|\([^()]*\))*\)|[^;{}]+)\s*;/g;
  for (const match of css.matchAll(tokenPattern)) {
    let value = match[2].trim();
    if (value.startsWith('light-dark(')) {
      const inner = value.slice(11, -1);
      const comma = inner.indexOf(',');
      value = (scheme === 'light' ? inner.slice(0, comma) : inner.slice(comma + 1)).trim();
    }
    result[match[1]] = rgbToHex(value);
  }
  for (const [key, value] of Object.entries(result)) {
    const alias = /^var\((--[\w-]+)\)$/.exec(value);
    if (alias && result[alias[1]]) result[key] = result[alias[1]];
  }
  return result;
}

export function tokensFromBridge(tokens: { light: TokenMap; dark: TokenMap; scheme: Scheme }): TokenSets {
  return {
    light: Object.fromEntries(Object.entries(tokens.light).map(([key, value]) => [key, rgbToHex(value)])),
    dark: Object.fromEntries(Object.entries(tokens.dark).map(([key, value]) => [key, rgbToHex(value)])),
    scheme: tokens.scheme,
  };
}
