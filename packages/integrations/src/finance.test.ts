import { expect, it } from 'vitest';
import { financeTransactionHash, parseFinanceCsv } from './finance';

it('parses strict CSV finance fixtures using integer minor units', () => {
  const transactions = parseFinanceCsv(
    'id,date,description,amount\na,2026-08-01,Salary,1000.50\nb,2026-08-02,Rent,-750',
    'GBP',
  );
  expect(transactions.map((item) => item.amountMinor)).toEqual([100050, -75000]);
  expect(financeTransactionHash(transactions[0]!)).toMatch(/^[a-f0-9]{64}$/);
});

it('rejects malformed headers, decimals, and currencies', () => {
  expect(() => parseFinanceCsv('date,amount\n2026-08-01,1', 'GBP')).toThrow(
    'finance_csv_header_invalid',
  );
  expect(() => parseFinanceCsv('id,date,description,amount\na,2026-08-01,X,1.234', 'GBP')).toThrow(
    'finance_amount_invalid',
  );
  expect(() => parseFinanceCsv('id,date,description,amount\na,2026-08-01,X,1', 'gbp')).toThrow(
    'finance_currency_invalid',
  );
});
