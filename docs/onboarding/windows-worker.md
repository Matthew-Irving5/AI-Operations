# Windows worker

The worker is outbound-only: it never opens a listener or accepts remote shell commands. Install it from a signed release artifact, then run its pairing command on the PC. In the dashboard, authenticate with fresh MFA, register the device label and its displayed Ed25519 public key, and enter the one-time pairing code locally before its ten-minute expiry.

Set `AI_OPERATIONS_CONTROL_PLANE_URL` to the HTTPS Supabase Functions base URL, plus the registered device ID and worker secret. State is held in local SQLite and the private Ed25519 key is DPAPI-protected. Select only folders that are safe to inventory; cache, credential, browser, dependency, and virtual-environment paths are excluded by the worker even when nested in an allowed root.

The worker can scan while connected, returns signed results, and leaves a requested scan waiting while offline. It executes only dashboard-approved, short-lived signed manifests. Every action checks its original hash and modified timestamp. Quarantine is reversible and retained for at least 30 days; ordinary deletion is never available.
