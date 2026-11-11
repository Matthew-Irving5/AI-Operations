#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const catalogPath = new URL('../../docs/testing/platform-live-role-catalog-20261111.json', import.meta.url);

export function lookupRoleCatalog(catalog, environment, kind, name) {
  if (!['production', 'staging'].includes(environment)) {
    throw new Error('environment must be production or staging');
  }
  if (!['table', 'rpc'].includes(kind)) {
    throw new Error('kind must be table or rpc');
  }
  if (!name || !name.trim()) {
    throw new Error('object name or RPC prefix is required');
  }
  const collection = catalog.environments?.[environment]?.[kind === 'table' ? 'tables' : 'functions'];
  if (!Array.isArray(collection)) {
    throw new Error('invalid role catalog');
  }
  const query = name.trim().toLowerCase();
  return collection.filter((entry) => {
    const identity = kind === 'table' ? entry.object : entry.signature;
    return typeof identity === 'string' && (identity.toLowerCase() === query || identity.toLowerCase().startsWith(query + '('));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [environment, kind, ...nameParts] = process.argv.slice(2);
    const name = nameParts.join(' ');
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
    const matches = lookupRoleCatalog(catalog, environment, kind, name);
    if (matches.length === 0) {
      console.error('No matching object in the dated role catalog. Inspect current migrations/live schema.');
      process.exitCode = 2;
    } else {
      console.log(JSON.stringify({ observedDate: catalog.observedDate, environment, kind, matches }, null, 2));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
