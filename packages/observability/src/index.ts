import {
  freshnessEvaluationInputSchema,
  type FreshnessEvaluationInput,
  type FreshnessState,
} from '@ai-operations/contracts';

const sensitiveKey =
  /password|secret|token|authorization|cookie|credential|api.?key|private.?key|prompt(?:[_-]?(?:text|content|body))?$|response(?:[_-]?(?:text|content|body))?$|payload|health|finance|bank|transaction|statement|address|medical|attachment|email|phone|birth|calendar|career|purchase|account|identity/i;
const inlineSecretPatterns = [
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /\b(?:sk-(?:proj-)?|sk_(?:live|test)_|github_pat_|gh[pousr]_)[A-Za-z0-9_-]{16,}\b/g,
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password)\s*[:=]\s*["']?[^&\s"',]+/gi,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
];

function redactString(value: string): string {
  return inlineSecretPatterns.reduce(
    (redacted, pattern) => redacted.replace(pattern, '[REDACTED]'),
    value,
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function redactRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      sensitiveKey.test(key) ? '[REDACTED]' : redactValue(value),
    ]),
  );
}

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (isPlainRecord(value)) return redactRecord(value);
  return value;
}

/** Redacts sensitive fields at every nesting level and credential-shaped strings. */
export function redactTraceFields(input: Record<string, unknown>): Record<string, unknown> {
  return redactRecord(input);
}

export function evaluateFreshnessState(input: FreshnessEvaluationInput): FreshnessState {
  const value = freshnessEvaluationInputSchema.parse(input);
  if (
    value.sourceState === 'error' ||
    value.sourceState === 'reauthentication_required' ||
    value.sourceState === 'not_connected' ||
    value.sourceState === 'degraded'
  ) {
    return 'degraded';
  }
  if (value.sourceState === 'stale') return 'stale';
  if (value.sourceState === 'unknown') return 'unknown';
  if (value.lastSuccessAt === null || value.lastSourceAt === null) return 'unknown';

  const now = Date.parse(value.now);
  const lastSuccess = Date.parse(value.lastSuccessAt);
  const lastSource = Date.parse(value.lastSourceAt);
  if (lastSuccess > now || lastSource > now) return 'degraded';

  const newestRequiredTimestamp = Math.min(lastSuccess, lastSource);
  const ageMilliseconds = now - newestRequiredTimestamp;
  return ageMilliseconds >= value.expectedCadenceSeconds * 1_000 ? 'stale' : 'fresh';
}
