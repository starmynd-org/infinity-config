import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('keeps production source imports inside config-core', async () => {
  const root = fileURLToPath(new URL('.', import.meta.url));
  const files: string[] = [];
  async function walk(folder: string): Promise<void> {
    for (const item of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, item.name);
      if (item.isDirectory()) await walk(path);
      else if (item.name.endsWith('.ts') && !item.name.endsWith('.test.ts')) files.push(path);
    }
  }
  await walk(root);
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/(?:from\s*|import\s*\()(['"])([^'"]+)\1/g)) {
      expect(match[2], `${file} imports ${match[2]}`).toMatch(/^\.\/(?!\.\.)|^\.\.\/(?!\.\.\/)/);
      expect(match[2], `${file} imports ${match[2]}`).not.toContain('../..');
    }
  }
});
