---
name: ai-operations-investigate
description: Resolve the existing symbols and narrow interfaces needed for the complete Linear ticket without re-planning the feature.
---
# Execute a pre-engineered ticket
1. Read the exact six-section ticket and named code. Confirm the required producer, consumer, runtime role and dependency have not changed since it was written.
2. Prefer Serena for symbol/reference navigation, fallback rg/types. Read only matching specs/ADRs and the relevant integration contract. Do not recite unrelated history.
3. If the ticket is accurate, implement directly. No separate readback, generic implementation plan or broad exploration.
4. If a critical file, role or promised interface is absent or contradictory, report the concrete mismatch and cheapest correction, not an invented architecture.
5. Keep changes scoped to one contract; use only ticket-selected tests and direct consumers.
