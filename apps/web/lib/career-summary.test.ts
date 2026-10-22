import { describe, expect, it } from 'vitest';
import { buildCareerEvidenceSnapshot } from './career-summary';

function repositoryEvidence(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a8f4684d-cb14-4c18-b850-6557533bd3b0',
    repository_external_id: 35,
    repository_name: 'synthetic-career-project',
    owner_login: 'Matthew-Irving5',
    evidence_kind: 'repository',
    source_url: 'https://github.com/Matthew-Irving5/synthetic-career-project',
    source_date: '2026-10-20T10:00:00.000Z',
    retrieved_at: '2026-10-21T10:00:00.000Z',
    payload: { language: 'TypeScript' },
    ...overrides,
  };
}

function pullRequestEvidence(overrides: Record<string, unknown> = {}) {
  return {
    id: '9ccaa778-883b-43b7-9417-50deafedbd9e',
    repository_external_id: 35,
    repository_name: 'synthetic-career-project',
    owner_login: 'Matthew-Irving5',
    evidence_kind: 'pull_request',
    source_url: 'https://github.com/Matthew-Irving5/synthetic-career-project/pull/17',
    source_date: '2026-10-19T12:00:00.000Z',
    retrieved_at: '2026-10-21T10:00:00.000Z',
    payload: {
      kind: 'pull_request',
      number: 17,
      author: 'Matthew-Irving5',
      changedFiles: [
        {
          path: 'src/feature.ts',
          blobUrl:
            'https://github.com/Matthew-Irving5/synthetic-career-project/blob/cccccccccccccccccccccccccccccccccccccccc/src/feature.ts',
          additions: 12,
        },
      ],
    },
    ...overrides,
  };
}

describe('buildCareerEvidenceSnapshot', () => {
  it('creates direct technology observations with dated source links', () => {
    const second = repositoryEvidence({
      id: 'ecb34f95-2cbd-4c61-90b8-9e743a38571d',
      repository_external_id: 36,
      repository_name: 'synthetic-api',
      source_url: 'https://github.com/Matthew-Irving5/synthetic-api',
      source_date: '2026-10-19T10:00:00.000Z',
      payload: { language: 'typescript' },
    });

    const result = buildCareerEvidenceSnapshot([repositoryEvidence(), second]);

    expect(result.error).toBeNull();
    expect(result.data?.observedTechnologies).toHaveLength(1);
    expect(result.data?.observedTechnologies[0]).toMatchObject({
      code: 'typescript',
      label: 'TypeScript',
      evidenceStrength: 'direct-source-metadata',
      citations: [
        {
          repositoryName: 'synthetic-career-project',
          sourceUrl: 'https://github.com/Matthew-Irving5/synthetic-career-project',
          sourceDate: '2026-10-20T10:00:00.000Z',
        },
        {
          repositoryName: 'synthetic-api',
          sourceUrl: 'https://github.com/Matthew-Irving5/synthetic-api',
          sourceDate: '2026-10-19T10:00:00.000Z',
        },
      ],
    });
    expect(result.data?.statement).toContain('does not support a demonstrated-skill claim');
    expect(result.data?.demonstratedSkills).toEqual([]);
  });

  it('does not infer a skill without dated language metadata', () => {
    const withoutLanguage = repositoryEvidence({ payload: {} });
    const undated = repositoryEvidence({
      id: 'ecb34f95-2cbd-4c61-90b8-9e743a38571d',
      source_date: null,
    });

    expect(buildCareerEvidenceSnapshot([withoutLanguage, undated])).toEqual({
      data: null,
      error: null,
    });
  });

  it('never promotes language-only evidence to a demonstrated skill', () => {
    const result = buildCareerEvidenceSnapshot([repositoryEvidence()]);

    expect(result.data?.demonstratedSkills).toEqual([]);
    expect(result.data?.observedTechnologies).toHaveLength(1);
  });

  it('derives a demonstrated skill from an authored merged change with exact file and PR evidence', () => {
    const result = buildCareerEvidenceSnapshot([pullRequestEvidence()]);

    expect(result.error).toBeNull();
    expect(result.data?.demonstratedSkills).toMatchObject([
      {
        code: 'typescript-development',
        label: 'TypeScript development',
        evidenceStrength: 'authored-source-change',
        citations: [
          {
            sourceUrl: 'https://github.com/Matthew-Irving5/synthetic-career-project/pull/17',
            sourceDate: '2026-10-19T12:00:00.000Z',
            changedFiles: [
              {
                path: 'src/feature.ts',
                blobUrl:
                  'https://github.com/Matthew-Irving5/synthetic-career-project/blob/cccccccccccccccccccccccccccccccccccccccc/src/feature.ts',
                additions: 12,
              },
            ],
          },
        ],
      },
    ]);
    expect(result.data?.statement).toContain('not proficiency');
  });

  it('does not claim a skill from a documentation-only or deletion-only pull request', () => {
    const docsOnly = pullRequestEvidence({
      payload: {
        kind: 'pull_request',
        number: 17,
        author: 'Matthew-Irving5',
        changedFiles: [
          {
            path: 'README.md',
            blobUrl:
              'https://github.com/Matthew-Irving5/synthetic-career-project/blob/cccccccccccccccccccccccccccccccccccccccc/README.md',
            additions: 12,
          },
        ],
      },
    });
    const deletionOnly = pullRequestEvidence({
      payload: {
        kind: 'pull_request',
        number: 17,
        author: 'Matthew-Irving5',
        changedFiles: [
          {
            path: 'src/feature.ts',
            blobUrl:
              'https://github.com/Matthew-Irving5/synthetic-career-project/blob/cccccccccccccccccccccccccccccccccccccccc/src/feature.ts',
            additions: 0,
          },
        ],
      },
    });

    expect(buildCareerEvidenceSnapshot([docsOnly]).data?.demonstratedSkills ?? []).toEqual([]);
    expect(buildCareerEvidenceSnapshot([deletionOnly]).data?.demonstratedSkills ?? []).toEqual([]);
  });

  it('rejects an authored change link outside the allowlisted personal repository', () => {
    const result = buildCareerEvidenceSnapshot([
      pullRequestEvidence({
        payload: {
          kind: 'pull_request',
          number: 17,
          author: 'Matthew-Irving5',
          changedFiles: [
            {
              path: 'src/feature.ts',
              blobUrl:
                'https://github.com/OtherOwner/synthetic-career-project/blob/cccccccccccccccccccccccccccccccccccccccc/src/feature.ts',
              additions: 12,
            },
          ],
        },
      }),
    ]);

    expect(result).toEqual({ data: null, error: 'Career summary evidence failed validation.' });
  });

  it('ignores legacy pull-request rows that have no changed-file evidence', () => {
    const result = buildCareerEvidenceSnapshot([
      pullRequestEvidence({
        payload: { kind: 'pull_request', number: 17, author: 'Matthew-Irving5' },
      }),
    ]);

    expect(result).toEqual({ data: null, error: null });
  });

  it('keeps language labels with symbols distinct', () => {
    const result = buildCareerEvidenceSnapshot([
      repositoryEvidence({ payload: { language: 'C' } }),
      repositoryEvidence({
        id: 'ecb34f95-2cbd-4c61-90b8-9e743a38571d',
        repository_name: 'synthetic-cpp',
        source_url: 'https://github.com/Matthew-Irving5/synthetic-cpp',
        payload: { language: 'C++' },
      }),
    ]);

    expect(result.data?.observedTechnologies.map((technology) => technology.code)).toEqual([
      'c',
      'c++',
    ]);
  });

  it('rejects evidence whose repository URL does not match the personal owner and repo', () => {
    const result = buildCareerEvidenceSnapshot([
      repositoryEvidence({ source_url: 'https://github.com/OtherOwner/synthetic-career-project' }),
    ]);

    expect(result).toEqual({ data: null, error: 'Career summary evidence failed validation.' });
  });

  it('rejects a source URL that names a different repository', () => {
    const result = buildCareerEvidenceSnapshot([
      repositoryEvidence({ source_url: 'https://github.com/Matthew-Irving5/other-repo' }),
    ]);

    expect(result).toEqual({ data: null, error: 'Career summary evidence failed validation.' });
  });

  it('rejects repository evidence with an invalid source date before making an observation', () => {
    const result = buildCareerEvidenceSnapshot([repositoryEvidence({ source_date: 'yesterday' })]);

    expect(result).toEqual({ data: null, error: 'Career summary evidence failed validation.' });
  });
});
