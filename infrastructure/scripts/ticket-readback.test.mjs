import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REQUIRED_SECTIONS, ticketFromContext, validateReadback } from './ticket-readback.mjs';

function fixture(ticket = 'AI-68') {
  return [
    '# Startup readback: ' + ticket,
    'Contract version: 1',
    '',
    ...REQUIRED_SECTIONS.flatMap((section) => [
      '## ' + section,
      '',
      'For ' +
        ticket +
        ', verify the existing baseline and interface contract first; identify a concrete narrow test before deployment.',
      '',
    ]),
  ].join('\n');
}

test('extracts ticket ID from an agent branch or PR title', () => {
  assert.equal(ticketFromContext('codex/ai-68-ticket-readback'), 'AI-68');
  assert.equal(ticketFromContext('AI-13: auth policy'), 'AI-13');
  assert.equal(ticketFromContext('codex/general-maintenance'), null);
});

test('accepts a complete ticket-specific readback', () => {
  assert.deepEqual(validateReadback(fixture(), 'AI-68'), []);
});

test('rejects a readback for a different ticket', () => {
  assert.match(validateReadback(fixture('AI-13'), 'AI-68').join(' '), /identify AI-68/);
});

test('rejects absent required sections and unresolved scaffold text', () => {
  const incomplete = fixture().replace('## Delegation and blockers', '## Notes');
  assert.match(validateReadback(incomplete, 'AI-68').join(' '), /Delegation and blockers/);
  const placeholder = fixture().replace(
    'For AI-68, verify the existing baseline',
    'TODO: verify the existing baseline',
  );
  assert.match(validateReadback(placeholder, 'AI-68').join(' '), /Unresolved template/);
});

test('rejects near-empty generic readbacks and version mismatches', () => {
  const empty = fixture().replace(/For AI-68, verify[^\n]+/, 'Yes.');
  assert.match(validateReadback(empty, 'AI-68').join(' '), /ticket-specific detail/);
  assert.match(
    validateReadback(fixture().replace('Contract version: 1', 'Contract version: 2'), 'AI-68').join(' '),
    /version 1/,
  );
});
