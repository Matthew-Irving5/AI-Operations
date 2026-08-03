import { createHash } from 'node:crypto';

export type ParsedFinanceTransaction = Readonly<{
  externalId: string;
  date: string;
  description: string;
  amountMinor: number;
  currency: string;
}>;

function moneyMinor(value: string): number {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value.trim())) throw new Error('finance_amount_invalid');
  const negative = value.trim().startsWith('-');
  const [whole, decimal = ''] = value.trim().replace('-', '').split('.');
  const minor = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor)) throw new Error('finance_amount_out_of_range');
  return negative ? -minor : minor;
}

export function parseFinanceCsv(
  csv: string,
  currency: string,
): readonly ParsedFinanceTransaction[] {
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('finance_currency_invalid');
  const [header, ...rows] = csv.trim().split(/\r?\n/);
  if (header?.trim().toLowerCase() !== 'id,date,description,amount')
    throw new Error('finance_csv_header_invalid');
  return rows.filter(Boolean).map((line) => {
    const [externalId, date, description, amount, extra] = line
      .split(',')
      .map((value) => value.trim());
    if (
      !externalId ||
      !date ||
      !description ||
      amount === undefined ||
      extra !== undefined ||
      Number.isNaN(Date.parse(`${date}T00:00:00Z`))
    ) {
      throw new Error('finance_csv_row_invalid');
    }
    return { externalId, date, description, amountMinor: moneyMinor(amount), currency };
  });
}

export function financeTransactionHash(transaction: ParsedFinanceTransaction): string {
  return createHash('sha256')
    .update(
      [
        transaction.externalId,
        transaction.date,
        transaction.description,
        transaction.amountMinor,
        transaction.currency,
      ].join('\u0000'),
    )
    .digest('hex');
}
