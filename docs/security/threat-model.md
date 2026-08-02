# Threat model

Primary threats are credential leakage, unauthorised access, IDOR/RLS bypass, session downgrade, CSRF, malicious imported content, webhook replay, and local-worker compromise. Pass 1 mitigates these with server-only secrets, CSP, an allowlisted identity, AAL2 routing, RLS default denial, Zod validation, redacted audit records, and private R2 bindings.
