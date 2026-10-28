import { resolve, resolveValue } from './resolve.js';
import { evaluateCondition } from './condition.js';
import { columnIssue, jsonIssue, shapeIssues } from './json.js';
import type { ColourValue, Condition, ConfigPolicy, DefinedComponent, Diagnostic, FormatValue, PropertyDeclaration, SavedDocument, TokenMap, ValidationResult, ValueRule } from './types.js';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const token = (value: unknown): value is ColourValue => object(value) && typeof value.token === 'string';
const stateToken = /^--(?:ok|wait|bad|run)(?:-bg)?$/;
const bronzeToken = /^--(?:bronze(?:-.+)?|on-bronze)$/;
const plainJson = (value: unknown): boolean => value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) ||
  (Array.isArray(value) && value.every(plainJson)) || (object(value) && Object.getPrototypeOf(value) === Object.prototype && Object.values(value).every(plainJson));
const rawProps: Record<string, string[]> = {
  bar: ['barSize', 'maxBarSize', 'minPointSize', 'isAnimationActive', 'animationDuration', 'radius', 'background'],
  line: ['type', 'strokeWidth', 'dot', 'activeDot', 'connectNulls', 'isAnimationActive', 'animationDuration'],
  xAxis: ['interval', 'tickCount', 'allowDecimals', 'padding', 'mirror', 'reversed'],
  yAxis: ['interval', 'tickCount', 'allowDecimals', 'padding', 'mirror', 'reversed'],
  tooltip: ['cursor', 'offset', 'allowEscapeViewBox', 'filterNull', 'isAnimationActive'],
  legend: ['iconSize', 'iconType', 'layout', 'verticalAlign', 'align'],
  chart: ['margin', 'barGap', 'barCategoryGap', 'syncId', 'syncMethod'],
};

function issue(path: string, code: string, message: string, fix?: string): Diagnostic { return { path, code, message, ...(fix ? { fix } : {}) }; }

function checkCondition(value: unknown): boolean {
  if (!object(value)) return false;
  if ('all' in value) return Object.keys(value).length === 1 && Array.isArray(value.all) && value.all.every(checkCondition);
  if ('any' in value) return Object.keys(value).length === 1 && Array.isArray(value.any) && value.any.every(checkCondition);
  if ('not' in value) return Object.keys(value).length === 1 && checkCondition(value.not);
  const source = ['path', 'field', 'row'].filter(key => typeof value[key] === 'string');
  const operators = ['equals', 'in', 'gt', 'gte', 'lt', 'lte', 'empty'].filter(key => key in value);
  return source.length === 1 && operators.length === 1 && Object.keys(value).length === 2 &&
    (operators[0] !== 'in' || Array.isArray(value.in)) &&
    (!['gt', 'gte', 'lt', 'lte'].includes(operators[0]) || typeof value[operators[0]] === 'number') &&
    (operators[0] !== 'empty' || typeof value.empty === 'boolean');
}

function checkColour(value: unknown, path: string, _visual: boolean, errors: Diagnostic[]): boolean {
  if (!token(value) || !/^--[\w-]+$/.test(value.token)) {
    errors.push(issue(path, 'invalid_colour', 'Colour must be a theme token reference', 'Use { token: "--series-1" }'));
    return false;
  }
  for (const name of [value.token, value.mix?.with].filter(Boolean) as string[]) {
    if (bronzeToken.test(name)) errors.push(issue(path, 'bronze_forbidden', `${name} cannot colour a setting`, 'Choose a series or semantic token'));
  }
  if (value.mix && (!/^--[\w-]+$/.test(value.mix.with) || !Number.isFinite(value.mix.percent) || value.mix.percent < 0 || value.mix.percent > 100)) {
    errors.push(issue(path, 'invalid_mix', 'Mix needs a theme token and a percent from 0 to 100'));
  }
  return true;
}

function checkFormat(value: unknown): value is FormatValue {
  if (!object(value) || typeof value.kind !== 'string') return false;
  if (!['auto', 'number', 'percent', 'currency', 'date'].includes(value.kind)) return false;
  if (value.kind === 'currency' && (typeof value.currency !== 'string' || !/^[A-Z]{3}$/.test(value.currency))) return false;
  if (value.kind === 'date' && !['day', 'day-month', 'month-year', 'quarter', 'year', 'time'].includes(String(value.pattern))) return false;
  if ('decimals' in value && (!Number.isInteger(value.decimals) || (value.decimals as number) < 0 || (value.decimals as number) > 20)) return false;
  if ('compact' in value && typeof value.compact !== 'boolean') return false;
  const allowed = value.kind === 'auto' ? ['kind'] : value.kind === 'date' ? ['kind', 'pattern'] : value.kind === 'currency' ? ['kind', 'currency', 'decimals', 'compact'] : value.kind === 'percent' ? ['kind', 'decimals'] : ['kind', 'decimals', 'compact'];
  if (Object.keys(value).some(key => !allowed.includes(key))) return false;
  return true;
}

function checkRule(value: unknown): value is ValueRule {
  if (!object(value)) return false;
  if (value.kind === 'polarity') return value.good === 'up' || value.good === 'down';
  if (value.kind === 'threshold') return Array.isArray(value.steps) && value.steps.length > 0 && value.steps.every(step => object(step) && (!step.when || checkCondition(step.when)) && token(step.colour));
  if (value.kind === 'match') return Array.isArray(value.cases) && value.cases.every(item => object(item) && checkCondition(item.when) && typeof item.badge === 'string' && item.badge.length > 0 && ['neutral', 'accent', 'success', 'warning', 'danger', 'info'].includes(String(item.tone)));
  return false;
}

function checkValue(property: PropertyDeclaration, value: unknown, path: string, visual: boolean, errors: Diagnostic[], siblings?: Record<string, unknown>): void {
  if (property.allowRules && object(value) && 'kind' in value && ['threshold', 'polarity', 'match'].includes(String(value.kind))) {
    if (!checkRule(value)) errors.push(issue(path, 'invalid_rule', 'Value rule is malformed'));
    else if (value.kind === 'threshold') value.steps.forEach((step: { colour: unknown }, index: number) => checkColour(step.colour, `${path}.steps[${index}].colour`, visual, errors));
    return;
  }
  if (property.type === 'rule') {
    if (!checkRule(value)) errors.push(issue(path, 'invalid_rule', 'Value rule is malformed'));
    else if ((value as ValueRule).kind === 'threshold') (value as Extract<ValueRule, { kind: 'threshold' }>).steps.forEach((step, index) => checkColour(step.colour, `${path}.steps[${index}].colour`, visual, errors));
    return;
  }
  if (property.type === 'colour') {
    if (checkColour(value, path, visual, errors) && property.forbidTokens?.includes((value as ColourValue).token)) errors.push(issue(path, 'forbidden_token', `${(value as ColourValue).token} is forbidden here`));
    return;
  }
  if (token(value) && ['number', 'integer', 'text'].includes(property.type) && !property.required && property.minLength === undefined) return;
  switch (property.type) {
    case 'json': {
      const problem = jsonIssue(value, path);
      if (problem) { errors.push(problem); break; }
      const bytes = new TextEncoder().encode(JSON.stringify(value)).length;
      if (bytes > (property.maxBytes ?? 16384)) errors.push(issue(path, 'json_too_large', `JSON value exceeds ${property.maxBytes ?? 16384} bytes`));
      if (property.shape) errors.push(...shapeIssues(value, property.shape, path));
      if (property.typeFrom && siblings) {
        const sibling = siblings[property.typeFrom];
        const mismatch = columnIssue(value, sibling, path);
        if (mismatch) errors.push(mismatch);
      }
      break;
    }
    case 'bool': if (typeof value !== 'boolean') errors.push(issue(path, 'wrong_type', 'Expected a boolean')); break;
    case 'number': case 'integer': {
      if (value === 'auto') break;
      if (typeof value !== 'number' || !Number.isFinite(value) || (property.type === 'integer' && !Number.isInteger(value))) errors.push(issue(path, 'wrong_type', `Expected a finite ${property.type}`));
      else if ((property.min !== undefined && value < property.min) || (property.max !== undefined && value > property.max)) errors.push(issue(path, 'out_of_range', `Value must be between ${property.min ?? '-Infinity'} and ${property.max ?? 'Infinity'}`));
      break;
    }
    case 'text': {
      if (property.required && (typeof value !== 'string' || !value.trim())) {
        errors.push(issue(path, 'required', 'Required text is missing', 'Enter a nonempty value'));
        break;
      }
      if (typeof value !== 'string' || (property.maxLength !== undefined && value.length > property.maxLength))
        errors.push(issue(path, 'invalid_text', 'Text is missing or too long'));
      else if (property.minLength !== undefined && value.trim().length < property.minLength)
        errors.push(issue(path, 'min_length', `Text needs at least ${property.minLength} characters`, `Enter at least ${property.minLength} characters`));
      break;
    }
    case 'enum': {
      const values = property.values?.map(item => typeof item === 'string' ? item : item.value) ?? [];
      if (!values.includes(String(value))) errors.push(issue(path, 'invalid_enum', `Choose one of: ${values.join(', ')}`));
      break;
    }
    case 'alignment': if (!['start', 'center', 'end', ...(property.vertical ? ['top', 'middle', 'bottom'] : [])].includes(String(value))) errors.push(issue(path, 'invalid_alignment', 'Choose an allowed alignment')); break;
    case 'format': if (!checkFormat(value) || (property.kinds && !property.kinds.includes(value.kind))) errors.push(issue(path, 'invalid_format', 'Format value is invalid')); break;
    case 'condition': if (!checkCondition(value as Condition)) errors.push(issue(path, 'invalid_condition', 'Condition must use one allowed leaf and one operator')); break;
    case 'list': {
      if (!Array.isArray(value) || (property.minItems !== undefined && value.length < property.minItems) || (property.maxItems !== undefined && value.length > property.maxItems)) {
        errors.push(issue(path, 'invalid_list', 'List length is outside its allowed range'));
        break;
      }
      const keys = new Set<unknown>();
      for (const [index, item] of value.entries()) {
        if (property.item && typeof (property.item as PropertyDeclaration).type === 'string') {
          checkValue(property.item as PropertyDeclaration, item, `${path}[${index}]`, visual, errors);
          continue;
        }
        if (!object(item)) { errors.push(issue(`${path}[${index}]`, 'wrong_type', 'List item must be an object')); continue; }
        const key = item[property.key ?? 'id'];
        if (key === undefined || keys.has(key)) errors.push(issue(`${path}[${index}]`, 'duplicate_key', 'List item key is missing or duplicated'));
        keys.add(key);
        for (const [itemPath, itemProperty] of Object.entries(property.item ?? {}) as Array<[string, PropertyDeclaration]>) {
          if (itemPath in item) checkValue(itemProperty, item[itemPath], `${path}[${String(key)}].${itemPath}`, visual, errors, item);
          else if (itemProperty.type === 'text' && itemProperty.required)
            errors.push(issue(`${path}[${String(key)}].${itemPath}`, 'required', 'Required text is missing', `Add ${itemPath}`));
        }
      }
      break;
    }
    default: errors.push(issue(path, 'unsupported_type', `Unsupported type ${property.type}`));
  }
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  return channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

const hexColour = /^#[\da-f]{6}(?:[\da-f]{2})?$/i;

function composite(hex: string, background: string): string {
  if (hex.length === 7) return hex;
  const alpha = parseInt(hex.slice(7, 9), 16) / 255;
  const channels = [1, 3, 5].map(index => Math.round(
    parseInt(hex.slice(index, index + 2), 16) * alpha +
    parseInt(background.slice(index, index + 2), 16) * (1 - alpha),
  ));
  return `#${channels.map(value => value.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function validate(component: DefinedComponent, doc: SavedDocument, options: { tokens?: TokenMap; policy?: ConfigPolicy } = {}): ValidationResult {
  const errors: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];
  if (doc.component !== component.name) errors.push(issue('component', 'wrong_component', `Expected ${component.name}`));
  if (!object(doc.overrides)) errors.push(issue('overrides', 'wrong_type', 'Overrides must be a path map'));
  else for (const [path, value] of Object.entries(doc.overrides)) {
    const property = component.properties[path];
    if (!property) warnings.push(issue(path, 'unknown_key', 'Unknown key was kept for forward compatibility'));
    else {
      const prefix = path.includes('.') ? `${path.slice(0, path.lastIndexOf('.') + 1)}` : '';
      const siblings: Record<string, unknown> = {};
      for (const [otherPath, otherProperty] of Object.entries(component.properties)) {
        if (otherPath.startsWith(prefix) && !otherPath.slice(prefix.length).includes('.')) siblings[otherPath.slice(prefix.length)] = otherPath in doc.overrides ? doc.overrides[otherPath] : otherProperty.default;
      }
      checkValue(property, value, path, component.kind === 'visual', errors, siblings);
    }
  }
  for (const [path, property] of Object.entries(component.properties)) {
    if (property.type === 'text' && property.required && !property.hidden && !(path in (object(doc.overrides) ? doc.overrides : {})))
      errors.push(issue(path, 'required', 'Required text is missing', `Add ${path} to overrides`));
  }
  const chosenTone = component.properties.tone && object(doc.overrides) && 'tone' in doc.overrides
    ? doc.overrides.tone : component.properties.tone?.default;
  if (chosenTone === 'accent' && !component.allowAccent)
    errors.push(issue('tone', 'accent_forbidden', 'Accent tone is reserved for go buttons', 'Choose another tone'));
  else if (chosenTone === 'accent' && component.allowAccent && component.allowAccent !== true) {
    const condition = component.allowAccent;
    let allowed = false;
    try {
      const resolved = resolve(component, { tokens: options.tokens, overrides: object(doc.overrides) ? doc.overrides : {} });
      allowed = evaluateCondition(condition, resolved.props);
    } catch { /* A failed resolution cannot authorize an accent. */ }
    if (!allowed) errors.push(issue('tone', 'accent_not_allowed', 'Accent tone does not satisfy this component condition',
      `Choose another tone or satisfy allowAccent: ${JSON.stringify(condition)}`));
  }
  for (const [index, rule] of (doc.series ?? []).entries()) {
    if (!object(rule.match) || !object(rule.set) || Object.keys(rule.match).length === 0) { errors.push(issue(`series[${index}]`, 'invalid_rule', 'Series rule needs a matcher and set values')); continue; }
    if (rule.match.label) {
      try { new RegExp(rule.match.label); } catch { errors.push(issue(`series[${index}].match.label`, 'invalid_regex', 'Label matcher must be a regular expression')); }
      if (!/[\^$.*+?()[\]{}|\\]/.test(rule.match.label)) warnings.push(issue(`series[${index}].match.label`, 'literal_member', 'Label matcher may store a business value; prefer a stable id'));
    }
    for (const [key, value] of Object.entries(rule.set)) {
      const path = `series[${index}].${key}`;
      if (!component.series?.[key] && key !== 'type')
        errors.push(issue(path, 'unknown_series_key', `${key} is not enabled for this component`));
      if (key === 'colour') {
        if (checkColour(value, path, component.kind === 'visual', errors) && stateToken.test((value as ColourValue).token)) warnings.push(issue(path, 'state_series_colour', 'State tokens should not identify a series', 'Use a series token'));
      } else if (['hidden', 'marker.show', 'label.show', 'dashed'].includes(key) && typeof value !== 'boolean') errors.push(issue(path, 'wrong_type', 'Expected a boolean'));
      else if (key === 'dash' && typeof value !== 'string') errors.push(issue(path, 'wrong_type', 'Expected a dash pattern string'));
      else if (key === 'line.style' && !['solid', 'dashed', 'dotted'].includes(String(value))) errors.push(issue(path, 'invalid_enum', 'Choose solid, dashed or dotted'));
      else if (key === 'line.width' && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) errors.push(issue(path, 'out_of_range', 'Line width must be a nonnegative finite number'));
      else if (key === 'axis' && !['y', 'y2'].includes(String(value))) errors.push(issue(path, 'invalid_enum', 'Choose y or y2'));
      else if (key === 'axis' && value === 'y2' && !component.properties['axis.y2.show'])
        errors.push(issue(path, 'not_allowed', 'The component has no second value axis'));
      else if (key === 'type' && (!component.seriesTypes || !component.seriesTypes.includes(value as 'bar' | 'line' | 'area')))
        errors.push(issue(path, 'not_allowed', 'This mark type is not allowed for the component'));
    }
  }
  for (const [element, props] of Object.entries(doc.raw ?? {})) {
    if (!rawProps[element] || !object(props)) { errors.push(issue(`raw.${element}`, 'unknown_raw_element', 'Unknown renderer element')); continue; }
    for (const [key, value] of Object.entries(props)) {
      if (!rawProps[element].includes(key)) errors.push(issue(`raw.${element}.${key}`, 'unknown_raw_key', 'Renderer property is not allowed for this Recharts major'));
      if (!plainJson(value)) errors.push(issue(`raw.${element}.${key}`, 'non_json', 'Raw values must be plain JSON'));
    }
  }
  if (doc.rawNote !== undefined && (typeof doc.rawNote !== 'string' || doc.rawNote.length > 280)) {
    errors.push(issue('rawNote', 'invalid_raw_note', 'Raw note must be a string of at most 280 characters'));
  }
  if (options.policy?.rawNoteRequired && Object.keys(doc.raw ?? {}).length > 0 && !doc.rawNote) {
    errors.push(issue('rawNote', 'note_required', 'Raw overrides need a patch note'));
  }
  if (options.tokens) {
    const background = doc.overrides?.['chrome.card.background'] ?? component.properties['chrome.card.background']?.default;
    const backgroundHex = resolveValue(background, options.tokens, 'chrome.card.background', warnings);
    if (typeof backgroundHex === 'string' && hexColour.test(backgroundHex)) {
      const opaqueBackground = composite(backgroundHex, '#FFFFFF');
      for (const [path, property] of Object.entries(component.properties)) {
        if (property.type !== 'colour' || path === 'chrome.card.background') continue;
        const candidate = doc.overrides?.[path] ?? property.default;
        const hex = resolveValue(candidate, options.tokens, path, warnings);
        if (typeof hex !== 'string' || !hexColour.test(hex)) continue;
        const a = luminance(composite(hex, opaqueBackground)), b = luminance(opaqueBackground);
        const contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        const role = property.contrast ?? 'mark';
        const minimum = role === 'text' ? 4.5 : 3;
        if (role !== 'decor' && contrast < minimum) warnings.push(issue(path, 'low_contrast', `${hex} has ${contrast.toFixed(2)}:1 contrast on ${backgroundHex}`, 'Choose a higher contrast theme token'));
      }
      for (const [index, rule] of (doc.series ?? []).entries()) {
        const colour = rule.set.colour;
        if (!colour) continue;
        const hex = resolveValue(colour, options.tokens, `series[${index}].colour`, warnings);
        if (typeof hex !== 'string' || !hexColour.test(hex)) continue;
        const a = luminance(composite(hex, opaqueBackground)), b = luminance(opaqueBackground);
        const contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (contrast < 3) warnings.push(issue(`series[${index}].colour`, 'low_contrast', `${hex} has ${contrast.toFixed(2)}:1 contrast on ${backgroundHex}`, 'Choose a higher contrast theme token'));
      }
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}
