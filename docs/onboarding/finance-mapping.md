# Finance mapping acceptance runbook

Use this runbook for the `finance_mapping` Settings checklist item. Schedules
must remain disabled. Use a harmless synthetic CSV; do not paste bank
credentials or an unrestricted export into the browser.

## Configure the mapping

1. Open **Finance** and enter the institution, account label, account type,
   and `GBP` (or the real account currency).
2. Enter one category per line, for example `Salary`, `Groceries`, and
   `Transport`.
3. Select **Controlled CSV upload**. A Google Sheet option is available only
   for an approved read-only source and requires its spreadsheet ID.
4. Click **Save mapping**. A successful response shows the account ID,
   category count, and source kind. If it fails, copy the complete diagnostic:
   `code`, `stage`, HTTP status, request ID, detail, and remediation. That
   identifies the exact boundary; do not retry blindly after an archive error.

## Import the bounded fixture

Create a CSV with this exact header and rows:

```csv
id,date,description,amount
fixture-001,2026-09-01,Salary,100.00
fixture-002,2026-09-05,Groceries,-25.00
fixture-003,2026-09-12,Transport,-10.00
```

Use opening balance `100.00` and closing balance `165.00`; the expected net
movement is `65.00`. Select the mapped account, provide a statement name, and
click **Import statement**. Success requires:

- the response says the statement is parsed;
- three transactions are stored;
- the close is `ready` and `reconciled`;
- the calculated closing balance is `165.00`;
- no absolute local path or secret appears in the result.

Uploading the same bytes again must return `finance_statement_replay` and the
original statement ID, with no duplicate transactions. A wrong closing
balance returns a precise reconciliation diagnostic and leaves the checklist
locked.

## Complete the checklist

Open **Settings** and refresh the checklist state. The Finance checkbox is
disabled until the server has verified the active account, categories, parsed
statement, transaction count, and reconciled close period. Once enabled, click
it once. The stored checklist metadata must contain the evidence IDs and
verification time; a manually forced checkbox or an unverified success page
does not count.
