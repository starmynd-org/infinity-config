import type { Cost, PropertyDeclaration, PropertyMap, PropertyType } from '../types.js';

const token = (name: string) => ({ token: name });
const font = (family: string, size: string, weight = 400, colour = '--ink') => ({ family, size, weight, italic: false, colour: token(colour) });
const box = (name: string) => ({ top: token(name), right: token(name), bottom: token(name), left: token(name) });

function prop(type: PropertyType, defaultValue: unknown, label: string, cost: Cost = 'style', extra: Partial<PropertyDeclaration> = {}): PropertyDeclaration {
  return {
    type, default: defaultValue, cost, label,
    description: `Controls ${label.toLowerCase()}.`,
    agentNote: `Change ${label.toLowerCase()} only when it improves the component's readability or meaning.`,
    ...extra,
  };
}
function enums(values: string[], defaultValue: string, label: string, cost: Cost = 'layout'): PropertyDeclaration {
  return prop('enum', defaultValue, label, cost, { values });
}

export function chrome(): PropertyMap {
  return {
    'chrome.header': enums(['card', 'none'], 'card', 'Header frame'),
    'chrome.title.show': prop('bool', true, 'Show title', 'layout'),
    'chrome.title.text': prop('text', '', 'Title text', 'layout'),
    'chrome.title.font': prop('font', font('--display', '--t-16', 600), 'Title font', 'layout'),
    'chrome.title.align': prop('alignment', 'start', 'Title alignment', 'layout'),
    'chrome.description.show': prop('bool', false, 'Show description', 'layout'),
    'chrome.description.text': prop('text', '', 'Description text', 'layout'),
    'chrome.card.show': prop('bool', true, 'Show card', 'layout'),
    'chrome.card.background': prop('colour', token('--card'), 'Card background'),
    'chrome.card.border.show': prop('bool', true, 'Show card border'),
    'chrome.card.border.colour': prop('colour', token('--rule'), 'Card border colour', 'style', { contrast: 'decor' }),
    'chrome.card.border.width': prop('integer', 1, 'Card border width', 'layout', { min: 0, max: 4, unit: 'px' }),
    'chrome.card.radius': enums(['square', 'standard', 'round'], 'standard', 'Card radius'),
    'chrome.card.shadow': enums(['none', 'low', 'raised'], 'none', 'Card shadow', 'style'),
    'chrome.padding': prop('box', box('--s-4'), 'Card padding', 'layout'),
    'chrome.empty.text': prop('text', 'No data for this range', 'Empty state text', 'layout'),
    'chrome.animate': prop('bool', true, 'Animate transitions'),
  };
}

export function layout(): PropertyMap {
  return {
    'layout.gap': enums(Array.from({ length: 9 }, (_, index) => `s-${index}`), 's-4', 'Layout gap'),
    'layout.align': enums(['start', 'center', 'end', 'stretch'], 'stretch', 'Layout alignment'),
    'layout.justify': prop('alignment', 'start', 'Layout justification', 'layout'),
    'layout.wrap': prop('bool', true, 'Wrap layout items', 'layout'),
    'layout.columns': prop('integer', 2, 'Grid columns', 'layout', { min: 1, max: 4 }),
    'layout.collapseBelow': enums(['phone', 'never'], 'phone', 'Collapse layout below'),
    'layout.maxWidth': enums(['panel', 'wide', 'full'], 'full', 'Maximum layout width'),
  };
}

export function tone(): PropertyMap {
  return {
    tone: enums(['neutral', 'accent', 'success', 'warning', 'danger', 'info'], 'neutral', 'Tone', 'style'),
  };
}

// Keep the shared metric declarations identical to the original KPI card settings.
function metricProp(type: PropertyType, defaultValue: unknown, label: string, cost: Cost,
  extra: Partial<PropertyDeclaration> = {}): PropertyDeclaration {
  return {
    type, default: defaultValue, cost, label, description: `Controls ${label.toLowerCase()}.`,
    agentNote: `Change ${label.toLowerCase()} when the metric or available space calls for it.`, ...extra,
  };
}

export function value(): PropertyMap {
  return {
    'value.format': metricProp('format', { kind: 'auto' }, 'Value format', 'style'),
    'value.font': metricProp('font', font('--font', '--t-24', 600), 'Value font', 'style'),
    'value.size': metricProp('enum', 'standard', 'Value size', 'layout', { values: ['compact', 'standard', 'large'] }),
    'value.align': metricProp('alignment', 'start', 'Value alignment', 'layout'),
  };
}

export function delta(): PropertyMap {
  return {
    'delta.show': metricProp('bool', true, 'Show comparison', 'layout'),
    'delta.kind': metricProp('enum', 'percent', 'Comparison kind', 'style', { values: ['percent', 'absolute', 'both'] }),
    'delta.decimals': metricProp('integer', 1, 'Comparison decimals', 'style', { min: 0, max: 4 }),
    'delta.polarity': metricProp('rule', { kind: 'polarity', good: 'up' }, 'Comparison polarity', 'style', { ruleKinds: ['polarity'] }),
    'delta.label': metricProp('text', 'vs previous', 'Comparison label', 'style'),
  };
}

export function axis(id: 'x' | 'y' | 'y2', opts: { scale?: 'band' | 'linear' | 'log' } = {}): PropertyMap {
  const prefix = `axis.${id}.`;
  const map: PropertyMap = {};
  const add = (key: string, value: PropertyDeclaration) => { map[prefix + key] = value; };
  add('show', prop('bool', true, 'Show axis', 'layout'));
  add('title.show', prop('bool', false, 'Show axis title', 'layout'));
  add('title.text', prop('text', '', 'Axis title', 'layout'));
  add('labels.show', prop('bool', true, 'Show axis labels', 'layout'));
  add('labels.font', prop('font', font('--font', '--t-12', 400, '--soft'), 'Axis label font', 'layout'));
  add('labels.rotate', enums(['auto', '0', '45', '90'], 'auto', 'Axis label rotation'));
  add('labels.maxChars', prop('integer', 18, 'Maximum axis label characters', 'layout', { min: 1 }));
  add('line.show', prop('bool', false, 'Show axis line'));
  add('grid.show', prop('bool', id !== 'x', 'Show grid lines'));
  add('grid.colour', prop('colour', token('--grid'), 'Grid line colour', 'style', { contrast: 'decor' }));
  add('scale', enums(['band', 'linear', 'log'], opts.scale ?? (id === 'x' ? 'band' : 'linear'), 'Axis scale'));
  add('min', prop('number', 'auto', 'Axis minimum', 'layout'));
  add('max', prop('number', 'auto', 'Axis maximum', 'layout'));
  add('ticks', prop('integer', 'auto', 'Axis tick count', 'layout', { min: 2, max: 12 }));
  add('format', prop('format', { kind: 'auto' }, 'Axis value format'));
  add('position', enums(['start', 'end'], 'start', 'Axis position'));
  return map;
}

export function legend(): PropertyMap {
  return {
    'legend.show': prop('bool', { computed: 'seriesCountMoreThanOne' }, 'Show legend', 'layout'),
    'legend.position': enums(['top', 'bottom', 'left', 'right'], 'top', 'Legend position'),
    'legend.align': prop('alignment', 'start', 'Legend alignment', 'layout'),
    'legend.font': prop('font', font('--font', '--t-12', 400, '--soft'), 'Legend font', 'layout'),
    'legend.marker': enums(['square', 'circle', 'line'], 'square', 'Legend marker'),
    'legend.toggle': prop('bool', true, 'Allow legend toggle'),
  };
}

export function tooltip(): PropertyMap {
  return {
    'tooltip.show': prop('bool', true, 'Show tooltip'),
    'tooltip.mode': enums(['single', 'shared'], 'single', 'Tooltip mode'),
    'tooltip.sort': enums(['none', 'desc', 'asc'], 'none', 'Tooltip sort'),
    'tooltip.format': prop('format', { kind: 'auto' }, 'Tooltip value format'),
    'tooltip.showComparison': prop('bool', { computed: 'hasComparisonSeries' }, 'Show comparison'),
  };
}

export function colour(): PropertyMap {
  return {
    'colour.primary': prop('colour', token('--series-1'), 'Primary colour', 'style', {
      contrast: 'mark', agentNote: 'The colour of a single-series visual; use series rules for multi-series colours',
    }),
    'colour.palette': enums(['series', 'sequential', 'custom'], 'series', 'Colour palette', 'style'),
    'colour.custom': prop('list', [], 'Custom colours', 'style', {
      item: prop('colour', token('--series-1'), 'Colour', 'style', { contrast: 'mark' }), maxItems: 12,
    }),
    'colour.comparison': prop('colour', token('--series-4'), 'Comparison colour', 'style', { contrast: 'mark' }),
    'colour.good': prop('colour', token('--sem-good'), 'Good value colour', 'style', { contrast: 'mark' }),
    'colour.bad': prop('colour', token('--sem-bad'), 'Bad value colour', 'style', { contrast: 'mark' }),
    'colour.stableKeys': prop('bool', false, 'Keep stable series colours'),
  };
}

export function dataLabels(): PropertyMap {
  return {
    'labels.show': prop('bool', false, 'Show data labels', 'layout'),
    'labels.position': enums(['inside', 'outside', 'end'], 'end', 'Data label position'),
    'labels.format': prop('format', { kind: 'auto' }, 'Data label format'),
    'labels.font': prop('font', font('--font', '--t-12'), 'Data label font', 'layout'),
  };
}
