---
name: ai-operations-debug
description: Reproduce and localise one failing local test or genuine integration boundary without broad reruns.
---
# Narrow causal debugging
1. Capture exact first failure, expected versus actual, role/fixture and command, redacting sensitive values.
2. Classify CODE, CONTRACT, ENVIRONMENT, INFRASTRUCTURE, FLAKE or UNKNOWN. Use qa:doctor for environment-specific faults, not as a universal startup.
3. Inspect real producer, consumer, SQL role, Edge config and deployment mapping. Reproduce with the smallest valid test.
4. Patch the causal issue, rerun that test and affected direct consumers. If two hypotheses fail, reconsider diagnosis.
5. For escaped deterministic defects add the lowest-cost regression. For integration/infra errors, update matching rule and failure incident. Staging is not a debugger; do not weaken auth/MFA or tests.
