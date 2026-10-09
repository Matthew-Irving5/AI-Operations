import { expect, it } from 'vitest';
import { buildAgentRuntimeFixture } from './agent-runtime';
import { syntheticPrimaryUser } from './index';
it('contains only a synthetic fixture identity', () =>
  expect(syntheticPrimaryUser.id).toMatch(/^00000000/));

it('builds a complete non-personal canonical conversation chain with matching evidence links', () => {
  const fixture = buildAgentRuntimeFixture(
    '00000000-0000-4000-8000-000000000101',
    new Date('2026-10-09T12:00:00.000Z'),
  );

  expect(fixture.conversation.metadata).toMatchObject({ fixture: 'ai14-live-e2e' });
  expect(fixture.message.bodySha256).toMatch(/^[a-f0-9]{64}$/);
  expect(fixture.handoff).toMatchObject({ status: 'requested', fromManagerCode: 'systems' });
  expect(fixture.attention.evidenceReferenceIds).toContain(fixture.evidence.id);
  expect(fixture.action).toMatchObject({
    authority: 'verified_user',
    status: 'proposed',
    approvalState: 'not_required',
  });
  expect(fixture.evidenceLinks.map((link) => link.entityId)).toEqual([
    fixture.conversation.id,
    fixture.message.id,
    fixture.handoff.id,
    fixture.attention.id,
    fixture.action.id,
  ]);
  expect(new Set(fixture.evidenceLinks.map((link) => link.entityType)).size).toBe(5);
  expect(
    buildAgentRuntimeFixture(
      '00000000-0000-4000-8000-000000000101',
      new Date('2026-10-09T12:01:00.000Z'),
      fixture.fixtureKey,
    ).conversation.id,
  ).toBe(fixture.conversation.id);
});
