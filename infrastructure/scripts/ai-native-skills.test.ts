import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const skills = [
  'ai-operations-investigate',
  'ai-operations-debug',
  'ai-operations-ship',
  'ai-operations-handoff',
];

test('all agent-native skill entrypoints are discoverable and uniquely named', () => {
  const names = new Set<string>();
  for (const skill of skills) {
    const file = join('.agents', 'skills', skill, 'SKILL.md');
    const source = readFileSync(file, 'utf8');
    assert.match(source, /^---\nname: [a-z][a-z0-9-]+\ndescription: .+\n---\n/m, file);
    assert.match(source, new RegExp('^name: ' + skill + '$', 'm'), file);
    assert.ok(source.length > 250, file);
    assert.doesNotMatch(source, /(?:TODO|TBD|PLACEHOLDER|SKIP ALL TESTS)/i, file);
    names.add(skill);
  }
  assert.equal(names.size, skills.length);
});

test('agent-native runbook is present and keeps release authority unchanged', () => {
  const source = readFileSync(join('docs', 'testing', 'ai-native-codex.md'), 'utf8');
  assert.match(source, /Linear remains the work queue/);
  assert.match(source, /existing.*release/i);
  assert.match(source, /automatically configure Codex Cloud/i);
});
