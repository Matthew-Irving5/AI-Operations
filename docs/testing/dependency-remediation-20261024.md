# Dependency remediation · 24 October 2026

The release audit reported three high vulnerabilities. This maintenance change preserves schemas, authentication, permissions and spending controls while pinning the first patched compatible versions.

| Dependency  | Existing path and exposure                                                                                                          | Patch                  |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Zod         | Web, shared contracts, AI runtime and deployed Edge imports; oversized constrained collections can exhaust memory during validation | 4.6.6                  |
| undici      | OpenNext dotenv/build tooling and Wrangler → Miniflare preview HTTP client                                                          | 7.30.1                 |
| body-parser | OpenNext AWS adapter → Express build/preview server; compressed request trailing bytes can crash parser                             | 2.4.0, scoped override |

Authoritative advisories: [Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [undici](https://github.com/advisories/GHSA-xjj6-f33q-929c), [body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828).

Node manifests, direct Edge URLs, Deno import maps and lockfiles are updated together. The pin regression checks actual deployment sources, not only the pnpm graph. Audit passes with zero high vulnerabilities; two moderate findings remain below the existing gate. Focused Deno mobile contract tests and deployed import graphs pass; the changed-surface gate and PR CI cover the shared-schema and production-like Worker compatibility boundary. Hosted staging is serialized by the parent and must bind this exact candidate; earlier feature acceptance is not transferred to a new dependency tree.
