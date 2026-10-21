'use client';

import type { ProcurementLaunchRequest } from '@ai-operations/contracts';
import { useState } from 'react';

export function OnDemandLaunchForm({
  manager,
  initialProcurementRequest,
  initialHardCapMinor,
  initialSearchCeiling,
  initialModelCeiling,
  revisionOfResearchRunId,
}: Readonly<{
  manager: 'travel' | 'procurement';
  initialProcurementRequest?: ProcurementLaunchRequest;
  initialHardCapMinor?: number;
  initialSearchCeiling?: number;
  initialModelCeiling?: 'gpt-5.6-luna' | 'gpt-5.6-terra' | 'gpt-5.6-sol';
  revisionOfResearchRunId?: string;
}>) {
  const [status, setStatus] = useState('');
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  async function submit(formData: FormData) {
    setIsSubmitting(true);
    setIsError(false);
    setStatus('Submitting bounded research request...');
    const request =
      manager === 'procurement'
        ? {
            item: String(formData.get('item') ?? ''),
            purpose: String(formData.get('purpose') ?? ''),
            market: String(formData.get('market') ?? ''),
            currency: String(formData.get('currency') ?? 'GBP'),
            maxTotalCostMinor: Math.round(Number(formData.get('productBudget')) * 100),
            requiredBy: String(formData.get('requiredBy') ?? '') || null,
            requirements: (() => {
              const usedIds = new Set<string>();
              const idFor = (kind: 'hard' | 'preference', label: string, index: number) => {
                const prior = initialProcurementRequest?.requirements.find(
                  (requirement) =>
                    requirement.kind === kind &&
                    requirement.label === label &&
                    !usedIds.has(requirement.id),
                );
                const id =
                  prior?.id ??
                  (initialProcurementRequest ? crypto.randomUUID() : `${kind}-${index + 1}`);
                usedIds.add(id);
                return id;
              };
              return [
                ...String(formData.get('hardRequirements') ?? '')
                  .split('\n')
                  .map((label) => label.trim())
                  .filter(Boolean)
                  .map((label, index) => ({
                    id: idFor('hard', label, index),
                    label,
                    kind: 'hard' as const,
                  })),
                ...String(formData.get('preferences') ?? '')
                  .split('\n')
                  .map((label) => label.trim())
                  .filter(Boolean)
                  .map((label, index) => ({
                    id: idFor('preference', label, index),
                    label,
                    kind: 'preference' as const,
                    weight: 50,
                  })),
              ];
            })(),
            existingProducts: String(formData.get('existingProducts') ?? '')
              .split('\n')
              .map((item) => item.trim())
              .filter(Boolean),
          }
        : {
            purpose: String(formData.get('purpose') ?? ''),
            constraints: String(formData.get('constraints') ?? ''),
          };
    try {
      const response = await fetch('/api/workflows/launch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workflowCode:
            manager === 'travel' ? 'travel-on-demand-plan' : 'procurement-on-demand-research',
          managerCode: manager,
          hardCapUsd: Number(formData.get('hardCapUsd')),
          searchCeiling: Number(formData.get('searchCeiling')),
          modelCeiling: initialModelCeiling ?? 'gpt-5.6-terra',
          idempotencyKey: crypto.randomUUID(),
          ...(revisionOfResearchRunId ? { revisionOfResearchRunId } : {}),
          request,
        }),
      });
      if (response.ok) {
        setStatus(
          revisionOfResearchRunId
            ? 'Revised request queued. The previous decision remains available as history.'
            : 'Request queued. Its approved cap and brief are retained with the run.',
        );
      } else {
        setIsError(true);
        setStatus(
          response.status === 401
            ? 'Sign in again to launch research.'
            : response.status === 403
              ? 'Fresh multi-factor authentication is required to launch research.'
              : 'Request rejected. Check the required inputs, budget and search limit.',
        );
      }
    } catch {
      setIsError(true);
      setStatus('The research service could not be reached. Your request was not queued.');
    } finally {
      setIsSubmitting(false);
    }
  }
  return (
    <form className="stack card" action={submit}>
      <h2>{revisionOfResearchRunId ? 'Revise saved request' : 'Launch bounded research'}</h2>
      {manager === 'procurement' ? (
        <>
          <label>
            Item or service{' '}
            <input
              name="item"
              required
              minLength={3}
              maxLength={300}
              defaultValue={initialProcurementRequest?.item}
            />
          </label>
          <label>
            What do you need it for?{' '}
            <textarea
              name="purpose"
              required
              minLength={3}
              maxLength={2000}
              defaultValue={initialProcurementRequest?.purpose}
            />
          </label>
          <label>
            Market or country{' '}
            <input
              name="market"
              required
              defaultValue={initialProcurementRequest?.market ?? 'United Kingdom'}
              maxLength={120}
            />
          </label>
          <label>
            Currency{' '}
            <select name="currency" defaultValue={initialProcurementRequest?.currency ?? 'GBP'}>
              <option>GBP</option>
              <option>EUR</option>
              <option>USD</option>
            </select>
          </label>
          <label>
            Maximum all-in product cost{' '}
            <input
              name="productBudget"
              type="number"
              min="0.01"
              step="0.01"
              defaultValue={String((initialProcurementRequest?.maxTotalCostMinor ?? 50_000) / 100)}
              required
            />
          </label>
          <label>
            Required by (optional){' '}
            <input
              name="requiredBy"
              type="date"
              defaultValue={initialProcurementRequest?.requiredBy ?? ''}
            />
          </label>
          <label>
            Hard requirements, one per line{' '}
            <textarea
              name="hardRequirements"
              required
              minLength={3}
              maxLength={4000}
              defaultValue={initialProcurementRequest?.requirements
                .filter((requirement) => requirement.kind === 'hard')
                .map((requirement) => requirement.label)
                .join('\n')}
            />
          </label>
          <label>
            Preferences, one per line{' '}
            <textarea
              name="preferences"
              maxLength={4000}
              defaultValue={initialProcurementRequest?.requirements
                .filter((requirement) => requirement.kind === 'preference')
                .map((requirement) => requirement.label)
                .join('\n')}
            />
          </label>
          <label>
            Products or equipment you already own, one per line{' '}
            <textarea
              name="existingProducts"
              maxLength={2000}
              defaultValue={initialProcurementRequest?.existingProducts.join('\n')}
            />
          </label>
        </>
      ) : (
        <>
          <label>
            Purpose <textarea name="purpose" required minLength={3} maxLength={2000} />
          </label>
          <label>
            Constraints <textarea name="constraints" maxLength={4000} />
          </label>
        </>
      )}
      <label>
        Hard cap (USD){' '}
        <input
          name="hardCapUsd"
          type="number"
          min="0.01"
          max="1000"
          step="0.01"
          defaultValue={String((initialHardCapMinor ?? 200) / 100)}
          required
        />
      </label>
      <label>
        Search ceiling{' '}
        <input
          name="searchCeiling"
          type="number"
          min={manager === 'procurement' ? 1 : 0}
          max="20"
          defaultValue={initialSearchCeiling ?? 10}
          required
        />
      </label>
      {initialModelCeiling ? <p>Model ceiling retained: {initialModelCeiling}.</p> : null}
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting
          ? 'Submitting…'
          : revisionOfResearchRunId
            ? 'Re-run with revised requirements'
            : 'Queue research'}
      </button>
      {status ? (
        <p aria-live="polite" role={isError ? 'alert' : 'status'}>
          {status}
        </p>
      ) : null}
    </form>
  );
}
