type JsonObject = Record<string, unknown>;

export type MobileCompatibilityChange = {
  path: string;
  normalization:
    | "trim_identifier"
    | "numeric_string_to_integer"
    | "missing_error_to_null"
    | "empty_error_to_null"
    | "boolean_string_to_boolean"
    | "apple_yes_no_to_boolean";
};

export type MobileCompatibilityResult = {
  value: unknown;
  changes: MobileCompatibilityChange[];
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trimIdentifier(
  target: JsonObject,
  key: "source" | "kind",
  path: string,
  changes: MobileCompatibilityChange[],
): void {
  const value = target[key];
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (trimmed === value) return;
  target[key] = trimmed;
  changes.push({ path: `${path}.${key}`, normalization: "trim_identifier" });
}

function normalizeBoolean(
  target: JsonObject,
  key: string,
  path: string,
  changes: MobileCompatibilityChange[],
): void {
  const value = target[key];
  if (value !== "true" && value !== "false") return;
  target[key] = value === "true";
  changes.push({
    path: `${path}.${key}`,
    normalization: "boolean_string_to_boolean",
  });
}

function normalizeReminderBoolean(
  target: JsonObject,
  key: string,
  path: string,
  changes: MobileCompatibilityChange[],
): void {
  normalizeBoolean(target, key, path, changes);
  const value = target[key];
  if (typeof value !== "string" || !/^(yes|no)$/i.test(value)) return;
  target[key] = value.toLowerCase() === "yes";
  changes.push({
    path: `${path}.${key}`,
    normalization: "apple_yes_no_to_boolean",
  });
}

/**
 * Applies only the documented, field-specific iOS Shortcuts compatibility
 * conversions. The returned value must still pass the strict canonical schema.
 */
export function normalizeMobileShortcutEnvelope(
  input: unknown,
): MobileCompatibilityResult {
  const changes: MobileCompatibilityChange[] = [];
  if (!isObject(input)) return { value: input, changes };

  // JSON input is detached from application state, but copy the traversed
  // containers so the normalizer remains deterministic and side-effect free.
  const envelope: JsonObject = { ...input };

  if (Array.isArray(input.sources)) {
    envelope.sources = input.sources.map((source, index) => {
      if (!isObject(source)) return source;
      const normalized = { ...source };
      const path = `sources.${index}`;
      trimIdentifier(normalized, "source", path, changes);
      normalizeBoolean(normalized, "requested", path, changes);
      normalizeBoolean(normalized, "captured", path, changes);

      if (
        typeof normalized.record_count === "string" &&
        /^(0|[1-9]\d*)$/.test(normalized.record_count)
      ) {
        const count = Number(normalized.record_count);
        if (Number.isSafeInteger(count)) {
          normalized.record_count = count;
          changes.push({
            path: `${path}.record_count`,
            normalization: "numeric_string_to_integer",
          });
        }
      }

      if (!("error" in normalized)) {
        normalized.error = null;
        changes.push({
          path: `${path}.error`,
          normalization: "missing_error_to_null",
        });
      } else if (normalized.error === "") {
        normalized.error = null;
        changes.push({
          path: `${path}.error`,
          normalization: "empty_error_to_null",
        });
      }
      return normalized;
    });
  }

  if (Array.isArray(input.records)) {
    envelope.records = input.records.map((record, index) => {
      if (!isObject(record)) return record;
      const normalized = { ...record };
      const path = `records.${index}`;
      trimIdentifier(normalized, "source", path, changes);
      trimIdentifier(normalized, "kind", path, changes);
      if (isObject(record.payload)) {
        const payload = { ...record.payload };
        normalized.payload = payload;
        if (
          normalized.source === "reminders" && normalized.kind === "reminder"
        ) {
          for (
            const key of ["is_completed", "is_flagged", "has_subtasks"]
          ) {
            normalizeReminderBoolean(payload, key, `${path}.payload`, changes);
          }
        } else if (
          normalized.source === "calendar" &&
          normalized.kind === "calendar_event"
        ) {
          normalizeBoolean(payload, "all_day", `${path}.payload`, changes);
        }
      }
      return normalized;
    });
  }

  return { value: envelope, changes };
}
