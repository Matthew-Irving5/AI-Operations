#!/usr/bin/env bash
set -euo pipefail

source_root="${LOCAL_QA_SOURCE_ROOT:?The Windows workspace path was not forwarded to WSL.}"
build_root="${LOCAL_QA_WSL_BUILD_ROOT:?The WSL build path was not configured.}"
node_bin="${LOCAL_QA_WSL_NODE_BIN:?The WSL Node.js runtime path was not configured.}"

if [[ ! -x "$node_bin/node" || ! -x "$HOME/.local/pnpm/bin/pnpm" ]]; then
  echo 'The OpenNext Worker preview needs Linux Node.js 22.18.0 and pnpm 10.18.2 in WSL.' >&2
  exit 1
fi
export PATH="$HOME/.local/pnpm/bin:$node_bin:$PATH"
if [[ "$("$node_bin/node" --version)" != 'v22.18.0' || "$("$HOME/.local/pnpm/bin/pnpm" --version)" != '10.18.2' ]]; then
  echo 'The OpenNext Worker preview runtime must match CI exactly: Node.js 22.18.0 and pnpm 10.18.2.' >&2
  exit 1
fi
if [[ ! -d "$source_root" ]]; then
  echo 'The Windows workspace could not be reached from WSL.' >&2
  exit 1
fi
resolved_build_root="$(realpath -m "$build_root")"
case "$resolved_build_root" in
  "$HOME"/aiops-wsl-*) ;;
  *)
    echo 'The OpenNext Worker build path must stay inside its disposable WSL workspace.' >&2
    exit 1
    ;;
esac
if [[ -e "$resolved_build_root/.git" || ! -f "$resolved_build_root/package.json" || ! -f "$resolved_build_root/apps/web/package.json" ]]; then
  echo 'The OpenNext Worker build path is not the expected disposable repository copy.' >&2
  exit 1
fi

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

shopt -s nullglob
generated_outputs=(
  "$build_root/apps/web/.next"
  "$build_root/apps/web"/.next-*
  "$build_root/apps/web/.open-next"
  "$build_root/apps/web/.wrangler"
)
if ((${#generated_outputs[@]})); then
  rm -rf -- "${generated_outputs[@]}"
fi
cd "$build_root"
CI=true pnpm install --frozen-lockfile

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
pnpm --filter @ai-operations/web run preview -- \
  --ip 0.0.0.0 \
  --port "${E2E_PORT:?The local Worker port was not configured.}" \
  --var APP_ENV:local \
  --var "PUBLIC_APP_ORIGIN:${PUBLIC_APP_ORIGIN}"
