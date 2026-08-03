# Apple Shortcuts

The bridge uses only Shortcuts actions exposed by iOS/macOS. It does not use private Apple APIs or
request broad device access.

1. At AAL2, create a bridge device through the `apple-bridge-device` Edge Function with a label and
   the allowed Reminder lists: `Fitness Plan`, `Household & Personal`, and, where needed, `AI Actions`.
2. Copy the returned token immediately. It is displayed once; the service stores only a SHA-256 hash.
3. In Shortcuts, collect the selected Calendar events and Reminder items, then POST the JSON snapshot
   to `apple-bridge-ingest` with `Authorization: Bearer <device token>`. Include a new idempotency key
   for every logical snapshot retry.
4. Map only the approved lists. The server silently excludes Reminder lists not enabled for the device.
5. To receive approved actions, call `apple-bridge-actions` with the same token. The endpoint exposes
   only actions in the `AI Actions` list that have already passed approval.
6. Test with a harmless event and reminder, confirm the Personal page shows them, then enable the
   Shortcut automation. Revoke the device in the bridge UI or with `DELETE apple-bridge-device?id=...`
   if the device is lost.

Snapshots are size limited, replay-safe, and cannot mutate Google/Apple source data. A duplicate key
with a different payload is rejected rather than being treated as a valid retry.
