import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { catalogPath, lookupRoleCatalog } from './platform-role-lookup.mjs';

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));

test('role catalog has the observed environment scope and explicit protected grants', () => {
  assert.equal(catalog.observedDate, '2026-11-11');
  const [actions] = lookupRoleCatalog(catalog, 'production', 'table', 'actions');
  const [workflowRuns] = lookupRoleCatalog(catalog, 'staging', 'table', 'workflow_runs');
  assert.equal(actions.service_select, false);
  assert.equal(actions.service_insert, true);
  assert.equal(workflowRuns.service_insert, false);
  assert.equal(workflowRuns.rls, true);
});

test('RPC lookup finds relevant overload without confusing production with staging', () => {
  const prod = lookupRoleCatalog(catalog, 'production', 'rpc', 'add_model_pricing');
  const staging = lookupRoleCatalog(catalog, 'staging', 'rpc', 'add_model_pricing');
  assert.equal(prod.length, 1);
  assert.equal(staging.length, 1);
  assert.equal(prod[0].signature.includes('p_web_search_per_call'), false);
  assert.equal(staging[0].signature.includes('p_web_search_per_call'), true);
});

test('unsupported environments and types fail closed', () => {
  assert.throws(() => lookupRoleCatalog(catalog, 'prod', 'table', 'actions'));
  assert.throws(() => lookupRoleCatalog(catalog, 'production', 'function', 'add_model_pricing'));
  assert.throws(() => lookupRoleCatalog(catalog, 'staging', 'table', ''));
});
