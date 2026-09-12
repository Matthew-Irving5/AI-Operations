# Windows worker

The worker is outbound-only: it never opens a listener or accepts remote shell commands. Install it from the signed `ai-operations-worker.exe` release artifact and verify its SHA-256 checksum and Authenticode signature before running it.

1. Run `ai-operations-worker.exe identity --key-path <protected-path>`. The command creates the Ed25519 key in Windows DPAPI-protected storage and prints only the base64 public key and SHA-256 fingerprint.
2. In Devices, click Register Windows worker, enter a label and the public key, then complete the fresh Microsoft Authenticator MFA flow. The site displays a one-time pairing code and device ID for ten minutes; it does not store the code in browser storage.
3. Run `ai-operations-worker.exe pair --control-plane-url https://<project-ref>.supabase.co/functions/v1 --device-id <device-id> --pairing-code <one-time-code>`. Pairing returns a per-device worker secret and stores it with Windows DPAPI; it is never printed.
4. From an elevated PowerShell prompt, install a scheduled background task. The repository helper writes only non-secret configuration and points the worker at the DPAPI secret file; it never puts the worker secret in a command line:

   ```powershell
   .\install-worker-task.ps1 `
     -WorkerPath 'C:\Program Files\AI Operations\ai-operations-worker.exe' `
     -ControlPlaneUrl 'https://<project-ref>.supabase.co/functions/v1' `
     -DeviceId '<device-id>' `
     -KeyPath 'C:\ProgramData\AI-Operations\worker.key.dpapi' `
     -SecretPath 'C:\ProgramData\AI-Operations\worker.secret.dpapi' `
     -StatePath 'C:\ProgramData\AI-Operations\worker-state.sqlite' `
     -AllowedRootsJson '["C:\\AI-Operations\\SyntheticSafe"]' `
     -QuarantineRoot 'C:\ProgramData\AI-Operations\quarantine'
   ```

   `-ManifestPublicKeyB64` is optional for this checklist's read-only smoke
   scan. Leave it unset until the server's manifest-signing public key has
   been provisioned. If an action manifest is received while it is unset, the
   worker rejects it and reports a signature failure; it never executes it.
   Configure the approved public key before enabling any action-plan workflow.

   The task starts at Windows boot and retries bounded failures. Review the generated task and runner script before starting it. To remove it, run `Unregister-ScheduledTask -TaskName 'AI Operations Windows Worker'` and delete only the generated runner/configuration files after revocation.

5. Start the task and refresh Devices. The worker must show `online` with a recent heartbeat before a smoke scan is requested.

State is held in local SQLite and the private Ed25519 key and worker secret are DPAPI-protected. Select only folders that are safe to inventory; cache, credential, browser, dependency, and virtual-environment paths are excluded by the worker even when nested in an allowed root.

The worker can scan while connected, returns signed results, and leaves a requested scan waiting while offline. Results that cannot be submitted are retained in the local SQLite outbox for bounded retry. It executes only dashboard-approved, short-lived signed manifests. Every action checks its original hash and modified timestamp. Quarantine is reversible and retained for at least 30 days; ordinary deletion is never available.

For onboarding, use a synthetic safe folder and request one lightweight scan. The checklist item remains locked until the server has verified a paired device, a heartbeat received within 30 minutes, a completed lightweight scan, and a valid signed result. If pairing expires or the device is revoked, register a new public key; never reuse a pairing code.
