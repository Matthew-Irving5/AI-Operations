# System overview

Cloudflare Workers hosts the private Next.js dashboard through OpenNext. The Worker receives a narrowly scoped private R2 archive binding. Supabase provides Auth, PostgreSQL, RLS, Edge Functions, and scheduling. The Windows worker only makes outbound calls; it never accepts inbound connections.
