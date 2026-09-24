'use client';

import type { ChangeEvent, FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Account = {
  id: string;
  institution_name: string;
  account_label: string;
  account_type: string;
  currency: string;
  active: boolean;
};
type Category = { id: string; name: string; active: boolean };
type Adapter = { id: string; spreadsheet_external_id: string; read_only: true };
type DiagnosticPayload = {
  code?: string;
  requestId?: string;
  diagnostic?: {
    code?: string;
    stage?: string;
    httpStatus?: number;
    requestId?: string;
    detail?: string;
    remediation?: string;
  };
};

const sampleCsv = [
  'id,date,description,amount',
  'fixture-001,2026-09-01,Salary,100.00',
  'fixture-002,2026-09-05,Groceries,-25.00',
  'fixture-003,2026-09-12,Transport,-10.00',
].join('\n');

function errorText(payload: DiagnosticPayload | null, status: number, fallback: string) {
  const diagnostic = payload?.diagnostic;
  return [
    `${diagnostic?.code ?? payload?.code ?? fallback} · ${diagnostic?.stage ?? 'unknown'} · HTTP ${diagnostic?.httpStatus ?? status} · request ${diagnostic?.requestId ?? payload?.requestId ?? 'unknown'}`,
    diagnostic?.detail ?? 'No diagnostic detail was returned.',
    diagnostic?.remediation ?? 'Retry only after correcting the named boundary.',
  ].join(' — ');
}

export default function FinanceMappingForm({
  accounts,
  categories,
  adapters,
}: Readonly<{ accounts: Account[]; categories: Category[]; adapters: Adapter[] }>) {
  const router = useRouter();
  const existing = accounts.find((account) => account.active) ?? accounts[0];
  const [institutionName, setInstitutionName] = useState(existing?.institution_name ?? '');
  const [accountLabel, setAccountLabel] = useState(existing?.account_label ?? '');
  const [accountType, setAccountType] = useState(existing?.account_type ?? 'bank');
  const [currency, setCurrency] = useState(existing?.currency ?? 'GBP');
  const [categoryText, setCategoryText] = useState(categories.map((item) => item.name).join('\n'));
  const [sourceKind, setSourceKind] = useState<'upload' | 'google_sheet'>('upload');
  const [spreadsheetExternalId, setSpreadsheetExternalId] = useState('');
  const [accountId, setAccountId] = useState(existing?.id ?? '');
  const [statementName, setStatementName] = useState('finance-controlled-fixture.csv');
  const [csv, setCsv] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [closingBalance, setClosingBalance] = useState('');
  const [busy, setBusy] = useState<'configure' | 'import' | null>(null);
  const [message, setMessage] = useState('');
  const [reauthRequired, setReauthRequired] = useState(false);
  const categoryNames = useMemo(
    () =>
      categoryText
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    [categoryText],
  );

  async function configure(event: FormEvent) {
    event.preventDefault();
    setBusy('configure');
    setReauthRequired(false);
    setMessage('Saving account, category, and source mapping…');
    try {
      const response = await fetch('/api/finance/configure', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          account: { institutionName, accountLabel, accountType, currency },
          categories: categoryNames,
          source: {
            kind: sourceKind,
            ...(sourceKind === 'google_sheet' ? { spreadsheetExternalId } : {}),
          },
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (DiagnosticPayload & { accountId?: string; categoryCount?: number })
        | null;
      if (!response.ok) {
        setReauthRequired(
          payload?.code === 'fresh_mfa_required' ||
            payload?.diagnostic?.code === 'fresh_mfa_required',
        );
        setMessage(errorText(payload, response.status, 'finance_configuration_failed'));
        return;
      }
      if (!payload?.accountId) {
        setMessage(
          'finance_configuration_invalid_response · persistence.response · HTTP 502 · request unknown — The server did not return the mapped account ID. Do not import until this is corrected.',
        );
        return;
      }
      setAccountId(payload.accountId);
      setMessage(
        `Mapping saved: ${payload.categoryCount ?? categoryNames.length} categories. No provider credentials were stored.`,
      );
      router.refresh();
    } catch {
      setMessage(
        'finance_configuration_network_failed · control_plane.network · HTTP 502 · request unavailable — The mapping request could not reach the server. Retry once; no mapping was confirmed.',
      );
    } finally {
      setBusy(null);
    }
  }

  async function importStatement(event: FormEvent) {
    event.preventDefault();
    setBusy('import');
    setReauthRequired(false);
    setMessage('Validating, archiving, parsing, and reconciling the statement…');
    try {
      const response = await fetch('/api/finance/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId,
          currency,
          statementName,
          csv,
          ...(openingBalance ? { openingBalance } : {}),
          ...(closingBalance ? { closingBalance } : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (DiagnosticPayload & {
            imported?: boolean;
            replay?: boolean;
            transactionCount?: number;
            close?: { readiness?: string; reconciled?: boolean };
          })
        | null;
      if (!response.ok) {
        setReauthRequired(
          payload?.code === 'fresh_mfa_required' ||
            payload?.diagnostic?.code === 'fresh_mfa_required',
        );
        setMessage(errorText(payload, response.status, 'finance_import_failed'));
        return;
      }
      if (payload?.replay) {
        setMessage(
          'finance_statement_replay · persistence.statement_duplicate_check · HTTP 200 — This exact statement was already imported; no duplicate transactions were created. Review the existing close state.',
        );
      } else {
        setMessage(
          `Import complete: ${payload?.transactionCount ?? 0} transactions; close ${payload?.close?.readiness ?? 'unknown'}${payload?.close?.reconciled ? ' and reconciled' : ''}. Re-uploading the same file will be rejected as a replay.`,
        );
        setCsv('');
      }
      router.refresh();
    } catch {
      setMessage(
        'finance_import_network_failed · control_plane.network · HTTP 502 · request unavailable — The statement was not confirmed as submitted. Retry once only after checking the Finance page state.',
      );
    } finally {
      setBusy(null);
    }
  }

  async function loadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) {
      setMessage(
        'statement_file_too_large · request.file_validation · HTTP 413 · request local — The selected file exceeds the 1 MB safety limit. Choose a smaller controlled CSV.',
      );
      return;
    }
    setStatementName(file.name);
    setCsv(await file.text());
    setMessage(`Loaded ${file.name} into the unsaved form only. It has not been uploaded.`);
  }

  return (
    <section className="stack" aria-label="Finance source mapping and controlled import">
      <article className="card profile-hero">
        <p className="eyebrow">Evidence-gated finance setup</p>
        <h2>Map the source before importing</h2>
        <p className="profile-helper">
          This flow never asks for bank credentials. Account/category mapping is server-side and
          every statement is archived before parsing. The CSV remains only in this tab until you
          submit it and is cleared after a successful import.
        </p>
      </article>
      <form className="card stack profile-section" onSubmit={configure}>
        <fieldset className="stack">
          <legend>1. Account and categories</legend>
          <div className="grid">
            <label>
              Institution
              <input
                value={institutionName}
                onChange={(event) => setInstitutionName(event.target.value)}
                required
              />
            </label>
            <label>
              Account label
              <input
                value={accountLabel}
                onChange={(event) => setAccountLabel(event.target.value)}
                required
              />
            </label>
            <label>
              Account type
              <select value={accountType} onChange={(event) => setAccountType(event.target.value)}>
                <option value="bank">Bank</option>
                <option value="credit">Credit</option>
                <option value="cash">Cash</option>
                <option value="savings">Savings</option>
                <option value="investment">Investment</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Currency
              <input
                value={currency}
                maxLength={3}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                required
              />
            </label>
          </div>
          <label>
            Categories, one per line
            <textarea
              value={categoryText}
              onChange={(event) => setCategoryText(event.target.value)}
              rows={6}
              placeholder={'Housing\nGroceries\nTransport\nIncome'}
              required
            />
          </label>
        </fieldset>
        <fieldset className="stack">
          <legend>2. Approved source</legend>
          <label>
            Source kind
            <select
              value={sourceKind}
              onChange={(event) => setSourceKind(event.target.value as 'upload' | 'google_sheet')}
            >
              <option value="upload">Controlled statement upload</option>
              <option value="google_sheet">Approved read-only Google Sheet</option>
            </select>
          </label>
          {sourceKind === 'google_sheet' ? (
            <label>
              Google Sheet file ID
              <input
                value={spreadsheetExternalId}
                onChange={(event) => setSpreadsheetExternalId(event.target.value)}
                required
              />
            </label>
          ) : null}
        </fieldset>
        <button type="submit" disabled={busy !== null || categoryNames.length === 0}>
          {busy === 'configure' ? 'Saving mapping…' : 'Save account and source mapping'}
        </button>
      </form>
      <form className="card stack profile-section" onSubmit={importStatement}>
        <fieldset className="stack">
          <legend>3. Controlled statement import</legend>
          <p className="profile-helper">
            Required header: <code>id,date,description,amount</code>. Amounts use decimal currency
            notation with at most two decimal places. Opening and closing balances are optional, but
            both are required for a reconciled close.
          </p>
          <label>
            Mapped account
            <select
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              required
              disabled={!accounts.length && !accountId}
            >
              {!accounts.length && !accountId ? (
                <option value="">Save a mapping first</option>
              ) : null}
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.institution_name} — {account.account_label} ({account.currency})
                </option>
              ))}
              {accountId && !accounts.some((account) => account.id === accountId) ? (
                <option value={accountId}>Newly saved account</option>
              ) : null}
            </select>
          </label>
          <label>
            CSV file (optional)
            <input type="file" accept=".csv,text/csv" onChange={loadFile} />
          </label>
          <label>
            Statement name
            <input
              value={statementName}
              onChange={(event) => setStatementName(event.target.value)}
              required
            />
          </label>
          <label>
            CSV contents
            <textarea
              value={csv}
              onChange={(event) => setCsv(event.target.value)}
              rows={8}
              placeholder={sampleCsv}
              required
            />
          </label>
          <div className="grid">
            <label>
              Opening balance
              <input
                value={openingBalance}
                onChange={(event) => setOpeningBalance(event.target.value)}
                placeholder="100.00"
                inputMode="decimal"
              />
            </label>
            <label>
              Closing balance
              <input
                value={closingBalance}
                onChange={(event) => setClosingBalance(event.target.value)}
                placeholder="165.00"
                inputMode="decimal"
              />
            </label>
          </div>
        </fieldset>
        <button type="submit" disabled={busy !== null || !accountId || !csv.trim()}>
          {busy === 'import' ? 'Importing securely…' : 'Archive and import statement'}
        </button>
      </form>
      <article className="card">
        <h3>Current mapping evidence</h3>
        <p>
          {accounts.length} account(s), {categories.length} categor
          {categories.length === 1 ? 'y' : 'ies'}, and {adapters.length} read-only sheet mapping(s).
        </p>
      </article>
      <p
        aria-live="polite"
        role={message.includes('failed') || message.includes('rejected') ? 'alert' : 'status'}
        className="notice"
      >
        {message}
      </p>
      {reauthRequired ? (
        <p className="notice">
          The form is still held in this tab. Open the fresh MFA challenge in another tab, verify
          Microsoft Authenticator, return here, and click the same button again.
          <button
            type="button"
            onClick={() => window.open('/mfa?returnTo=%2Ffinance', '_blank', 'noopener,noreferrer')}
          >
            Open fresh MFA in another tab
          </button>
        </p>
      ) : null}
    </section>
  );
}
