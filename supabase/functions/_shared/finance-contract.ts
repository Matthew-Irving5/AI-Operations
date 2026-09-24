export type FinanceRow = {
  externalId: string;
  transactionDate: string;
  description: string;
  amount: string;
  amountMinor: bigint;
};

export type FinanceClose = {
  periodStart: string;
  periodEnd: string;
  closeKind: "monthly" | "quarterly";
  readiness: "ready" | "blocked";
  reconciled: boolean;
  blockers: string[];
  amountTotalMinor: bigint;
  calculatedClosingMinor: bigint | null;
};

const moneyPattern = /^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function parseMoneyToMinorUnits(value: string): bigint | null {
  const trimmed = value.trim();
  if (!moneyPattern.test(trimmed)) return null;
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole, fraction = ""] = unsigned.split(".");
  const minor = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  return negative ? -minor : minor;
}

export function minorUnitsToString(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fraction}`;
}

function splitCsvLine(line: string): string[] | null {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      fields.push(field.trim());
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) return null;
  fields.push(field.trim());
  return fields;
}

export function parseFinanceCsv(csv: string):
  | { rows: FinanceRow[] }
  | {
    code: "unsupported_statement_format" | "statement_parse_failed";
    detail: string;
  } {
  const lines = csv.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const header = splitCsvLine(lines[0] ?? "");
  if (
    !header ||
    header.map((item) => item.toLowerCase()).join(",") !==
      "id,date,description,amount"
  ) {
    return {
      code: "unsupported_statement_format",
      detail: "The first row must contain exactly: id,date,description,amount.",
    };
  }
  const rows: FinanceRow[] = [];
  const externalIds = new Set<string>();
  for (let index = 1; index < lines.length; index += 1) {
    if (!lines[index]?.trim()) continue;
    const fields = splitCsvLine(lines[index]);
    const amount = fields?.[3] ?? "";
    const amountMinor = parseMoneyToMinorUnits(amount);
    const date = fields?.[1] ?? "";
    if (
      !fields || fields.length !== 4 || !fields[0] || !datePattern.test(date) ||
      Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || !fields[2] ||
      amountMinor === null || amountMinor === 0n
    ) {
      return {
        code: "statement_parse_failed",
        detail: `Row ${
          index + 1
        } must contain a non-empty id, ISO date, description, and non-zero decimal amount with at most two decimals.`,
      };
    }
    if (externalIds.has(fields[0])) {
      return {
        code: "statement_parse_failed",
        detail: `Row ${index + 1} repeats transaction id "${
          fields[0]
        }"; every transaction id must be unique within the statement.`,
      };
    }
    externalIds.add(fields[0]);
    rows.push({
      externalId: fields[0],
      transactionDate: date,
      description: fields[2],
      amount,
      amountMinor,
    });
  }
  if (!rows.length) {
    return {
      code: "statement_parse_failed",
      detail: "The statement contains no transaction rows.",
    };
  }
  if (rows.length > 10_000) {
    return {
      code: "statement_parse_failed",
      detail: "The statement contains more than the 10,000-row safety limit.",
    };
  }
  return { rows };
}

export function deriveFinanceClose(
  rows: FinanceRow[],
  openingBalance: string | undefined,
  closingBalance: string | undefined,
): FinanceClose {
  const ordered = [...rows].sort((left, right) =>
    left.transactionDate.localeCompare(right.transactionDate)
  );
  const amountTotalMinor = rows.reduce(
    (total, row) => total + row.amountMinor,
    0n,
  );
  const openingMinor = openingBalance === undefined
    ? null
    : parseMoneyToMinorUnits(openingBalance);
  const closingMinor = closingBalance === undefined
    ? null
    : parseMoneyToMinorUnits(closingBalance);
  const blockers: string[] = [];
  if (openingBalance !== undefined && openingMinor === null) {
    blockers.push("opening_balance_invalid");
  }
  if (closingBalance !== undefined && closingMinor === null) {
    blockers.push("closing_balance_invalid");
  }
  if (openingMinor === null) blockers.push("opening_balance_missing");
  if (closingMinor === null) blockers.push("closing_balance_missing");
  const calculatedClosingMinor = openingMinor === null
    ? null
    : openingMinor + amountTotalMinor;
  const reconciled = calculatedClosingMinor !== null && closingMinor !== null &&
    calculatedClosingMinor === closingMinor;
  if (calculatedClosingMinor !== null && closingMinor !== null && !reconciled) {
    blockers.push("closing_balance_mismatch");
  }
  const first = ordered[0]?.transactionDate ?? "";
  const last = ordered.at(-1)?.transactionDate ?? first;
  const closeKind = first.slice(0, 7) === last.slice(0, 7)
    ? "monthly"
    : "quarterly";
  return {
    periodStart: first,
    periodEnd: last,
    closeKind,
    readiness: blockers.length ? "blocked" : "ready",
    reconciled,
    blockers,
    amountTotalMinor,
    calculatedClosingMinor,
  };
}

export function normalizeCategoryNames(values: string[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const name = value.trim().replace(/\s+/g, " ");
    const key = name.toLocaleLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}
