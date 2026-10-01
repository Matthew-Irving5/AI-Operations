import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyFailure, sanitize } from './qa-debug';

test('debugger classifies contract failures before generic code failures', () => {
  assert.equal(classifyFailure('Zod schema expected object received undefined'), 'CONTRACT');
});

test('debugger classifies environment failures', () => {
  assert.equal(classifyFailure('Docker ECONNREFUSED on port 54321'), 'ENVIRONMENT');
});

test('debugger redacts bearer-like secrets', () => {
  assert.equal(sanitize('password=hunter2'), 'password=[REDACTED]');
});
