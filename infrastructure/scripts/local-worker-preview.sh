#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${LOCAL_QA_DIST_DIR:-}" ]]; then
  printf 'Worker preview must use apps/web/.next; LOCAL_QA_DIST_DIR leaked into its build environment.\n' >&2
  exit 1
fi
unset LOCAL_QA_DIST_DIR

export NODE_ENV=production
export APP_ENV=local
export PUBLIC_APP_ORIGIN="${E2E_BASE_URL:?The local browser origin was not configured.}"

pnpm --filter @ai-operations/web run preview -- \
  --ip 0.0.0.0 \
  --port "${E2E_PORT:?The local Worker port was not configured.}" \
  --var APP_ENV:local \
  --var "PUBLIC_APP_ORIGIN:${PUBLIC_APP_ORIGIN}"
