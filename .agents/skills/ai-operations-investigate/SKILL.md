---
name: ai-operations-investigate
description: Investigate unfamiliar AI Operations code, call paths, migrations, RPC grants and cross-service dependencies before changing them.
---

# Trace real interfaces

1. Read the Linear issue, relevant specifications and AGENTS.md. Trace caller → handler → auth/validation → DB/queue → consumer → test; name actual symbols and grants.
2. Use Serena symbols/references if connected; activate this checkout as its project in Codex Desktop. Fallback: rg, types, repository map, focused tests.
3. For external APIs use Context7 for version-specific docs when authenticated; otherwise use official documentation and installed types. Never send confidential code or secrets to an external docs service.
4. Identify blast radius, dependency readiness and one cheap invariant/test per changed boundary. Read back the actual path, goal, risks and smallest proof before editing.
5. Make the smallest **complete** implementation; avoid duplicate abstractions and speculative cross-module rewrites.
   Do not run multi-agent review panels or full architecture ceremonies for simple tasks. Existing release and security rules supersede tool-specific advice.
