import assert from 'node:assert/strict';
import test from 'node:test';
import { googleFreshnessSql, readGoogleStagingFreshness } from './google-staging-reader';
const user = '00000000-0000-4000-8000-000000000001';
test('Google freshness reader is owner scoped, fixed-column, bounded and injection safe', () => {
  assert.match(
    googleFreshnessSql(user),
    /select source,state,last_success_at.*user_id = '00000000-0000-4000-8000-000000000001'::uuid.*source = 'google_drive' limit 2/,
  );
  assert.throws(() => googleFreshnessSql("' or true --"));
});
test('Google freshness reader rejects non-staging before provider work', async () => {
  let called = false;
  await assert.rejects(
    readGoogleStagingFreshness(user, {}, async () => {
      called = true;
      throw new Error('unexpected');
    }),
  );
  assert.equal(called, false);
});
test('Google freshness reader uses read-only management endpoint and validates rows', async () => {
  const environment = {
    STAGING_PROJECT_REF: 'jqtssfrfocnibffdkqch',
    STAGING_PROJECT_URL: 'https://jqtssfrfocnibffdkqch.supabase.co',
    STAGING_PERSONAL_ACCESS_TOKEN: 'fixture',
  };
  const rows = await readGoogleStagingFreshness(user, environment, async (url, init) => {
    assert.equal(
      String(url),
      'https://api.supabase.com/v1/projects/jqtssfrfocnibffdkqch/database/query/read-only',
    );
    assert.equal(JSON.parse(String(init?.body)).query, googleFreshnessSql(user));
    return Response.json([{ source: 'google_drive', state: 'fresh', last_success_at: null }]);
  });
  assert.equal(rows.length, 1);
  await assert.rejects(
    readGoogleStagingFreshness(user, environment, async () =>
      Response.json([{ source: 'unrelated', state: 'fresh', last_success_at: null }]),
    ),
  );
});
