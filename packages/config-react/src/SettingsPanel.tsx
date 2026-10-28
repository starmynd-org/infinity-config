import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { explain, resolve, toJSONSchema, validate, type DefinedComponent, type Diagnostic, type PatchOperation, type PropertyDeclaration, type SavedDocument, type TokenMap, type TokenSets, type ResolveContext } from '@infinity/config-core';
import styles from './SettingsPanel.module.css';

export interface SettingsPanelProps {
  component: DefinedComponent;
  doc: SavedDocument;
  onPatch: (operations: PatchOperation[]) => void;
  tokens?: TokenMap | TokenSets;
  ctx?: ResolveContext;
  defaults?: Record<string, unknown>;
}

function JsonEditor({ id, path, value, onChange, onValidate }: {
  id: string; path: string; value: unknown; onChange: (value: unknown) => void; onValidate: (value: unknown) => Diagnostic | undefined;
}) {
  const [draft, setDraft] = useState(() => JSON.stringify(value ?? null, null, 2));
  const [error, setError] = useState('');
  useEffect(() => { setDraft(JSON.stringify(value ?? null, null, 2)); setError(''); }, [value]);
  const commit = () => {
    try {
      const parsed: unknown = JSON.parse(draft);
      const problem = onValidate(parsed);
      if (problem) { setError(`${problem.path}: ${problem.message}`); return; }
      setError('');
      onChange(parsed);
    } catch (cause) {
      setError(`${path}: ${cause instanceof Error ? cause.message : 'Invalid JSON'}`);
    }
  };
  return <><textarea id={id} className={styles.control} value={draft} onChange={event => setDraft(event.target.value)} onBlur={commit} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} />
    {error && <span id={`${id}-error`} role="alert">{error}</span>}</>;
}

function Editor({ path, property, value, tokens, onChange, onValidate }: {
  path: string; property: PropertyDeclaration; value: unknown; tokens?: TokenMap | TokenSets; onChange: (value: unknown) => void; onValidate?: (value: unknown) => Diagnostic | undefined;
}) {
  const id = `setting-${path.replace(/[^a-zA-Z0-9]/g, '-')}`;
  const parse = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (property.type === 'bool') onChange((event.target as HTMLInputElement).checked);
    else if (property.type === 'integer' || property.type === 'number') onChange(event.target.value === 'auto' ? 'auto' : Number(event.target.value));
    else if (['format', 'condition', 'rule', 'list'].includes(property.type)) {
      try { onChange(JSON.parse(event.target.value)); } catch { /* Wait until JSON is valid. */ }
    } else if (property.type === 'colour') onChange({ token: event.target.value });
    else onChange(event.target.value);
  };
  if (property.type === 'json') return <JsonEditor id={id} path={path} value={value} onChange={onChange} onValidate={onValidate!} />;
  if (property.type === 'bool') return <input id={id} type="checkbox" role="switch" checked={!!value} onChange={parse} />;
  if (property.type === 'enum' || property.type === 'alignment') {
    const choices = property.type === 'enum' ? property.values?.map(item => typeof item === 'string' ? { value: item, label: item } : item) ?? []
      : ['start', 'center', 'end', ...(property.vertical ? ['top', 'middle', 'bottom'] : [])].map(item => ({ value: item, label: item }));
    return <select id={id} className={styles.control} value={String(value ?? '')} onChange={parse}>{choices.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>;
  }
  if (property.type === 'colour') {
    const map = tokens && 'light' in tokens && 'dark' in tokens ? (tokens as TokenSets)[(tokens as TokenSets).scheme] : tokens as TokenMap | undefined;
    const choices = Object.keys(map ?? {}).filter(key => !/^--(?:bronze(?:-.+)?|on-bronze)$/.test(key));
    const selected = value && typeof value === 'object' && 'token' in value ? String(value.token) : '';
    return <select id={id} className={styles.control} value={selected} onChange={parse}>{choices.map(key => <option key={key} value={key}>{key}</option>)}</select>;
  }
  if (['format', 'condition', 'rule', 'list'].includes(property.type)) return <textarea id={id} className={styles.control} value={JSON.stringify(value ?? null, null, 2)} onChange={parse} />;
  if (property.type === 'text' && property.multiline) return <textarea id={id} className={styles.control} value={String(value ?? '')} onChange={parse} />;
  return <input id={id} className={styles.control} type={property.type === 'integer' || property.type === 'number' ? 'number' : 'text'} min={property.min} max={property.max} step={property.step ?? (property.type === 'integer' ? 1 : undefined)} value={String(value ?? '')} onChange={parse} />;
}

export function SettingsPanel({ component, doc, onPatch, tokens, ctx = {}, defaults }: SettingsPanelProps) {
  const [linkedBoxes, setLinkedBoxes] = useState<Set<string>>(() => new Set());
  const schema = useMemo(() => toJSONSchema(component), [component]);
  const resolved = useMemo(() => resolve(component, { tokens, defaults, overrides: doc.overrides, series: doc.series, raw: doc.raw, rawNote: doc.rawNote }, ctx), [component, tokens, defaults, doc, ctx]);
  const schemaProps = ((schema.properties as Record<string, unknown>).overrides as { properties: Record<string, { title: string; description: string }> }).properties;
  const groups = new Map<string, Array<[string, PropertyDeclaration]>>();
  for (const [path, property] of Object.entries(component.properties)) {
    if (resolved.sources[path]?.hidden) continue;
    const group = property.group ?? path.split('.')[0];
    const fields = groups.get(group) ?? [];
    fields.push([path, property]);
    groups.set(group, fields);
  }
  return <div className={styles.panel} aria-label={`${component.name} settings`}>
    {Object.keys(doc.raw ?? {}).length > 0 && <div role="status">
      Raw renderer overrides active{doc.rawNote ? `: ${doc.rawNote}` : ''}
      <details className={styles.why}><summary>Why raw</summary><pre>{JSON.stringify(explain(resolved, 'raw'), null, 2)}</pre></details>
    </div>}
    <div className={styles.actions}>
      {(['style', 'layout', 'series', 'raw', 'all'] as const).map(scope => <button key={scope} type="button" className={styles.button} onClick={() => onPatch([{ op: 'reset', scope }])}>Reset {scope}</button>)}
    </div>
    {[...groups].map(([group, fields]) => <details key={group} className={styles.group} open>
      <summary>{group}</summary>
      <div className={styles.actions}><button type="button" className={styles.button} onClick={() => onPatch([{ op: 'reset', path: group }])}>Reset {group}</button></div>
      <div className={styles.fields}>{fields.map(([path, property]) => {
        const boxBase = path.replace(/\.(top|right|bottom|left)$/, '');
        const isBox = component.originalProperties[boxBase]?.type === 'box';
        const change = (value: unknown) => onPatch(isBox && linkedBoxes.has(boxBase)
          ? (['top', 'right', 'bottom', 'left'] as const).map(side => ({ op: 'set' as const, path: `${boxBase}.${side}`, value }))
          : [{ op: 'set', path, value }]);
        return <div key={path} className={`${styles.field} ${property.width === 'half' ? styles.half : property.width === 'third' ? styles.third : ''}`}>
        {isBox && path.endsWith('.top') && <button type="button" className={styles.button} aria-pressed={linkedBoxes.has(boxBase)} onClick={() => setLinkedBoxes(current => {
          const next = new Set(current);
          if (next.has(boxBase)) next.delete(boxBase); else next.add(boxBase);
          return next;
        })}>Link {boxBase}</button>}
        <label htmlFor={`setting-${path.replace(/[^a-zA-Z0-9]/g, '-')}`} className={styles.label} title={schemaProps[path]?.description}>
          {schemaProps[path]?.title ?? property.label}{(path in doc.overrides || path in (defaults ?? {})) && <span className={styles.dot} aria-label="Overridden">●</span>}
        </label>
        <Editor path={path} property={property} value={path in doc.overrides ? doc.overrides[path] : (property.type === 'colour' ? property.default : resolved.props[path] ?? property.default)} tokens={tokens} onChange={change}
          onValidate={property.type === 'json' ? value => validate(component, { ...doc, overrides: { ...doc.overrides, [path]: value } }).errors.find(problem => problem.path === path || problem.path.startsWith(`${path}.`) || problem.path.startsWith(`${path}[`)) : undefined} />
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={() => onPatch([{ op: 'reset', path }])}>Reset {property.label}</button>
          <details className={styles.why}><summary>Why</summary><pre>{JSON.stringify(explain(resolved, path), null, 2)}</pre></details>
        </div>
      </div>; })}</div>
    </details>)}
  </div>;
}
