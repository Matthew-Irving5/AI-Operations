import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import test from 'node:test';
import { localFunctionDirectories } from './edge-function-inventory.js';

const functionsRoot = 'supabase/functions';
const supabaseRoot = 'supabase';
const configPath = join(supabaseRoot, 'config.toml');
const config = readFileSync(configPath, 'utf8');

function configuredImportMaps(): Map<string, string> {
  const importMaps = new Map<string, string>();
  let activeFunction: string | undefined;
  for (const line of config.split(/\r?\n/)) {
    const section = line.match(/^\[functions\.([^\]]+)\]\s*$/);
    if (section) {
      activeFunction = section[1];
      continue;
    }
    if (line.startsWith('[')) {
      activeFunction = undefined;
      continue;
    }
    const importMap = line.match(/^\s*import_map\s*=\s*"([^"]+)"\s*(?:#.*)?$/);
    if (activeFunction && importMap) {
      importMaps.set(activeFunction, resolve(supabaseRoot, importMap[1]));
    }
  }
  return importMaps;
}

function importsFrom(sourcePath: string): string[] {
  const source = readFileSync(sourcePath, 'utf8');
  const specifiers = new Set<string>();
  const pattern = /\b(?:from\s*|import\s*\()\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    const specifier = match[1] ?? match[2];
    if (specifier) specifiers.add(specifier);
  }
  return [...specifiers];
}

function localModule(importer: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const target = resolve(dirname(importer), specifier);
  const candidates = extname(target)
    ? [target]
    : [`${target}.ts`, `${target}.tsx`, `${target}.js`, `${target}.mjs`, join(target, 'index.ts')];
  return candidates.find(existsSync);
}

function resolveImportMapTarget(importMap: string, specifier: string): string | undefined {
  if (!specifier.startsWith('@ai-operations/')) return undefined;
  const imports = JSON.parse(readFileSync(importMap, 'utf8')) as {
    imports?: Record<string, unknown>;
  };
  const target = imports.imports?.[specifier];
  assert.equal(typeof target, 'string', `${importMap} must map ${specifier}`);
  const value = target as string;
  if (/^(?:https?:|npm:|jsr:|node:)/.test(value)) return undefined;
  return resolve(dirname(importMap), value);
}

test('every Edge Function deployment import graph has its own resolved alias map', () => {
  const maps = configuredImportMaps();
  for (const functionName of localFunctionDirectories(functionsRoot)) {
    const configuredMap = maps.get(functionName);
    const defaultMap = resolve(functionsRoot, functionName, 'deno.json');
    const importMap = configuredMap ?? (existsSync(defaultMap) ? defaultMap : undefined);
    const entrypoint = resolve(functionsRoot, functionName, 'index.ts');
    const visited = new Set<string>();
    const pending = [entrypoint];

    while (pending.length > 0) {
      const sourcePath = pending.pop();
      if (!sourcePath || visited.has(sourcePath)) continue;
      visited.add(sourcePath);

      for (const specifier of importsFrom(sourcePath)) {
        if (specifier.startsWith('@ai-operations/')) {
          assert.ok(
            importMap,
            `${functionName} imports ${specifier} but has no function-specific import map in supabase/config.toml or ${defaultMap}`,
          );
          const target = resolveImportMapTarget(importMap, specifier);
          assert.ok(
            target && existsSync(target),
            `${importMap} target for ${specifier} must exist`,
          );
          pending.push(target);
          continue;
        }
        const target = localModule(sourcePath, specifier);
        if (target) pending.push(target);
      }
    }
  }
});
