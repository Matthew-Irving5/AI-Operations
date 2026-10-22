import { z } from 'zod';

const allowedOwner = 'Matthew-Irving5';

function isPersonalGithubUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === '' &&
      url.pathname.startsWith(`/${allowedOwner}/`)
    );
  } catch {
    return false;
  }
}

function isPersonalRepositoryUrl(value: string, repositoryName: string): boolean {
  if (!isPersonalGithubUrl(value)) return false;
  const path = new URL(value).pathname.split('/').filter(Boolean);
  return path.length === 2 && path[0] === allowedOwner && path[1] === repositoryName;
}

function isPullRequestUrl(value: string, repositoryName: string, number: number): boolean {
  if (!isPersonalGithubUrl(value)) return false;
  return new URL(value).pathname === `/${allowedOwner}/${repositoryName}/pull/${number}`;
}

function isSafeRepositoryPath(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 500 &&
    !value.startsWith('/') &&
    !value.includes('\\') &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    !value.split('/').some((segment) => segment === '.' || segment === '..')
  );
}

function isPersonalBlobUrl(value: string, repositoryName: string, path: string): boolean {
  if (!isPersonalGithubUrl(value)) return false;
  try {
    const segments = new URL(value).pathname.split('/').filter(Boolean);
    return (
      segments.length >= 6 &&
      segments[0] === allowedOwner &&
      segments[1] === repositoryName &&
      segments[2] === 'blob' &&
      /^[a-f0-9]{40}$/i.test(segments[3] ?? '') &&
      decodeURIComponent(segments.slice(4).join('/')) === path
    );
  } catch {
    return false;
  }
}

const repositoryNameSchema = z.string().regex(/^(?!\.{1,2}$)[A-Za-z0-9_.-]{1,100}$/);
const githubEvidenceRowSchema = z.discriminatedUnion('evidence_kind', [
  z.strictObject({
    id: z.string().uuid(),
    repository_external_id: z.number().safe().int().positive(),
    repository_name: repositoryNameSchema,
    owner_login: z.literal(allowedOwner),
    evidence_kind: z.literal('repository'),
    source_url: z.string().url(),
    source_date: z.string().datetime({ offset: true }).nullable(),
    retrieved_at: z.string().datetime({ offset: true }),
    payload: z.record(z.string(), z.unknown()),
  }),
  z.strictObject({
    id: z.string().uuid(),
    repository_external_id: z.number().safe().int().positive(),
    repository_name: repositoryNameSchema,
    owner_login: z.literal(allowedOwner),
    evidence_kind: z.literal('pull_request'),
    source_url: z.string().url(),
    source_date: z.string().datetime({ offset: true }).nullable(),
    retrieved_at: z.string().datetime({ offset: true }),
    payload: z.record(z.string(), z.unknown()),
  }),
]);

const changedFileSchema = z.strictObject({
  path: z.string().min(1).max(500),
  blobUrl: z.string().url(),
  additions: z.number().safe().int().nonnegative(),
});

const pullRequestPayloadSchema = z.strictObject({
  kind: z.literal('pull_request'),
  number: z.number().safe().int().positive(),
  author: z.literal(allowedOwner),
  changedFiles: z.array(changedFileSchema).max(30),
});

const technologyCitationSchema = z.strictObject({
  evidenceId: z.string().uuid(),
  repositoryName: repositoryNameSchema,
  sourceUrl: z.string().url().refine(isPersonalGithubUrl),
  sourceDate: z.string().datetime({ offset: true }),
  retrievedAt: z.string().datetime({ offset: true }),
});

const demonstratedSkillCitationSchema = z.strictObject({
  evidenceId: z.string().uuid(),
  repositoryName: repositoryNameSchema,
  sourceUrl: z.string().url(),
  sourceDate: z.string().datetime({ offset: true }),
  retrievedAt: z.string().datetime({ offset: true }),
  changedFiles: z.array(changedFileSchema).min(1),
});

const observedTechnologySchema = z.strictObject({
  code: z.string().min(1),
  label: z.string().min(1),
  evidenceStrength: z.literal('direct-source-metadata'),
  citations: z.array(technologyCitationSchema).min(1),
});

const demonstratedSkillSchema = z.strictObject({
  code: z.string().min(1),
  label: z.string().min(1),
  evidenceStrength: z.literal('authored-source-change'),
  citations: z.array(demonstratedSkillCitationSchema).min(1),
});

const careerEvidenceSnapshotSchema = z.strictObject({
  statement: z.string().min(1),
  observedTechnologies: z.array(observedTechnologySchema),
  demonstratedSkills: z.array(demonstratedSkillSchema),
});

export type CareerEvidenceSnapshot = z.infer<typeof careerEvidenceSnapshotSchema>;
type SnapshotResult = Readonly<{ data: CareerEvidenceSnapshot | null; error: string | null }>;

function isRepositoryLanguage(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= 64 &&
    /^[\p{L}\p{N}][\p{L}\p{N}+#./ -]*$/u.test(value.trim())
  );
}

function technologyCode(value: string): string | null {
  const code = value
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, '-')
    .replace(/^-|-$/g, '');
  return code.length > 0 ? code : null;
}

function demonstratedSkillForPath(path: string): Readonly<{ code: string; label: string }> | null {
  const extension = path.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'ts':
    case 'tsx':
      return { code: 'typescript-development', label: 'TypeScript development' };
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return { code: 'javascript-development', label: 'JavaScript development' };
    case 'py':
      return { code: 'python-development', label: 'Python development' };
    case 'sql':
      return { code: 'sql-development', label: 'SQL development' };
    case 'go':
      return { code: 'go-development', label: 'Go development' };
    case 'rs':
      return { code: 'rust-development', label: 'Rust development' };
    case 'java':
      return { code: 'java-development', label: 'Java development' };
    case 'cs':
      return { code: 'csharp-development', label: 'C# development' };
    default:
      return null;
  }
}

export function buildCareerEvidenceSnapshot(value: unknown): SnapshotResult {
  const parsed = z.array(githubEvidenceRowSchema).safeParse(value);
  if (!parsed.success) {
    return { data: null, error: 'Career summary evidence failed validation.' };
  }

  const evidence = [...parsed.data].sort(
    (left, right) => Date.parse(right.retrieved_at) - Date.parse(left.retrieved_at),
  );
  const technologies = new Map<
    string,
    {
      label: string;
      citations: CareerEvidenceSnapshot['observedTechnologies'][number]['citations'];
    }
  >();
  const skills = new Map<
    string,
    {
      label: string;
      citations: CareerEvidenceSnapshot['demonstratedSkills'][number]['citations'];
    }
  >();

  for (const item of evidence) {
    if (item.evidence_kind === 'repository') {
      if (!isPersonalRepositoryUrl(item.source_url, item.repository_name)) {
        return { data: null, error: 'Career summary evidence failed validation.' };
      }
      const rawLanguage = item.payload.language;
      if (!isRepositoryLanguage(rawLanguage) || !item.source_date) continue;
      const label = rawLanguage.trim();
      const code = technologyCode(label);
      if (!code) continue;
      const existing = technologies.get(code) ?? { label, citations: [] };
      if (!existing.citations.some((citation) => citation.evidenceId === item.id)) {
        existing.citations.push({
          evidenceId: item.id,
          repositoryName: item.repository_name,
          sourceUrl: item.source_url,
          sourceDate: item.source_date,
          retrievedAt: item.retrieved_at,
        });
      }
      technologies.set(code, existing);
      continue;
    }

    if (!Object.hasOwn(item.payload, 'changedFiles')) continue;
    const pullRequest = pullRequestPayloadSchema.safeParse(item.payload);
    if (
      !pullRequest.success ||
      !item.source_date ||
      !isPullRequestUrl(item.source_url, item.repository_name, pullRequest.data.number)
    ) {
      return { data: null, error: 'Career summary evidence failed validation.' };
    }
    if (
      pullRequest.data.changedFiles.some(
        (file) =>
          !isSafeRepositoryPath(file.path) ||
          !isPersonalBlobUrl(file.blobUrl, item.repository_name, file.path),
      )
    ) {
      return { data: null, error: 'Career summary evidence failed validation.' };
    }
    const supportedFiles = pullRequest.data.changedFiles.filter(
      (file) => file.additions > 0 && demonstratedSkillForPath(file.path) !== null,
    );
    for (const file of supportedFiles) {
      const skill = demonstratedSkillForPath(file.path);
      if (!skill) continue;
      const existing = skills.get(skill.code) ?? { label: skill.label, citations: [] };
      const citation = {
        evidenceId: item.id,
        repositoryName: item.repository_name,
        sourceUrl: item.source_url,
        sourceDate: item.source_date,
        retrievedAt: item.retrieved_at,
        changedFiles: [file],
      };
      const existingCitation = existing.citations.find((current) => current.evidenceId === item.id);
      if (existingCitation) {
        if (!existingCitation.changedFiles.some((current) => current.blobUrl === file.blobUrl)) {
          existingCitation.changedFiles.push(file);
        }
      } else {
        existing.citations.push(citation);
      }
      skills.set(skill.code, existing);
    }
  }

  const observedTechnologies = [...technologies.entries()]
    .sort(([, left], [, right]) => left.label.localeCompare(right.label))
    .map(([code, item]) => ({
      code,
      label: item.label,
      evidenceStrength: 'direct-source-metadata' as const,
      citations: item.citations,
    }));
  const demonstratedSkills = [...skills.entries()]
    .sort(([, left], [, right]) => left.label.localeCompare(right.label))
    .map(([code, item]) => ({
      code,
      label: item.label,
      evidenceStrength: 'authored-source-change' as const,
      citations: item.citations,
    }));

  if (observedTechnologies.length === 0 && demonstratedSkills.length === 0) {
    return { data: null, error: null };
  }

  const statements: string[] = [];
  if (observedTechnologies.length > 0) {
    statements.push(
      `Connected personal repositories list ${observedTechnologies.map((item) => item.label).join(', ')} in their primary-language metadata. This shows observed technology only, not proficiency.`,
    );
  }
  if (demonstratedSkills.length > 0) {
    statements.push(
      `Authored, merged pull requests include added source files supporting ${demonstratedSkills.map((item) => item.label).join(', ')}. These citations show specific code contributions, not proficiency.`,
    );
  } else {
    statements.push('Current sync evidence does not support a demonstrated-skill claim.');
  }

  const snapshot = careerEvidenceSnapshotSchema.safeParse({
    statement: statements.join(' '),
    observedTechnologies,
    demonstratedSkills,
  });
  return snapshot.success
    ? { data: snapshot.data, error: null }
    : { data: null, error: 'Career summary evidence failed validation.' };
}
