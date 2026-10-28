import { existsSync } from 'node:fs';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { toJSONSchema, type DefinedComponent } from '../src/index.js';

const kit = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'ui-kit'));
if (!existsSync(kit) || !existsSync(join(kit, 'src'))) {
  console.error(`UI kit source folder does not exist: ${join(kit, 'src')}`);
  process.exit(1);
}
const source = join(kit, 'src');
for (const entry of await readdir(source, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const schemaFile = join(source, entry.name, 'schema.ts');
  let module: Record<string, unknown>;
  try { module = await import(pathToFileURL(schemaFile).href); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') continue; throw error; }
  for (const value of Object.values(module)) {
    if (!value || typeof value !== 'object' || !('properties' in value) || !('name' in value)) continue;
    const component = value as DefinedComponent;
    const folder = join(kit, 'schemas', component.name);
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, `${component.version}.json`), `${JSON.stringify(toJSONSchema(component), null, 2)}\n`);
  }
}
