import { onboardingData } from '../../../lib/platform-data';
import { OnboardingForm } from './onboarding-form';

export default async function SettingsPage() {
  const { items, accepted } = await onboardingData();
  return (
    <>
      <h1>Settings &amp; production onboarding</h1>
      <p className="notice">
        Complete this checklist using real production setup evidence. Credentials and keys are never
        entered into this page; they remain environment or provider secrets.
      </p>
      {(items.error ?? accepted.error) ? (
        <p className="notice" role="alert">
          {items.error ?? accepted.error}
        </p>
      ) : null}
      <OnboardingForm
        completedCodes={items.data.filter((item) => item.completed_at).map((item) => item.code)}
        accepted={accepted.data}
      />
    </>
  );
}
