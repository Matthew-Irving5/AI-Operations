#!/usr/bin/env bash
set -euo pipefail

source_root="${LOCAL_QA_SOURCE_ROOT:?The Windows workspace path was not forwarded to WSL.}"
build_root="${LOCAL_QA_WSL_BUILD_ROOT:?The WSL build path was not configured.}"
node_bin="${LOCAL_QA_WSL_NODE_BIN:?The WSL Node.js runtime path was not configured.}"

if [[ ! -x "$node_bin/node" || ! -x "$HOME/.local/pnpm/bin/pnpm" ]]; then
  echo 'The OpenNext Worker preview needs Linux Node.js 24.18.0 and pnpm 10.18.2 in WSL.' >&2
  exit 1
fi
if [[ ! -d "$source_root" ]]; then
  echo 'The Windows workspace could not be reached from WSL.' >&2
  exit 1
fi

export PATH="$HOME/.local/pnpm/bin:$node_bin:$PATH"
mkdir -p "$build_root"
rsync -a \
  --exclude=.git \
  --exclude=node_modules \
  --exclude=.env \
  --exclude='**/.env' \
  --exclude='apps/web/.next' \
  --exclude='apps/web/.next-*' \
  --exclude='apps/web/.open-next' \
  --exclude=test-results \
  --exclude=playwright-report \
  --exclude=coverage \
  "$source_root/" "$build_root/"

host_ip="$(ip route | awk '/default/ { print $3; exit }')"
if [[ ! "$host_ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  echo 'WSL could not identify the Windows host for the isolated local Supabase endpoint.' >&2
  exit 1
fi
if [[ "${NEXT_PUBLIC_SUPABASE_URL:?}" =~ ^http://127\.0\.0\.1:([0-9]+)$ ]]; then
  export NEXT_PUBLIC_SUPABASE_URL="http://${host_ip}:${BASH_REMATCH[1]}"
else
  echo 'The Worker preview only accepts the isolated local Supabase loopback endpoint.' >&2
  exit 1
fi

export NODE_ENV=production
export APP_ENV=local
export PUBLIC_APP_ORIGIN="${E2E_BASE_URL:?The local browser origin was not configured.}"
cd "$build_root"
pnpm --filter @ai-operations/web run preview -- \
  --ip 0.0.0.0 \
  --port "${E2E_PORT:?The local Worker port was not configured.}" \
  --var APP_ENV:local \
  --var "PUBLIC_APP_ORIGIN:${PUBLIC_APP_ORIGIN}"
