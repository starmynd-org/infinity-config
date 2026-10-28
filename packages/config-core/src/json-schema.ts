import type { DefinedComponent, PropertyDeclaration } from './types.js';

function propertySchema(property: PropertyDeclaration): Record<string, unknown> {
  const base: Record<string, unknown> = { title: property.label, description: property.description };
  if (property.type === 'json') {
    Object.assign(base, property.shape ?? {});
    base['x-max-bytes'] = property.maxBytes ?? 16384;
    if (property.typeFrom) base[`x-type-from`] = property.typeFrom;
  } else if (property.type === 'bool') base.type = 'boolean';
  else if (property.type === 'number' || property.type === 'integer') {
    base.type = property.type === 'number' ? 'number' : 'integer';
    if (property.min !== undefined) base.minimum = property.min;
    if (property.max !== undefined) base.maximum = property.max;
  } else if (property.type === 'text' || property.type === 'alignment' || property.type === 'enum') {
    base.type = 'string';
    if (property.type === 'text' && property.minLength !== undefined) base.minLength = property.minLength;
    if (property.maxLength !== undefined) base.maxLength = property.maxLength;
    if (property.type === 'enum') base.enum = property.values?.map(item => typeof item === 'string' ? item : item.value);
    if (property.type === 'alignment') base.enum = ['start', 'center', 'end', ...(property.vertical ? ['top', 'middle', 'bottom'] : [])];
  } else if (property.type === 'colour') {
    base.type = 'object';
    base['x-contrast-role'] = property.contrast ?? 'mark';
    base.properties = { token: { type: 'string', pattern: '^--[a-zA-Z0-9-]+$' }, mix: { type: 'object', properties: { with: { type: 'string' }, percent: { type: 'number', minimum: 0, maximum: 100 } }, required: ['with', 'percent'] } };
    base.required = ['token'];
    base.additionalProperties = false;
  } else if (property.type === 'list') {
    base.type = 'array';
    if (property.item && typeof (property.item as PropertyDeclaration).type === 'string') base.items = propertySchema(property.item as PropertyDeclaration);
    else {
      const fields = Object.entries(property.item ?? {}) as Array<[string, PropertyDeclaration]>;
      const required = fields.filter(([, child]) => child.required).map(([key]) => key);
      base.items = { type: 'object', properties: Object.fromEntries(fields.map(([key, child]) => [key, propertySchema(child)])),
        ...(required.length ? { required } : {}) };
    }
    if (property.minItems !== undefined) base.minItems = property.minItems;
    if (property.maxItems !== undefined) base.maxItems = property.maxItems;
  } else if (property.type === 'format' || property.type === 'condition' || property.type === 'rule') base.type = 'object';
  else base.type = 'object';
  return base;
}

export function toJSONSchema(component: DefinedComponent): Record<string, unknown> {
  const requiredOverrides = Object.entries(component.properties).filter(([, declaration]) => declaration.required).map(([path]) => path);
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: `${component.name} configuration`,
    description: `${component.kind} component settings, version ${component.version}`,
    'x-bundle': component.bundle,
    ...(component.allowAccent ? { 'x-allow-accent': component.allowAccent } : {}),
    ...(component.data?.seriesFrom ? { 'x-data-seriesFrom': component.data.seriesFrom } : {}),
    ...(component.seriesTypes ? { 'x-series-types': component.seriesTypes } : {}),
    type: 'object',
    properties: {
      component: { const: component.name },
      version: { const: component.version },
      overrides: {
        type: 'object',
        properties: Object.fromEntries(Object.entries(component.properties).map(([path, declaration]) => {
          const schema = propertySchema(declaration);
          if (path === 'tone' && !component.allowAccent && Array.isArray(schema.enum)) schema.enum = schema.enum.filter(value => value !== 'accent');
          return [path, schema];
        })),
        ...(requiredOverrides.length ? { required: requiredOverrides } : {}),
        additionalProperties: true,
      },
      series: { type: 'array', items: { type: 'object' } },
      raw: { type: 'object' },
      rawNote: { type: 'string', maxLength: 280 },
    },
    required: ['component', 'version', 'overrides'],
    additionalProperties: false,
  };
}
