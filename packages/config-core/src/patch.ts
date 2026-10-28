import { validate } from './validate.js';
import type { ConfigPolicy, Cost, DefinedComponent, Diagnostic, PatchOperation, PatchResult, SavedDocument, TokenMap } from './types.js';

const copy = <T>(value: T): T => structuredClone(value);
const issue = (path: string, code: string, message: string, fix?: string): Diagnostic => ({ path, code, message, ...(fix ? { fix } : {}) });
const costRank: Record<Cost, number> = { style: 0, layout: 1, data: 2 };
export const DEFAULT_POLICY: Required<ConfigPolicy> = { rawNoteRequired: false };

export function applyPatch(
  component: DefinedComponent,
  doc: SavedDocument,
  operations: PatchOperation[],
  options: { note?: string; tokens?: TokenMap; policy?: ConfigPolicy } = {},
): PatchResult {
  const next = copy(doc);
  next.overrides ??= {};
  const errors: Diagnostic[] = [];
  const changed: string[] = [];
  let cost: Cost = 'style';
  let rawWritten = false;
  const mark = (path: string) => {
    changed.push(path);
    const propertyCost = component.properties[path]?.cost ?? 'style';
    if (costRank[propertyCost] > costRank[cost]) cost = propertyCost;
  };
  for (const operation of operations) {
    if (operation.op === 'set') {
      if (operation.path.startsWith('raw.')) {
        const [, element, key] = operation.path.split('.');
        if (!element || !key) { errors.push(issue(operation.path, 'invalid_raw_path', 'Use raw.<element>.<property>')); continue; }
        next.raw ??= {};
        next.raw[element] ??= {};
        next.raw[element][key] = copy(operation.value);
        rawWritten = true;
        mark('raw');
        continue;
      }
      const property = component.properties[operation.path];
      if (!property) { errors.push(issue(operation.path, 'unknown_key', 'New writes to unknown keys are refused', 'Choose a declared property')); continue; }
      next.overrides[operation.path] = copy(operation.value);
      mark(operation.path);
    } else if (operation.op === 'addSeriesRule') {
      next.series ??= [];
      next.series.push(copy(operation.rule));
      mark('series');
    } else if (operation.op === 'reset') {
      if (operation.path) {
        if (operation.path.startsWith('raw.')) {
          const [, element, key] = operation.path.split('.');
          if (next.raw?.[element] && key in next.raw[element]) {
            delete next.raw[element][key];
            delete next.rawNote;
            mark('raw');
          }
          continue;
        }
        for (const path of Object.keys(next.overrides)) {
          if (path === operation.path || path.startsWith(`${operation.path}.`)) { delete next.overrides[path]; mark(path); }
        }
      } else if (operation.scope === 'series') {
        next.series = [];
        mark('series');
      } else if (operation.scope === 'raw') {
        next.raw = {};
        delete next.rawNote;
        mark('raw');
      } else if (operation.scope === 'all') {
        for (const path of Object.keys(next.overrides)) mark(path);
        next.overrides = {};
        next.series = [];
        next.raw = {};
        delete next.rawNote;
      } else if (operation.scope) {
        for (const path of Object.keys(next.overrides)) {
          if (path.startsWith(`${operation.scope}.`) || component.properties[path]?.cost === operation.scope) {
            delete next.overrides[path]; mark(path);
          }
        }
      } else errors.push(issue('reset', 'missing_scope', 'Reset needs a path or scope'));
    }
  }
  if (rawWritten && options.note?.trim()) next.rawNote = options.note.trim().slice(0, 280);
  const policy = { ...DEFAULT_POLICY, ...options.policy };
  if (policy.rawNoteRequired && rawWritten && !options.note?.trim()) errors.push(issue('raw', 'note_required', 'Raw overrides need a patch note explaining why the schema cannot express this'));
  const result = validate(component, next, { tokens: options.tokens, policy });
  errors.push(...result.errors);
  if (errors.length) return { ok: false, doc, errors, warnings: result.warnings, changed: [], cost: 'style' };
  return { ok: true, doc: next, errors: [], warnings: result.warnings, changed: [...new Set(changed)], cost };
}
