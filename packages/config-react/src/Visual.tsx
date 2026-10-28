import { Component, type ErrorInfo, type ReactNode } from 'react';
import { resolve, validate, type DefinedComponent, type SavedDocument, type TokenMap, type TokenSets, type ResolveContext, type Diagnostic, type SeriesInfo } from '@infinity/config-core';
import { ChromeFrame } from './ChromeFrame.js';
import { getVisual } from './registry.js';

class RenderBoundary extends Component<{ name: string; children: ReactNode; tokens: TokenMap; frameProps: Record<string, unknown>; headingLevel?: 2 | 3 | 4 | 5 | 6 }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) {}
  render() {
    if (this.state.error) return <ChromeFrame props={this.props.frameProps} tokens={this.props.tokens} headingLevel={this.props.headingLevel} error={{ message: this.state.error.message, path: 'render', component: this.props.name }} />;
    return this.props.children;
  }
}

export interface VisualProps {
  component: string | DefinedComponent;
  config: SavedDocument;
  data: unknown;
  children?: ReactNode;
  tokens: TokenMap | TokenSets;
  ctx?: ResolveContext;
  variant?: string;
  defaults?: Record<string, unknown>;
  act?: (action: unknown) => Promise<unknown>;
  emit?: (event: string, detail: unknown) => void;
  preserveEmpty?: boolean;
  headingLevel?: 2 | 3 | 4 | 5 | 6;
}

function seriesFromData(data: unknown, declaration?: DefinedComponent['data']): SeriesInfo[] | undefined {
  if (declaration?.shape === 'categorical' && declaration.seriesFrom === 'category') {
    if (!data || typeof data !== 'object' || !('rows' in data) || !('roles' in data)) return undefined;
    const { rows, roles } = data as { rows?: unknown; roles?: unknown };
    const category = roles && typeof roles === 'object' ? (roles as { category?: unknown }).category : undefined;
    if (!Array.isArray(rows) || typeof category !== 'string') return undefined;
    const members = new Set<string>();
    for (const row of rows) {
      if (!row || typeof row !== 'object' || !(category in row)) continue;
      const value = (row as Record<string, unknown>)[category];
      if (value !== null && value !== undefined) members.add(String(value));
    }
    return [...members].map(id => ({ id, label: id }));
  }
  if (!data || typeof data !== 'object' || !('columns' in data)) return undefined;
  const { roles, columns } = data as { roles?: unknown; columns?: unknown };
  if (!Array.isArray(columns)) return undefined;
  const roleMap = roles && typeof roles === 'object'
    ? roles as { values?: unknown; value?: unknown; comparison?: unknown; target?: unknown } : undefined;
  const values = roleMap?.values;
  const hasRoles = Array.isArray(values) || typeof roleMap?.value === 'string';
  if (!hasRoles && declaration?.shape !== 'table') return undefined;
  const labels = new Map<string, string>();
  for (const column of columns) {
    if (!column || typeof column !== 'object') continue;
    const { key, label } = column as { key?: unknown; label?: unknown };
    if (typeof key === 'string') labels.set(key, typeof label === 'string' ? label : key);
  }
  const found: SeriesInfo[] = [];
  const seen = new Set<string>();
  const add = (id: unknown, role?: string) => {
    if (typeof id !== 'string' || !id || seen.has(id)) return;
    seen.add(id);
    found.push({ id, label: labels.get(id) ?? id, ...(role ? { role } : {}) });
  };
  if (Array.isArray(values)) {
    for (const id of values) {
      add(id);
      if (roleMap?.comparison && typeof roleMap.comparison === 'object') add((roleMap.comparison as Record<string, unknown>)[String(id)], 'comparison');
    }
  } else if (hasRoles) {
    add(roleMap?.value);
    add(roleMap?.comparison, 'comparison');
    add(roleMap?.target, 'target');
  } else {
    for (const column of columns) if (column && typeof column === 'object') add((column as { key?: unknown }).key);
  }
  return found;
}

export function Visual({ component, config, data, children, tokens, ctx = {}, variant = 'default', defaults, act, emit, preserveEmpty = false, headingLevel = 2 }: VisualProps) {
  const name = typeof component === 'string' ? component : component.name;
  const registration = getVisual(name);
  const definition = typeof component === 'string' ? registration?.component : component;
  const Renderer = registration?.renderer;
  const tokenMap = 'light' in tokens && 'dark' in tokens ? (tokens as TokenSets)[ctx.scheme ?? (tokens as TokenSets).scheme] : tokens as TokenMap;
  let props: Record<string, unknown> = {};
  let series: Record<string, Record<string, unknown>> = {};
  let error: { message: string; path: string; component: string } | undefined;
  let errors: Diagnostic[] = [];
  if (!definition || !Renderer) error = { message: 'Component is not registered', path: 'component', component: name };
  else {
    const validation = validate(definition, config, { tokens: tokenMap });
    if (!validation.ok) {
      errors = validation.errors;
      const first = validation.errors[0];
      error = { message: first.message, path: first.path, component: name };
    } else {
      try {
        const resolved = resolve(definition, { tokens, defaults, overrides: config.overrides, series: config.series, raw: config.raw, rawNote: config.rawNote },
          { ...ctx, series: seriesFromData(data, definition.data) ?? ctx.series });
        props = resolved.props;
        series = resolved.series;
      }
      catch (cause) { error = { message: cause instanceof Error ? cause.message : String(cause), path: 'config', component: name }; }
    }
  }
  const empty = !preserveEmpty && (Array.isArray(data) ? data.length === 0 : !!data && typeof data === 'object' && 'rows' in data && Array.isArray(data.rows) && data.rows.length === 0);
  return <div data-component={name} data-variant={variant} data-ready="true" data-raw-override={Object.keys(config.raw ?? {}).length > 0 ? 'true' : undefined}>
    {Object.keys(config.raw ?? {}).length > 0 && <span role="status">Raw renderer overrides active{config.rawNote ? `: ${config.rawNote}` : ''}</span>}
    <RenderBoundary name={name} tokens={tokenMap} frameProps={props} headingLevel={headingLevel}><ChromeFrame props={props} componentName={name} tokens={tokenMap} headingLevel={headingLevel} error={error} errors={errors} empty={empty}>{!error && Renderer && <Renderer props={props} series={series} data={data} headingLevel={headingLevel} act={act} emit={emit}>{children}</Renderer>}</ChromeFrame></RenderBoundary>
  </div>;
}
