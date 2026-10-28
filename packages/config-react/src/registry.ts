import type { ComponentType, ReactNode } from 'react';
import type { DefinedComponent } from '@infinity/config-core';

export interface VisualRendererProps { props: Record<string, unknown>; series: Record<string, Record<string, unknown>>; data: unknown; children?: ReactNode; headingLevel?: 2 | 3 | 4 | 5 | 6; act?: (action: unknown) => Promise<unknown>; emit?: (event: string, detail: unknown) => void }
export interface VisualRegistration { component: DefinedComponent; renderer: ComponentType<VisualRendererProps> }
const registry = new Map<string, VisualRegistration>();

export function registerVisual(component: DefinedComponent, renderer: ComponentType<VisualRendererProps>): void {
  if (registry.has(component.name)) throw new Error(`Duplicate visual component: ${component.name}`);
  registry.set(component.name, { component, renderer });
}

export function getVisual(name: string): VisualRegistration | undefined { return registry.get(name); }
export function clearVisualRegistry(): void { registry.clear(); }
