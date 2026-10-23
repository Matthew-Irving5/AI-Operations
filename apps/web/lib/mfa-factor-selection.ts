import { legacyStagingE2eFactorName } from './live-e2e-safety';

export type MfaFactorOption = Readonly<{ id: string; friendlyName: string }>;

type MfaFactorRecord = Readonly<{
  id: string;
  status: string;
  friendly_name?: string | null;
}>;

export function selectMfaFactors(factors: readonly MfaFactorRecord[] | null | undefined): {
  availableFactors: MfaFactorOption[];
  defaultFactorId?: string;
} {
  const availableFactors = (factors ?? [])
    .filter((factor) => factor.status === 'verified')
    .map((factor) => ({ id: factor.id, friendlyName: factor.friendly_name || 'Authenticator' }));
  const defaultFactorId =
    availableFactors.find((factor) => factor.friendlyName !== legacyStagingE2eFactorName)?.id ??
    availableFactors[0]?.id;

  return defaultFactorId ? { availableFactors, defaultFactorId } : { availableFactors };
}
