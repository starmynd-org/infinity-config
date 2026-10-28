import type { ComponentDeclaration, DefinedComponent, PropertyDeclaration, PropertyMap } from './types.js';
import { checkShapeDeclaration, columnIssue, jsonIssue, shapeIssues } from './json.js';
import { isPathCondition, readDependencies } from './condition.js';

function checkJsonValue(path: string, property: PropertyDeclaration, value: unknown, siblings?: Record<string, unknown>): void {
  const problem = jsonIssue(value, path);
  if (problem) throw new Error(`${problem.path}: ${problem.message}`);
  if (new TextEncoder().encode(JSON.stringify(value)).length > (property.maxBytes ?? 16384)) throw new Error(`${path}: json default exceeds maxBytes`);
  if (property.shape) {
    const mismatch = shapeIssues(value, property.shape, path)[0];
    if (mismatch) throw new Error(`${mismatch.path}: ${mismatch.message}`);
  }
  if (property.typeFrom && siblings) {
    const mismatch = columnIssue(value, siblings[property.typeFrom], path);
    if (mismatch) throw new Error(`${mismatch.path}: ${mismatch.message}`);
  }
}

function checkJsonDeclaration(path: string, property: PropertyDeclaration): void {
  if (property.type === 'json') {
    if (property.cost === 'style') throw new Error(`${path}: json cost must be data or layout`);
    if (property.maxBytes !== undefined && (!Number.isInteger(property.maxBytes) || property.maxBytes < 1)) throw new Error(`${path}: maxBytes must be a positive integer`);
    if (property.typeFrom !== undefined && !/^[a-z][a-zA-Z0-9]*$/.test(property.typeFrom)) throw new Error(`${path}: typeFrom must name a sibling key`);
    if (property.shape) checkShapeDeclaration(property.shape, `${path}.shape`);
    checkJsonValue(path, property, property.default);
    const value = property.default;
    if ((typeof value === 'string' && value.startsWith('--')) ||
      (value !== null && typeof value === 'object' && !Array.isArray(value) &&
        (typeof (value as Record<string, unknown>).token === 'string' ||
          ['auto', 'number', 'percent', 'currency', 'date'].includes(String((value as Record<string, unknown>).kind))))) {
      throw new Error(`${path}: json default cannot be a token, colour or format`);
    }
  }
  if (property.type === 'list' && property.item) {
    if (typeof (property.item as PropertyDeclaration).type === 'string') checkJsonDeclaration(`${path}[]`, property.item as PropertyDeclaration);
    else {
      const fields = property.item as Record<string, PropertyDeclaration>;
      for (const [name, child] of Object.entries(fields)) {
        checkJsonDeclaration(`${path}[].${name}`, child);
        if (child.type === 'json' && child.typeFrom && !(child.typeFrom in fields)) throw new Error(`${path}[].${name}: typeFrom sibling is missing`);
      }
    }
  }
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function expand(path: string, property: PropertyDeclaration, target: PropertyMap): void {
  const fields = property.type === 'font' ? ['family', 'size', 'weight', 'italic', 'colour']
    : property.type === 'box' ? ['top', 'right', 'bottom', 'left'] : [];
  if (!fields.length) {
    target[path] = property;
    return;
  }
  const defaults = property.default as Record<string, unknown>;
  if (!defaults || typeof defaults !== 'object') throw new Error(`${path}: composite default must be an object`);
  for (const field of fields) {
    if (!(field in defaults)) throw new Error(`${path}.${field}: composite default is missing`);
    const type = property.type === 'box' ? 'integer' : field === 'colour' ? 'colour' : field === 'italic' ? 'bool' : field === 'weight' ? 'integer' : 'text';
    target[`${path}.${field}`] = {
      ...property, type, cost: field === 'colour' ? 'style' : property.cost,
      default: defaults[field], label: `${property.label} ${field}`,
      ...(property.type === 'font' && field === 'colour' ? { contrast: 'text' as const } : {}),
    };
  }
}

export function defineComponent(declaration: ComponentDeclaration): DefinedComponent {
  if (!/^[a-z][a-z0-9-]*$/.test(declaration.name)) throw new Error('Component name must be lowercase');
  if (!/^\d+\.\d+\.\d+$/.test(declaration.version)) throw new Error('Component version must be semver');
  if (declaration.bundle !== undefined && declaration.bundle !== 'main' && declaration.bundle !== 'charts') throw new Error('Component bundle must be main or charts');
  if (declaration.seriesTypes && (!declaration.seriesTypes.length ||
    declaration.seriesTypes.some(type => !['bar', 'line', 'area'].includes(type)) ||
    new Set(declaration.seriesTypes).size !== declaration.seriesTypes.length))
    throw new Error('seriesTypes must list distinct bar, line or area marks');
  if (declaration.data?.seriesFrom === 'category' && declaration.data.shape !== 'categorical')
    throw new Error('Category series require categorical data');
  const original: PropertyMap = {};
  for (const group of declaration.groups ?? []) {
    for (const [path, property] of Object.entries(group)) {
      if (path in original) throw new Error(`${path}: duplicate property`);
      original[path] = { ...property };
    }
  }
  for (const [path, property] of Object.entries(declaration.props ?? {})) {
    if (path in original) throw new Error(`${path}: duplicate property`);
    original[path] = { ...property };
  }
  for (const [path, override] of Object.entries(declaration.overrides ?? {})) {
    if (!(path in original)) throw new Error(`${path}: cannot rename or add a shared group key through overrides`);
    if ('label' in override) throw new Error(`${path}: renaming a shared group key is forbidden`);
    original[path] = { ...original[path], ...override };
  }
  const properties: PropertyMap = {};
  for (const [path, property] of Object.entries(original)) {
    if (!/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)*$/.test(path)) throw new Error(`${path}: invalid property path`);
    for (const key of ['default', 'cost', 'label', 'description', 'agentNote'] as const) {
      if (!(key in property) || property[key] === undefined || (key !== 'default' && property[key] === '')) throw new Error(`${path}: ${key} is required`);
    }
    if (property.cost === 'data' && property.type !== 'json') throw new Error(`${path}: data cost is reserved in v1`);
    if (property.type === 'text') {
      if (property.required !== undefined && typeof property.required !== 'boolean') throw new Error(`${path}: required must be a boolean`);
      if (property.minLength !== undefined && (!Number.isInteger(property.minLength) || property.minLength < 0)) throw new Error(`${path}: minLength must be a nonnegative integer`);
      if (property.minLength !== undefined && property.maxLength !== undefined && property.minLength > property.maxLength) throw new Error(`${path}: minLength exceeds maxLength`);
    }
    checkJsonDeclaration(path, property);
    if (property.type === 'enum' && !property.values?.length) throw new Error(`${path}: enum needs values`);
    if (property.type === 'list' && !property.item) throw new Error(`${path}: list needs an item declaration`);
    if (property.type === 'list' && typeof (property.item as PropertyDeclaration).type !== 'string' && !property.key) throw new Error(`${path}: shaped list needs a unique key`);
    expand(path, property, properties);
  }
  for (const [path, property] of Object.entries(original)) {
    if (property.type === 'json' && property.typeFrom) {
      const prefix = path.includes('.') ? path.slice(0, path.lastIndexOf('.') + 1) : '';
      const sibling = original[`${prefix}${property.typeFrom}`];
      if (!sibling) throw new Error(`${path}: typeFrom sibling is missing`);
      checkJsonValue(path, property, property.default, { [property.typeFrom]: sibling.default });
    }
    if (property.type !== 'list' || !Array.isArray(property.default) || !property.item || typeof (property.item as PropertyDeclaration).type === 'string') continue;
    const fields = property.item as Record<string, PropertyDeclaration>;
    for (const [index, entry] of property.default.entries()) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const row = entry as Record<string, unknown>;
      for (const [name, child] of Object.entries(fields)) if (child.type === 'json' && name in row) {
        checkJsonValue(`${path}[${index}].${name}`, child, row[name], row);
      }
    }
  }
  if (declaration.allowAccent !== undefined && declaration.allowAccent !== true) {
    if (!isPathCondition(declaration.allowAccent)) throw new Error('allowAccent needs a 4a condition with path leaves only');
    for (const path of readDependencies(declaration.allowAccent)) {
      if (!(path in properties)) throw new Error(`allowAccent path ${path} is not a declared property`);
    }
  }
  return freezeDeep({ ...declaration, bundle: declaration.bundle ?? 'main', originalProperties: original, properties });
}
