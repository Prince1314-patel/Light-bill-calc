# Light Bill Calculator

A bilingual (English / Gujarati) electricity bill calculator for landlords to calculate tenant electricity costs based on meter readings. Bills are saved to Supabase and history is shown with aggregate stats.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/light-bill run dev` — run the frontend (port 21653)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, TanStack Query, shadcn/ui, Tailwind CSS, wouter
- API: Express 5
- Storage: Supabase (PostgreSQL via REST API, no auth)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `lib/api-client-react/src/generated/` — generated React Query hooks
- `lib/api-zod/src/generated/` — generated Zod schemas for server validation
- `artifacts/api-server/src/routes/bills.ts` — bill CRUD routes (uses Supabase REST)
- `artifacts/api-server/src/lib/supabase.ts` — Supabase client (service role key)
- `artifacts/light-bill/src/` — React frontend

## Architecture decisions

- Supabase REST API used server-side (Express routes call Supabase, frontend never touches Supabase directly)
- No authentication — single-user personal tool
- Bill IDs are `randomUUID()` generated server-side
- Stats endpoint aggregates all bills in memory (low volume expected)
- Bilingual support (English/Gujarati) handled entirely on the frontend via a translations dictionary

## Product

- Calculator form: date, total main bill (₹), total units, previous/present tenant meter reading
- Auto-calculates per-unit price and tenant's share
- Saves to Supabase on submit; history panel shows past bills with delete
- Stats bar shows total records, total tenant paid, avg unit price, avg monthly bill
- Language toggle switches all labels between English and Gujarati

## User preferences

- User wanted Supabase (no auth) for history storage
- UI/UX polishing was explicitly requested

## Gotchas

- Direct Postgres connections to Supabase are firewalled in this environment — use the REST API via the Supabase JS client
- The Supabase `bills` table must exist before the server starts (created manually via Supabase SQL Editor — see migration below)
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are used by the frontend build (VITE_ prefix exposes them); `SUPABASE_SERVICE_ROLE_KEY` is server-only

## Supabase table migration

Run this once in the Supabase SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  total_bill REAL NOT NULL,
  total_units REAL NOT NULL,
  prev_reading REAL NOT NULL,
  pres_reading REAL NOT NULL,
  unit_price REAL NOT NULL,
  tenant_units REAL NOT NULL,
  tenant_bill REAL NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
