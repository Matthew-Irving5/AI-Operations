import { RecoveryRequestForm } from './recovery-request-form';

export default function ForgotPasswordPage() {
  return (
    <main style={{ maxWidth: 480, paddingTop: '12vh' }}>
      <h1>Reset your password</h1>
      <p className="label">
        Enter your account email. If the address is eligible, a recovery link will arrive shortly.
      </p>
      <RecoveryRequestForm />
    </main>
  );
}
