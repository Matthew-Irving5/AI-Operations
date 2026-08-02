# Development environment

Use Node 22.18+, pnpm 10.18+, Docker, Supabase CLI, Wrangler, Python 3.12, and MinIO. Copy `.env.example` to `.env.local`, using only development credentials. Run `pnpm install`, `supabase start`, then `pnpm dev`. Synthetic data only is permitted.

Run `pnpm verify`, `pnpm test:e2e`, and `supabase test db` before opening a PR. The initial Windows-worker package is outbound-only and validates its control-plane URL as HTTPS; its executable local-operation implementation is delivered in Pass 6.
