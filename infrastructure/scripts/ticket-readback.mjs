import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_SECTIONS = [
  'Objective and acceptance outcomes',
  'Dependencies and relevant contracts',
  'Implementation and boundaries',
  'Local tests and commands',
  'Hosted proof and readiness',
  'Delegation and blockers',
];

export function ticketFromContext(value) {
  const match = /(?:^|[^a-z0-9])ai[-_/](\d+)(?!\d)/i.exec(value ?? '');
  return match ? 'AI-' + Number(match[1]) : null;
}

export function validateReadback(content, ticket) {
  const errors = [];
  const title = /^# Startup readback: (AI-\d+)\s*$/m.exec(content);
  if (!title || title[1] !== ticket) errors.push('Readback title must identify ' + ticket + '.');
  if (!/^Contract version: 1\s*$/m.test(content)) errors.push('Missing contract version 1.');
  const matches = [...content.matchAll(/^## (.+)\s*$/gm)];
  for (const heading of REQUIRED_SECTIONS) {
    const matching = matches.filter((match) => match[1].trim() === heading);
    if (matching.length !== 1) {
      errors.push('Expected exactly one section: ' + heading + '.');
      continue;
    }
    const match = matching[0];
    const next = matches.find((candidate) => candidate.index > match.index);
    const body = content.slice(match.index + match[0].length, next?.index ?? content.length).trim();
    if (body.length < 45)
      errors.push('Readback section needs ticket-specific detail: ' + heading + '.');
    if (/\b(?:TODO|TBD|PLACEHOLDER|FILL ME IN|TO BE DECIDED)\b/i.test(body)) {
      errors.push('Unresolved template content in: ' + heading + '.');
    }
  }
  return errors;
}

function template(ticket) {
  return [
    '# Startup readback: ' + ticket,
    'Contract version: 1',
    '',
    ...REQUIRED_SECTIONS.flatMap((heading) => [
      '## ' + heading,
      '',
      'TODO: Write a specific answer based on ' + ticket + ' and the current repository.',
      '',
    ]),
  ].join('\n');
}

export function runCli(args = process.argv.slice(2), env = process.env) {
  const action = args[0] ?? 'check';
  if (action !== 'check' && action !== 'init') {
    throw new Error('Usage: node infrastructure/scripts/ticket-readback.mjs <init|check> [AI-123]');
  }
  const explicit = args[1];
  if (explicit && !/^AI-\d+$/i.test(explicit)) throw new Error('Invalid issue ID: ' + explicit);
  const ticket =
    explicit?.toUpperCase() ??
    ticketFromContext(env.GITHUB_HEAD_REF) ??
    ticketFromContext(env.TICKET_CONTEXT) ??
    ticketFromContext(env.GITHUB_REF_NAME);
  if (!ticket) {
    if (action === 'init') throw new Error('Provide an AI-XX ticket ID to initialise a readback.');
    process.stdout.write('No AI-XX issue in PR branch/title; readback check not applicable.\n');
    return;
  }
  const target = join('docs', 'build', 'ticket-readbacks', ticket + '.md');
  if (action === 'init') {
    if (existsSync(target)) throw new Error('Refusing to overwrite readback: ' + target);
    mkdirSync(join('docs', 'build', 'ticket-readbacks'), { recursive: true });
    writeFileSync(target, template(ticket), 'utf8');
    process.stdout.write('Readback scaffold created: ' + target + '\n');
    return;
  }
  if (!existsSync(target)) {
    throw new Error(
      'Missing required ' +
        ticket +
        ' startup readback at ' +
        target +
        '. Run: node infrastructure/scripts/ticket-readback.mjs init ' +
        ticket,
    );
  }
  const errors = validateReadback(readFileSync(target, 'utf8'), ticket);
  if (errors.length) throw new Error('Ticket startup readback rejected:\n- ' + errors.join('\n- '));
  process.stdout.write('Ticket startup readback valid: ' + target + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n');
    process.exitCode = 1;
  }
}
