import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REQUIRED_SECTIONS, ticketFromContext, validateReadback } from './ticket-readback.mjs';

const DETAIL = 'Verify existing interfaces and choose the focused local tests before staging.';

function fixture(ticket = 'AI-68') {
  return [
    '# Startup readback: ' + ticket,
    'Contract version: 1',
    '',
    ...REQUIRED_SECTIONS.flatMap((section) => [
      '## ' + section,
      '',
      'Ticket ' + ticket + ': ' + DETAIL,
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
  const errors = validateReadback(fixture('AI-13'), 'AI-68');
  assert.match(errors.join(' '), /identify AI-68/);
});

test('rejects absent required sections and unresolved scaffold text', () => {
  const incomplete = fixture().replace('## Delegation and blockers', '## Notes');
  const incompleteErrors = validateReadback(incomplete, 'AI-68');
  assert.match(incompleteErrors.join(' '), /Delegation and blockers/);
  const placeholder = fixture().replace('Ticket AI-68: ', 'TODO: ');
  const placeholderErrors = validateReadback(placeholder, 'AI-68');
  assert.match(placeholderErrors.join(' '), /Unresolved template/);
});

test('rejects near-empty generic readbacks and version mismatches', () => {
  const empty = fixture().replace('Ticket AI-68: ' + DETAIL, 'Yes.');
  const emptyErrors = validateReadback(empty, 'AI-68');
  assert.match(emptyErrors.join(' '), /ticket-specific detail/);
  const malformed = fixture().replace('Contract version: 1', 'Contract version: 2');
  const versionErrors = validateReadback(malformed, 'AI-68');
  assert.match(versionErrors.join(' '), /version 1/);
});
