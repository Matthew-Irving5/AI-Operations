# Windows worker installation and pairing

This is a private, no-cost deployment. The executable is intentionally
unsigned, so Windows may show “Unknown publisher”. Verify the SHA-256 checksum
and provenance before running it. The provenance must contain the expected
commit SHA and `signed: false`.

The worker's security does not depend on Authenticode: its Ed25519 identity,
DPAPI-protected private key, per-device secret, HTTPS-only transport, server
pairing, revocation, heartbeat, and signed-result verification remain required.

## Release and checksum

1. Merge the release workflow change to `main`.
2. Create and push a worker release tag, for example:

   ```powershell
   git tag worker-v0.2.0
   git push origin worker-v0.2.0
   ```

3. Open the resulting GitHub release and download:
   - `ai-operations-worker.exe`;
   - `ai-operations-worker.exe.sha256`;
   - `ai-operations-worker.provenance.json`;
   - `install-worker-task.ps1`.
4. In PowerShell, from the download directory, calculate the checksum:

   ```powershell
   (Get-FileHash '.\ai-operations-worker.exe' -Algorithm SHA256).Hash
   ```

   Compare it with the contents of `ai-operations-worker.exe.sha256`.

5. Open the provenance JSON and verify that `commit` is the release commit and
   `signed` is `false`. Stop if either check fails.

## Pair the PC

6. Create the protected worker directory and synthetic safe folder:

   ```powershell
   New-Item -ItemType Directory -Force 'C:\ProgramData\AI-Operations'
   New-Item -ItemType Directory -Force 'C:\AI-Operations\SyntheticSafe'
   Set-Content 'C:\AI-Operations\SyntheticSafe\smoke-test.txt' 'AI Operations smoke test'
   ```

7. Copy the executable to:

   ```text
   C:\Program Files\AI Operations\ai-operations-worker.exe
   ```

8. Generate the local identity:

   ```powershell
   & 'C:\Program Files\AI Operations\ai-operations-worker.exe' identity `
     --key-path 'C:\ProgramData\AI-Operations\worker.key.dpapi'
   ```

   Keep only the displayed `publicKeyB64` value. Never share the private key
   file. Success is JSON containing `publicKeyB64` and `fingerprintSha256`
   without any private-key material.

9. Log in to the AI Operations website and open **Devices**. If the session has
   expired, sign in again before continuing.
10. Click **Register Windows worker**.
11. Enter `Windows PC` as the label and paste only `publicKeyB64`.
12. Complete the fresh Microsoft Authenticator MFA challenge.
13. Copy the displayed device ID and one-time pairing code. The code expires
    after ten minutes and must not be reused.
14. Pair immediately:

```powershell
& 'C:\Program Files\AI Operations\ai-operations-worker.exe' pair `
  --control-plane-url 'https://epmgvknrydadzitzupzx.supabase.co/functions/v1' `
  --device-id '<DEVICE_ID>' `
  --pairing-code '<PAIRING_CODE>' `
  --key-path 'C:\ProgramData\AI-Operations\worker.key.dpapi' `
  --secret-path 'C:\ProgramData\AI-Operations\worker.secret.dpapi'
```

Success is `paired: true`. The worker secret must not be printed.

## Install and start the scheduled task

15. Open PowerShell as Administrator in the directory containing
    `install-worker-task.ps1` and run:

```powershell
& '.\install-worker-task.ps1' `
  -WorkerPath 'C:\Program Files\AI Operations\ai-operations-worker.exe' `
  -ControlPlaneUrl 'https://epmgvknrydadzitzupzx.supabase.co/functions/v1' `
  -DeviceId '<DEVICE_ID>' `
  -KeyPath 'C:\ProgramData\AI-Operations\worker.key.dpapi' `
  -SecretPath 'C:\ProgramData\AI-Operations\worker.secret.dpapi' `
  -StatePath 'C:\ProgramData\AI-Operations\worker-state.sqlite' `
  -AllowedRootsJson '["C:\\AI-Operations\\SyntheticSafe"]' `
  -QuarantineRoot 'C:\ProgramData\AI-Operations\quarantine'
```

`-ManifestPublicKeyB64` is intentionally omitted for this read-only smoke
scan. If an action manifest arrives without that key, the worker rejects it
and never executes it. Configure the approved key before enabling action
plans.

16. Start the task:

```powershell
Start-ScheduledTask -TaskName 'AI Operations Windows Worker'
```

17. Return to **Devices** and refresh. Success requires `online`, a heartbeat
    received within 30 minutes, and no secret or private key visible in the UI.

## Smoke scan and checklist

18. Open **Digital Estate** and request one lightweight read-only scan of:

```text
C:\AI-Operations\SyntheticSafe
```

19. Wait for progress to reach `100%` and status `complete`.
20. Confirm the result is accepted and contains no absolute local paths.
21. Open **Settings**. Click the Windows worker checklist item only after it
    becomes enabled.

The server unlocks the checklist only after verifying a non-revoked paired
device, `paired_at`, a recent heartbeat, a completed lightweight scan, a valid
Ed25519-signed result, inventory persistence, and evidence metadata. Invalid or
expired pairing, wrong secrets, revocation, offline operation, malformed
results, and invalid signatures remain fail-closed with a request ID and
structured error.
