import { useMemo } from 'react';
import { resolve, type DefinedComponent, type LayerInput, type ResolveContext, type ResolvedConfig } from '@infinity/config-core';

export interface SplitResolvedConfig extends ResolvedConfig {
  style: Record<string, unknown>;
  layout: Record<string, unknown>;
}

export function useResolvedConfig(component: DefinedComponent, doc: LayerInput, tokens: LayerInput['tokens'], ctx: ResolveContext = {}): SplitResolvedConfig {
  const resolved = useMemo(() => resolve(component, { ...doc, tokens }, ctx), [component, doc, tokens, ctx]);
  const styleKey = JSON.stringify(Object.entries(resolved.props).filter(([path]) => component.properties[path]?.cost === 'style'));
  const layoutKey = JSON.stringify(Object.entries(resolved.props).filter(([path]) => component.properties[path]?.cost === 'layout'));
  const style = useMemo(() => Object.fromEntries(Object.entries(resolved.props).filter(([path]) => component.properties[path]?.cost === 'style')), [styleKey, component]);
  const layout = useMemo(() => Object.fromEntries(Object.entries(resolved.props).filter(([path]) => component.properties[path]?.cost === 'layout')), [layoutKey, component]);
  return { ...resolved, style, layout };
}
