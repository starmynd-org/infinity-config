import type { DefinedComponent, Diagnostic, SavedDocument } from './types.js';

type Migration = { from: string; to: string; run: (doc: SavedDocument) => SavedDocument };
const registry = new Map<string, Migration[]>();
const sharedPrefixes = ['chrome.', 'axis.', 'legend.', 'tooltip.', 'colour.', 'labels.'];

export function registerMigration(componentName: string, from: string, to: string, run: Migration['run']): void {
  const entries = registry.get(componentName) ?? [];
  if (entries.some(item => item.from === from)) throw new Error(`Migration already registered: ${componentName} ${from}`);
  entries.push({ from, to, run });
  registry.set(componentName, entries);
}

export function migrate(component: DefinedComponent, document: SavedDocument): { doc: SavedDocument; warnings: Diagnostic[] } {
  let doc = structuredClone(document);
  const warnings: Diagnostic[] = [];
  if (doc.component !== component.name) {
    const kept: Record<string, unknown> = {};
    for (const [path, value] of Object.entries(doc.overrides ?? {})) {
      if (sharedPrefixes.some(prefix => path.startsWith(prefix)) && path in component.properties) kept[path] = value;
      else warnings.push({ path, code: 'type_switch_drop', message: `Dropped ${path} during component type switch` });
    }
    doc = { component: component.name, version: component.version, overrides: kept, series: [], raw: {} };
    return { doc, warnings };
  }
  const seen = new Set<string>();
  while (doc.version !== component.version) {
    if (seen.has(doc.version)) throw new Error(`Migration cycle at ${doc.version}`);
    seen.add(doc.version);
    const migration = registry.get(component.name)?.find(item => item.from === doc.version);
    if (!migration) throw new Error(`No migration for ${component.name} from ${doc.version} to ${component.version}`);
    doc = migration.run(structuredClone(doc));
    doc.version = migration.to;
  }
  return { doc, warnings };
}
