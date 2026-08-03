export default function ApprovalsPage() {
  return (
    <>
      <h1>Approvals</h1>
      <p className="notice">
        Approving or rejecting a sensitive action requires MFA completed within the last five
        minutes.
      </p>
      <p className="card">No approvals are waiting for a decision.</p>
    </>
  );
}
