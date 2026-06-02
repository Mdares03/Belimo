# EVAC cloud v2 — Progress & Handoff

_Last updated: 2026-06-02. Living document — update as work proceeds._

## What this is

SaaS for AC thermal-energy metering & billing. Belimo Energy Valves in buildings meter
thermal energy (TON-hr) and water (m³); the platform reads that via the **Belimo Cloud API**,
attributes consumption to tenants/locales, and generates monthly invoices. Three role-scoped
apps: **Client** (tenant), **Owner** (building owner / dueño), **Admin** (EVAC / system owner).
The three roles form a hierarchy: system provisions owners/buildings/valves -> owner bills
tenants -> client pays. Each sees only its own scope. UI is Spanish (Mexico); working language
is English. See `README.md` for the full product spec.

Stack: Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind · Prisma · PostgreSQL ·
NextAuth (credentials, JWT). Deployed via systemd (`evac-cloud.service`) + nginx on an Ubuntu VM.
Working dir on the box: `/home/mdares/evac-cloud`. Postgres role: `evac_app` (NOT the OS user).

## End goal

Replace all mock data with the real seam: **Belimo -> Postgres -> role-scoped views -> invoices**.
Each role sees only its scope. Billing is the last piece.

## Fleet reality (verified this session)

- **153 total Belimo devices**, of which **102 are energy valves** and 51 are non-metering
  (ethernet/gateway modules `device.belimo.ethernetproductrange`, plus a `BasicActuatorMpl`).
- Energy valves span **two dataprofiles**: `energyvalve3/1.2.2` and
  `device.belimo.energy-valve-Version3/1.11`. **Both expose the same datapoint IDs** with real
  values (verified), so the hardcoded datapoint map is valid fleet-wide.
- Real buildings: **NID® Puerto Cancún (62 valves)**, **NIDO (14)**, **Sin asignar (24,
  uninstalled inventory)**, **Sin definir (1)**, **Testplatz EU (1, Belimo test unit)**.
- 77 valves are installed/floored (NID 62 + NIDO 14 + 1 Testplatz); 25 are floor-less inventory
  (24 "Sin asignar" + 1 "Sin definir"). 77 + 25 = 102.

## Done so far (this session)

1. **`orgId` in the auth session.** Added `orgId` to the `authorize` return, the `jwt` and
   `session` callbacks (`auth.ts`), and all three interfaces in `next-auth.d.ts`. Owner views can
   now scope by org across all of an owner's buildings.
2. **Pagination fix — CRITICAL.** Belimo `GET /devices` is offset/limit paginated
   (`paging.total = 153`, `limit = 20`). The old `listDevices()` read only `json.data` from page
   one, so the whole app was running on **17 of 102 valves** (~13% of the fleet). Rewrote
   `listDevices()` (`lib/belimo.ts`) to loop `?limit=&offset=` until the full count is collected
   (advancing by `batch.length`, so it tolerates a capped page size). Re-ingest: 153 devices seen,
   **102 valves upserted**, 0 errors.
3. **Two dataprofiles confirmed, single datapoint map.** The fleet is NOT one profile (corrects
   the prior note). Audited a sample of each energy profile: both carry `evcloud.200`,
   `evcloudplus.461`, `evcloud.140`, `default.1` with real values, so `toReading`/`toValveStatus`
   are correct for both. No per-profile mapping needed.
4. **Local-code decode + ingest rewrite (`lib/ingest.ts`).** `metadata.1001` is
   `SITE-FLOOR-LOCAL[-VALVE]`, e.g. `001-003-017-A`:
   - **Floor** = 2nd group -> `"Nivel N"` (resolved/created during ingest, cached per building).
   - **Local** = first three groups (`001-003-017`), so multiple valves on the same local
     (`-0`/`-A`/`-B`/`-TZ`) now group into ONE local with several valves (restores the core domain
     rule). Previously the full code was used as the local, over-splitting one valve per local.
   - **Valve** = 4th group / serial.
   - Ingest now sets `valve.floorId` AND `valve.localId` on **both** create and update. Codes that
     don't match `^\d{3}-\d{3}-\d{3}` (inventory serials like `22118-40002-022-182`) get no floor —
     correct. Regex: `/^(\d{3})-(\d{3})-(\d{3})(?:-(.+))?$/`.
   - Re-ingest: `floorsCreated 8`, `localsCreated 67`; then deleted 72 orphaned old per-valve
     locals (`DELETE FROM "Local" WHERE code ~ '^[0-9]{3}-[0-9]{3}-[0-9]{3}-.+$' AND no valves AND
     no invoices`). Verified multi-valve locals exist (`001-004-007` and `001-004-001` have 3 each).
5. **Buildings assigned to an owner org.** `UPDATE`d **NID® Puerto Cancún** and **NIDO** to the
   **Espacio Cancún** OWNER org, and pointed the `espaciocancun@gmail.com` user at NID® Puerto
   Cancún as the active building. (One-off SQL; needs an admin UI eventually.)
6. **Owner org-scope + building switcher (step 5).**
   - `getOwnerScopedView(buildingId?)` now scopes to a selected building, **validated against the
     owner's org**; defaults to the user's building, falling back to the first org building.
   - New `getOwnerContext()` returns the org's building list + default active building (for the
     shell). New `OwnerBuildingOption` type.
   - `floorGroups` sorted by Nivel number (was ingest order).
   - All five owner pages read `?building=` from `searchParams` and pass it through.
   - New client component `components/shell/owner-nav.tsx`: building-aware nav links + "Mis
     edificios" switcher with active highlight (wrapped in `<Suspense>` because it uses
     `useSearchParams`). `owner-shell.tsx` rewritten to use `getOwnerContext`; topbar shows
     "N edificios · Dueño".
   - **Verified live:** owner app shows NID 62 válvulas / 5 niveles / 58 locales by floor in order;
     switcher lists all org buildings; clicking NIDO re-scopes the page.

## Belimo API specifics (hard-won)

- **Auth:** OAuth2 **password grant**. Token URL `https://id.belimo.com/oauth/token`,
  audience `https://api.cloud.belimo.com/`, scopes `public.read offline_access read:dataprofile`.
  Token cached + refreshed (refresh-token first, fall back to password grant).
- **REST base:** `https://cloud.belimo.com/api/v3`.
- **Pagination:** `GET /devices` returns `{ data, paging: { total, offset, limit }, sorting,
  filter }`. **Default page size is 20.** You MUST loop `?limit=&offset=` until `data.length`
  reaches `paging.total`. (This was the big bug — see Done #2.)
- **Endpoints:** `GET /devices`, `GET /devices/{id}/data`, `GET
  /devices/{id}/data/history/timeseries` (for billing), `GET /definitions/dataprofiles/{id}/{ver}`.
  Pass the dataprofile `ref` (a full path) directly; don't re-prefix.
- **Device identity:** `id` (UUID) -> `Valve.belimoId`; `serialNumber` -> `Valve.serial`. Building
  and local come from the data payload: `metadata.1004` = building name, `metadata.1002` = project,
  `metadata.1001` = device/local code (the `SITE-FLOOR-LOCAL[-VALVE]` string), `metainfo.100` = city.

### Datapoint mapping (both energy profiles share these)

| EVAC field | Datapoint | Raw unit | Conversion |
|---|---|---|---|
| Thermal energy | `evcloud.200` (Cooling Energy) | Joules | / 12,660,670.8 -> TON-hr |
| (heating, if used) | `evcloud.210` (Heating Energy) | Joules | / 12,660,670.8 -> TON-hr |
| Water | `evcloudplus.461` (Flow_Volume_total_m3) | m3 | none |
| Power | `evcloud.140` (Absolute Power) | Watts | / 3516.853 -> TON |
| Status | `default.1` (Aggregated health) | OK/ERROR/... | -> ValveStatus |
| Health detail | `default.2` | text | e.g. "Flow_sensor_error" |

1 refrigeration ton = 3516.853 W; 1 TON-hr = 12,660,670.8 J.
**`evcloud.200`/`evcloudplus.461` are LIFETIME CUMULATIVE counters** — a monthly bill =
(counter at period end − counter at period start). Ingestion stores cumulative snapshots; billing
will diff them. Energy currently = cooling only (`evcloud.200`); sum `evcloud.210` later if any
valve heats.

## Architecture / key files

- `lib/belimo.ts` — Belimo client + mappings (server-only). `listDevices()` now paginates.
- `lib/ingest.ts` — fleet ingestion. Parses local code -> floor + grouped local; sets
  `valve.floorId`/`localId`. `IngestSummary` gained `floorsCreated`.
- `app/api/cron/ingest/route.ts` — secret-guarded ingestion trigger (POST, `x-cron-secret`).
- `lib/scoped-data.ts` — role-scoped read layer. `getClientScopedView` (still has mock fallbacks),
  `getOwnerScopedView(buildingId?)` (org-scoped, live), `getOwnerContext()` (org building list),
  `getAdminFleetView`/`getAdminValves` (live).
- `components/shell/owner-shell.tsx` + `components/shell/owner-nav.tsx` — owner shell + the
  building-aware client nav/switcher.
- `app/(owner)/owner/*/page.tsx` — read `?building=`, pass to `getOwnerScopedView`.
- `auth.ts`, `middleware.ts`, `next-auth.d.ts` — credentials auth. Session now carries `role`,
  `scope`, `clientId`, `buildingId`, **and `orgId`**.
- `prisma/schema.prisma`, `prisma/seed.ts`, `lib/mock-data.ts` — model, seed, mocks.
- **TEMP (delete before prod):** `app/api/belimo-inspect/route.ts`, `app/api/belimo-audit/route.ts`,
  the `listDevicesRaw()` helper in `belimo.ts`, and the `*.bak` / `patch_step5.py` / `fix_step5.py`
  files left in the repo root.

## Next steps

1. **Link locals -> clients.** Assign a few ingested NID/NIDO locals to a `Client` so the tenant
   (client) view and owner cobranza have someone to bill. SQL/seed for now; admin UI later.
2. **Billing (final piece).** Compute period deltas from cumulative `Reading`s (end − start) or
   `getTimeseries`, apply the building `Tariff` (energyRate/waterRate/fixedCharge/taxRate), write
   `Invoice` rows. **Confirm the formula with the client** — README placeholder:
   `total = energia*tarifa_energia + agua*tarifa_agua + cargo_fijo + IVA(16%)`. Then wire the owner
   "Generar y enviar recibos" flow (PDF + email per tenant).
3. **Clean up mock buildings.** The seed stamps demo buildings (Espacio Puerto Cancún, El Nido,
   Altea) with owner orgs, so the owner switcher shows **3** buildings instead of 2. Stop seeding
   them (or delete them) once real data covers owner/client.
4. **Client app on real data.** `getClientScopedView` still has mock fallbacks; needs a client
   linked to real locals.
5. **Admin pages on real data.** `edificios` list + `edificios/[id]` detail are still mock (only
   `/admin/estado` and `/admin/valvulas` are live). Same for `clientes` (building-owner catalog).
6. **Mobile building switcher.** Desktop-only right now; the mobile tab strip doesn't carry
   `?building`.
7. **Owner inquilinos.** `getOwnerScopedView` still returns the `ownerTenants` mock; replace once
   client-links exist.
8. **Remove temp/debug artifacts** (see Architecture).

## Confirm with the client (open questions)

- Floor numbering: group 2 `001` is rendered as **"Nivel 1"** (not "Planta baja"). Correct?
- Local code group 4 (`0`/`A`/`B`/`TZ`) is treated as a valve-within-local, not a sub-local. Correct?
- The lone `BasicActuatorMpl` device has no metering datapoints — confirm it isn't expected to bill.
- Billing formula + tariffs (not final).

## Known issues / gotchas (lessons learned)

- **`/devices` paginates** (offset/limit, `paging.total`). Any device listing MUST loop pages —
  the original code silently returned only the first 20.
- **Two energy dataprofiles**, but they share datapoint IDs (verified). Don't assume one profile.
- **Local code = `SITE-FLOOR-LOCAL[-VALVE]`.** Floor from group 2, local from groups 1-3, valve
  from group 4. Inventory/serial codes don't match and get no floor.
- **Terminal paste corruption.** Multi-line heredocs/`sed` echo garbled on paste (sometimes still
  apply, sometimes truncate to 0 bytes). Prefer **Python patch scripts with single-occurrence
  asserts** or full-file `cat >` overwrites; verify with `npm run build` + `grep -c`/`wc -l`. A
  partial paste once dropped `getAdminValves` from `scoped-data.ts`.
- **psql + Prisma URL.** `DATABASE_URL` has `?schema=public`, which libpq rejects — strip the
  `?...` before passing to `psql`. Extract from `.env` without echoing the password. Role is
  `evac_app`; an empty `$DB` falls back to the OS user (`mdares`) and fails.
- **JWT session caching.** Reassigning a user's building/org requires **log out + log back in**;
  the token keeps the old values until re-auth.
- **Owner status pills are cosmetic** until billing — with no invoices, "Por cobrar"/"Con vencidos"
  are derived from valve health (ALERTA -> warn, ERROR -> bad), not real money.
- **Mock vs real buildings coexist** — reconcile (next steps #3).
- Carried forward: Belimo creds have I/l ambiguity (copy exact bytes, verify via md5); **rotate any
  secrets pasted into shell history/chat**; `@next/env` expands `$` (escape `\$`); `migrate dev`
  needs `CREATEDB` on the role; **pnpm is broken** on this box (Node 20) — use `npm`/`npx`; readings
  are append-only; admin sidebar badges are hardcoded; Next 16 "middleware -> proxy" deprecation is
  harmless for now.

## How I (the human) like to work

- **Exact, surgical instructions.** "In this file, find THIS block, replace with THIS block" —
  show both verbatim. Don't describe edits abstractly or hand-wave a diff.
- **Robust application over clever one-liners.** For multi-line/structural edits, give a **Python
  patch script** (with per-edit asserts that abort cleanly) or a **full-file `cat >` overwrite** —
  chained `sed` and big heredocs get mangled by terminal paste.
- **Always verify before declaring done.** Pair every change with a build, a `grep`/`wc` count, a
  SQL check, or a screenshot. Numbers and assumptions get checked, not trusted — verifying the
  valve count is what surfaced the pagination bug.
- **One focused step per turn.** I'm on a remote Ubuntu VM (`/home/mdares/evac-cloud`) that the
  assistant can't reach; the loop is: assistant produces edits -> I apply + build on the box ->
  I paste the output back.
- **Be proactive about correctness.** Flag latent bugs and wrong assumptions early, even if I
  didn't ask.
- **Keep secrets out of pastes** — mask/limit when inspecting credentials or connection strings.
- **Spanish (Mexico)** for UI copy; **English** for our working conversation.

## Env vars

```
DATABASE_URL=postgresql://evac_app:<pass>@localhost:5432/evac_cloud?schema=public
NEXTAUTH_SECRET=...
BELIMO_CLIENT_ID=...           # 32 chars
BELIMO_CLIENT_SECRET=...       # 64 chars
BELIMO_USERNAME=evac@maliountech.com
BELIMO_PASSWORD=...
CRON_SECRET=...                # 48 hex, guards /api/cron/ingest
# optional (defaults correct): BELIMO_AUDIENCE, BELIMO_TOKEN_URL, BELIMO_API_BASE, BELIMO_SCOPES
```

## Operate

```bash
# rebuild + restart after code/schema changes
npm run build && sudo systemctl restart evac-cloud.service

# manual full-fleet sync (paginated; ~153 sequential Belimo calls, give it ~1 min)
SECRET=$(grep ^CRON_SECRET .env | cut -d= -f2 | tr -d '"')
curl -s -X POST -H "x-cron-secret: $SECRET" http://localhost:3000/api/cron/ingest | python3 -m json.tool
tail /home/mdares/evac-cloud/ingest.log    # cron output (every 15 min)

# psql against the app DB (strip Prisma's ?schema= for libpq)
DB=$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//')
DB_PSQL=$(printf '%s' "$DB" | sed 's/[?].*$//')
psql "$DB_PSQL" -c 'SELECT ...;'           # use $$...$$ for string literals (avoids quote/® issues)

# schema change
npx prisma migrate dev --name <name>
npx prisma migrate reset --force           # clean reseed (dev) — wipes the org/building reassignments
npx prisma studio                          # inspect data

# temp audit route (delete before prod): fleet completeness + datapoint check
curl -s http://localhost:3000/api/belimo-audit | python3 -m json.tool
```

Logins (seed): `ddares@maliountech.com` (admin), `espaciocancun@gmail.com` (owner, now on real
NID® Puerto Cancún), `contacto@investport.mx` (client) — all password `Evac2026!`.

## Production-safe checklist (do not skip)

- Ensure temporary routes/scripts are absent before deploy: `app/api/belimo-inspect/route.ts`, `app/api/belimo-audit/route.ts`, `*.bak`, `patch_step*.py`, `fix_step*.py`.
- Run `npm run build` after every structural edit (auth, scoped-data, billing).
- Re-run ingestion before monthly billing so period-end snapshots are current.
- Never mutate `PAGADA` invoices during regeneration; regenerate only draft/unpaid records.

## SQL runbook — local/client linking for billing v1

Use these exact SQL checks/updates (replace IDs/codes as needed):

```sql
-- 1) pick target building + candidate locals with valves
SELECT l.id, l.code, COUNT(v.id) AS valve_count
FROM "Local" l
LEFT JOIN "Valve" v ON v."localId" = l.id
WHERE l."buildingId" = '<BUILDING_ID>'
GROUP BY l.id, l.code
ORDER BY l.code;

-- 2) link 2-3 real locals to a real client
UPDATE "Local"
SET "clientId" = '<CLIENT_ID>'
WHERE id IN ('<LOCAL_ID_1>', '<LOCAL_ID_2>', '<LOCAL_ID_3>');

-- 3) validate each linked local has valves
SELECT l.code, c.name AS client, COUNT(v.id) AS valve_count
FROM "Local" l
JOIN "Client" c ON c.id = l."clientId"
LEFT JOIN "Valve" v ON v."localId" = l.id
WHERE l."buildingId" = '<BUILDING_ID>'
GROUP BY l.code, c.name
ORDER BY l.code;

-- 4) validate previous-month boundary coverage exists for linked locals
WITH bounds AS (
  SELECT
    date_trunc('month', now()) - interval '1 month' AS start_ts,
    date_trunc('month', now()) AS end_ts
)
SELECT l.code,
       COUNT(r.id) FILTER (WHERE r.ts <= b.start_ts) AS start_points,
       COUNT(r.id) FILTER (WHERE r.ts <= b.end_ts) AS end_points
FROM "Local" l
JOIN "Valve" v ON v."localId" = l.id
LEFT JOIN "Reading" r ON r."valveId" = v.id
CROSS JOIN bounds b
WHERE l."buildingId" = '<BUILDING_ID>'
  AND l."clientId" IS NOT NULL
GROUP BY l.code
ORDER BY l.code;
```

## 2026-05-30 — Production-data cleanup + billing continuation

- Removed runtime mock dependencies from active app paths (owner/client/admin pages/components); deleted `lib/mock-data.ts`.
- Admin pages `edificios`, `edificios/[id]`, `clientes`, `config/usuarios`, `config/roles` now query Prisma directly.
- `getClientScopedView` and owner tenant rows now come from real DB data (no mock fallback imports).
- Added invoice audit fields and applied migration:
  - `periodStartTs`, `periodEndTs`, `startReadingTs`, `endReadingTs`, `startReadingId`, `endReadingId`, `anomalies`.
  - Migration: `20260530220000_add_invoice_audit_fields` (applied with `prisma migrate deploy`).
- Linked 3 real locals in **NID® Puerto Cancún** and 3 real locals in **NIDO** to real clients for billing v1 readiness.
- Inserted baseline tariffs for NID/NIDO and backdated `effectiveFrom` so monthly-closed lookup can resolve tariffs.
- Billing service run for both buildings now executes successfully and returns structured summaries; current rows are skipped with `zero_consumption` for prior-month window (no billable delta in that period for linked locals yet).
- Validation: `npm run typecheck` and `npm run build` pass.

## 2026-05-30 — Billing activation on real data + period picker

### Done in this block

1. **Removed runtime mock data dependencies fully.**
   - Replaced mock-backed runtime paths with Prisma-backed reads across owner/client/admin runtime flows.
   - Deleted `lib/mock-data.ts` after verifying no active imports remain.
2. **Invoice audit/traceability fields added and migrated.**
   - Added to `Invoice`: `periodStartTs`, `periodEndTs`, `startReadingTs`, `endReadingTs`, `startReadingId`, `endReadingId`, `anomalies`.
   - Applied migration `20260530220000_add_invoice_audit_fields` with `npx prisma migrate deploy`.
3. **Linked real locals to real clients for billing readiness.**
   - Linked 3 locals in **NID® Puerto Cancún** + 3 locals in **NIDO** to real client records.
4. **Tariffs set for real buildings.**
   - Added baseline tariffs to NID/NIDO and backdated `effectiveFrom` so closed-month billing can resolve tariffs.
5. **Billing now generates real invoices (period-targeted).**
   - Scanned readings by month and identified movement in **May 2026**.
   - Ran `runMonthlyBilling({ period: { year: 2026, month: 5 } })`:
     - NID® Puerto Cancún: `created=1`, `skipped=2 (zero_consumption)`
     - NIDO: `created=1`, `skipped=2 (zero_consumption)`
6. **Owner billing period picker added.**
   - Added `input type="month"` to owner **Resumen** and **Recibos** modals.
   - API now receives explicit `{ period: { year, month } }` from owner flow.
7. **Validation passed.**
   - `npm run typecheck` ✅
   - `npm run build` ✅

## Next steps toward final goal (Belimo -> scoped views -> invoices)

### 1) Stabilize billing correctness and usability

- **Promote billing run metadata into owner UI history.**
  - Show last run info (period, counts, timestamp, operator) in owner resumen/recibos.
- **Add “billable month hints.”**
  - Precompute and display recent months with non-zero delta per building so owners avoid zero-consumption runs.
- **Rerun policy hardening in UI.**
  - Clearly indicate `updated` vs `locked (paid)` results per local in the modal.

### 2) Close remaining scope/data integrity gaps

- **Finish owner inquilinos as operational (not just view).**
  - Add assign/unassign local -> client actions (or temporary admin endpoint) from the inquilinos page.
- **Replace placeholder recipient email logic.**
  - Use real client contact field(s) for recipients instead of derived `name@example.com` stubs.
- **Owner building scoping cleanup.**
  - Ensure owner switcher includes only real active buildings intended for production operations.

### 3) Complete invoice lifecycle (post-generation)

- **Status transitions + due-date rules.**
  - `BORRADOR -> GENERADA -> ENVIADA -> PAGADA/VENCIDA` transitions via explicit actions/jobs.
- **Owner cobranza/recibos actions on real invoices.**
  - Mark sent, mark paid, and overdue calculation based on due date.
- **Basic audit visibility.**
  - Show stored audit fields (`period*`, `reading*`, `anomalies`) in invoice detail/debug panel.

### 4) Final productionization steps

- **PDF/email delivery integration** for generated invoices.
- **Remove residual demo affordances** (placeholder “Próximamente” actions, non-functional buttons).
- **Ops guardrails**
  - Add cron/alerting for ingest and billing failures.
  - Add data quality checks (missing tariffs, missing local-client links, stale readings).

## Suggested immediate execution order (next 3 commits)

1. **Billing UX completion**: billable-month hints + richer generation summary rows.
2. **Invoice lifecycle actions**: send/paid/overdue flows wired to real DB state.
3. **Recipient + tenant ops**: real contact emails + local/client assignment actions in owner/admin UI.

## 2026-05-31 — Billing hardening, history recovery, and first audited invoice

### Done in this block

1. **Implemented the billing/lifecycle/admin-linking tranche from handoff plan.**
   - Tariff model extended in Prisma with legacy-model fields:
     `efficiencyKwhPerTonHr`, `cfeRatePerKwh`, `includeHeating`, `applyTax`.
   - Added migrations for tariff fields and reading idempotency index; generated Prisma client.
   - Reworked billing to `BillingPeriod`-driven generation (`runBillingForPeriod`) and owner API contract to `billingPeriodId`.
   - Added owner billing periods endpoint and invoice lifecycle actions endpoint (`mark_sent`, `mark_paid`, `mark_overdue`).
   - Updated owner resumen/recibos modals to use billing-period selection (instead of month input).
   - Added admin linking endpoints and UI wiring on building detail for:
     building->owner org, local->client, valve->floor/local.

2. **Root-cause fixed for "timeseries count=0" (critical).**
   - Direct Belimo probe proved history exists for known valve `001-001-007`.
   - Found parser mismatch: Belimo returns `series[]` with `values[{timestamp,value}]`, not `data[]`.
   - Patched `getTimeseries` to normalize `series[]` into `{ ts, values }[]`.
   - Corrected timeseries request defaults to Belimo-valid values: `resolution=1d`, `aggregation=last`.

3. **Backfill tooling validated and executed (throttled).**
   - Added secured probe/backfill paths (supports admin auth and `x-cron-secret` for terminal execution).
   - Real backfill completed for 6 client-linked pilot valves in staged batches (1 -> 2 -> 3):
     - Total processed/upserted points: `2556`
     - Errors: `0`
     - Coverage per pilot valve: `2025-04-01` to `2026-05-31`.
   - Real backfill then executed for cross-check valve `001-001-007` (`belimoId=8a8fee50-...`):
     - Points/upserts: `426`
     - Errors: `0`
     - Coverage: `2025-04-01` to `2026-05-31`.

4. **Detected and fixed mixed-granularity seam issue before billing.**
   - Monotonicity check surfaced negative same-day steps caused by overlap of:
     - daily backfill row (`00:00` bucket value) and
     - intraday live ingestion snapshots.
   - Took table backup: `reading_backup_20260531_2153.sql`.
   - Executed one-time cleanup:
     - Deleted duplicate overlap rows: `124`
     - Normalized surviving intraday timestamps to day boundary: `99`
   - Post-cleanup verification:
     - `total_readings=3077`
     - `dup_valve_days=0`
     - cross-check valve monotonic for sampled window.

5. **Added permanent guards to prevent recurrence.**
   - `lib/ingest.ts`: write at day grain; merge same-day values by cumulative max
     (`energyTonHr`, `waterM3`), preserving instantaneous `powerTon` from winning row.
   - `app/api/admin/billing/backfill/route.ts`: same day-grain cumulative-max merge behavior.
   - `lib/billing.ts`: boundary read selection hardened to prefer highest cumulative reading at/before boundary.

6. **Generated first audited real invoice (pilot local) and hand-verified arithmetic.**
   - Target local: `001-001-003` (NID® Puerto Cancún), period: **Abril 2026**.
   - Billing run summary for that building/period: `created=1`, `skipped=2`, `errors=0`.
   - Invoice reconciliation checks passed:
     - `end_reading - start_reading == energyTonHr`
     - line-item math and tax rollup match stored totals.

### Important billing correctness note (open)

- The first audited invoice is **internally consistent**, but currently used fallback `energyRate`
  because `efficiencyKwhPerTonHr` and `cfeRatePerKwh` are still null on tariff rows.
- Water billing policy remains unconfirmed against client business rules (legacy snapshots showed
  water often billed as `0.00` in prior system views).
- Therefore state is: **pipeline proven end-to-end; commercial formula inputs pending confirmation**.


## 2026-05-31 — Post-restart integrity closure + NIDO lifecycle checkpoint

### Done in this block

1. **Closed the remaining NID history gap to zero.**
   - Continued throttled backfill batches until NID moved from `38` missing valves to `0`.
   - Post-run history coverage:
     - `NID® Puerto Cancún`: `0 / 62` missing pre-`2025-06-01`
     - `NIDO`: `0 / 14` missing pre-`2025-06-01`

2. **Fleet integrity checks re-run after the direct-Prisma backfill closure.**
   - Duplicate day-grain check: `dup_valve_days = 0`.
   - Monotonic cumulative check initially: `negative_steps = 4`.
   - Applied idempotent cumulative-max normalization (`UPDATE 8`) and re-checked.
   - Final checks: `dup_valve_days = 0`, `negative_steps = 0`.

3. **Resolved live-service staleness for app/API verification.**
   - Confirmed stale runtime before restart (`timeseries-probe` 404 from running app).
   - Human executed interactive restart:
     - `ActiveEnterTimestamp=Sun 2026-05-31 23:01:53 CEST`
   - Live service now matches current build for endpoint/UI tests.

4. **Exercised efficiency×CFE formula branch in production code path.**
   - Inserted provisional NIDO tariff row for test period with:
     - `efficiencyKwhPerTonHr=1.99`, `cfeRatePerKwh=3.43`
     - `waterRate=0` (water off for test), `applyTax=true`, `includeHeating=false`
   - Ran full-building billing for NIDO period **Abril - Locales**:
     - `created=1`, `skipped=2`, `updated=0`, `errors=0`
   - Created invoice: `cmpu9pj780001kl7kkibl2mqe`
   - Invoice anomalies confirm branch: `billingMode=legacy_efficiency_cfe`.
   - Reconciliation:
     - Stored `energyAmount` matches efficiency×CFE computation from full-precision delta;
       display-rounded TON-hr naturally shows a small rounding presentation gap.

5. **Explained skipped NIDO locals as true zero usage (not data holes).**
   - Boundary coverage present for all 3 linked NIDO locals (`valves_missing_boundary=0`).
   - Local deltas:
     - `001-004-002`: non-zero (billed)
     - `001-004-003`: zero
     - `001-004-004`: zero

6. **Lifecycle endpoint behavior validated with rollback-safe state-machine test.**
   - Transaction simulation proved:
     - `GENERADA -> ENVIADA`
     - `ENVIADA -> VENCIDA`
     - `VENCIDA -> PAGADA` (`paidAt` set)
     - `PAGADA` blocks further `mark_sent` / `mark_overdue`
   - Used `BEGIN ... ROLLBACK` so no persistent test mutation was left behind.

7. **Recipient resolution checked for NIDO invoice.**
   - No placeholder `@example.com` recipients on NIDO invoices.
   - Current resolved recipient comes from fallback `Client.org.contactEmail`
     (`espaciocancun@gmail.com`) because no client-user email exists yet.

### Important note (risk to resolve before real sends)

- Recipient fallback to owner/org email is functional but unsafe as a generic send behavior for
  tenant invoices (privacy/correctness risk).
- Before real email dispatch, the send path should enforce recipient-confidence and fail with
  "needs attention" when tenant recipient email is missing, instead of silently sending to org fallback.

### Next steps (handoff sequence)

1. **Set dedicated NIDO tenant contact email on intended source-of-truth path**
   (prefer client `User.email` if tenant login identity is canonical).
2. **Run one real persistent endpoint lifecycle pass** on
   `cmpu9pj780001kl7kkibl2mqe`: `GENERADA -> ENVIADA -> PAGADA`; confirm live owner UI pill/state
   updates and persisted `paidAt`.
3. **Keep `VENCIDA` out of persistent run** unless explicitly testing due-date behavior.
4. **Add recipient-confidence guard before SMTP/PDF send rollout.**
5. **Do not scale billing beyond controlled test scope** until commercial tariffs are confirmed
   (mechanics proven, rates still provisional).

## 2026-06-01 — Owner history UI shipped + unlinked-valve visibility fix

### Done in this block

1. **Built owner valve history UI (legacy-style, Reading-backed, no client-link dependency).**
   - New route: `app/(owner)/owner/valvulas/[valveId]/page.tsx`.
   - Wired from owner floor view: valve chips in `owner-valvulas.tsx` now deep-link to valve history.
   - History page shows:
     - 14-month TON-hr trend,
     - 30-day delta table (TON-hr/m³),
     - cumulative readings table (latest 120 rows),
     - coverage metadata (oldest/newest point, total readings).

2. **Clarified the "2 readings" confusion by design.**
   - Floor-row metric `24h: X TON-hr · Y m³` is intentionally a **recent delta** from the latest 2 points.
   - It is not total history depth.
   - Verified with live example valve page showing `Lecturas: 426` and history range `2025-04-01` to `2026-05-31`.

3. **Fixed monthly trend interaction bug (duplicate month labels across years).**
   - Root cause: chart used month text labels as React keys/hover IDs (`Abr`, `May`) across 14 months.
   - Fix:
     - `MonthlyBars` now accepts/stabilizes unique `id` per month (e.g., `2026-05`).
     - Valve-history monthly labels now include year suffix (`Abr 25`, `May 26`) to avoid ambiguity.

4. **Fixed owner visibility semantics for unlinked/no-invoice rows.**
   - `getOwnerScopedView` now includes last 2 readings per valve in floor data.
   - For rows without invoice amount (`amount = "—"`), consumption now renders live usage as:
     - `24h: <delta TON-hr> · <delta m³>`.
   - Status semantics corrected:
     - row status `Sin cliente` for unlinked locals,
     - row status `Sin facturar` for linked-but-not-invoiced locals,
     - floor header can resolve to neutral `Sin facturar` (instead of incorrectly escalating to `Con vencidos`).

5. **Live service and integrity confirmations (post-restart discipline).**
   - Confirmed systemd app restart timestamp was newer than build artifact:
     - `ActiveEnterTimestamp=Mon 2026-06-01 07:35:09 CEST`
     - `.next/BUILD_ID mtime=Mon 2026-06-01 07:34:25 CEST`.
   - Re-checked integrity pair on live data:
     - `dup_valve_days = 0`
     - `negative_steps = 0`.

6. **Coverage reality check (not just pilot valves).**
   - NID® Puerto Cancún: `62/62` valves with readings, all with 3+ points.
   - NIDO: `14/14` valves with readings, all with 3+ points.
   - Both buildings have history back to `2025-04-01`, latest at `2026-05-31`.

### Validation

- `npm run typecheck` ✅
- `npm run build` ✅

### Remaining scope (post this block)

1. **Admin views for all-valve history/health** (client-independent) remain highest-value visibility work.
2. **Owner labels are now semantically correct for unlinked rows**, but an explicit "delta reciente" wording can further reduce confusion around the 2-point row metric.
3. **Billing at scale remains tariff-policy constrained** (mechanics proven; commercial rates still provisional).


## 2026-06-01 — Indicative MTD estimate (display-only) implemented

### Scope completed

Implemented the "Indicative MTD Charge per Valve/Local" feature as compute-on-read only (no invoice writes), with shared math from billing and provisional labeling across owner/admin surfaces.

### Code changes

1. **Shared tariff computation extracted in billing layer**
   - File: `lib/billing.ts`
   - Added exported helper:
     - `computeChargeFromTariff({ tonHr, waterM3, tariff, includeFixedCharge })`
     - exported breakdown type with `energyAmount`, `waterAmount`, `fixedCharge`, `subtotal`, `tax`, `total`
   - Refactored `runBillingForPeriod` to call this helper, preserving existing invoice behavior.

2. **MTD boundary and estimate computation added to scoped data**
   - File: `lib/scoped-data.ts`
   - Added estimate types:
     - `EstimateStatus = ok | no_tariff | no_data`
     - `RowEstimate` payload
   - Added MTD helpers:
     - `monthStartUtc()`
     - `getMtdUsageByValveId(...)` using billing-style boundary semantics
       - start = highest cumulative reading at/before month start (fallback earliest after boundary)
       - end = latest reading
     - `getEffectiveTariffByBuildingId(...)`
     - `makeEstimateDisplay(...)` with mandatory labeling.
   - Owner estimates:
     - Added estimate fields to owner local/cobranza rows.
     - Local-level estimate aggregates valve MTD usage.
     - Fixed charge included only at local level.
   - Admin estimates:
     - Added estimate fields to `/admin/valvulas` rows and `/admin/uso` valve coverage rows.
     - Per-valve estimates exclude fixed charge.

3. **Owner/Admin UI rendering updated**
   - `components/owner/owner-valvulas.tsx`
     - now renders `≈ $X · estimado (tarifa provisional)` (or fallback label) per row.
   - `components/owner/owner-cobranza.tsx`
     - invoice amount remains unchanged; estimate shown alongside as provisional.
   - `app/(admin)/admin/valvulas/valvulas-client.tsx`
     - added "Estimado MTD" column.
   - `app/(admin)/admin/uso/page.tsx`
     - added "Estimado MTD" column on valve coverage table.

### Guardrails preserved

- No schema migration required for this feature.
- No persistence of estimate values.
- No writes to `Invoice` from estimate code path.
- Mandatory provisional label and no-tariff fallback:
  - `≈ — (sin tarifa)`
  - `≈ — (sin datos)`

### Validation run

- `npm run typecheck` ✅
- `npm run build` ✅

### Post-implementation review note

Operator review flagged flat estimates (same `$139` across rows). This is documented in `HANDOFF-feature-batch.md` addendum as an explicit follow-up diagnostic:
- could be a real variable-term bug, or
- could be expected on **June 1 MTD** where variable usage is near-zero and fixed charge dominates.

Required next verification: inspect per-row estimate breakdown (`energyAmount`, `fixedCharge`, `total`) on live data before final sign-off.


## Done so far (2026-06-02 follow-up)

1. **Owner valve-history moved from invoice-dependent to computed monthly reference ledger.**
   - Replaced valve detail "Cargos por mes" source from existing invoices to **computed closed-month rows from readings** (last 14 closed months).
   - Windowing now uses **calendar month boundaries in America/Cancun** (month start -> next month start).
   - Consumption uses boundary semantics aligned with billing in this repo: max cumulative at/before each boundary, diffed per valve, summed at local level.

2. **Persisted paid/unpaid state for computed history (reference-only, not invoice).**
   - Added Prisma enum/model:
     - `ComputedPaidStatus` (`PENDIENTE`, `PAGADO`)
     - `ComputedMonthlyStatus` with unique `(localId, monthKey)` + `paidAt` + `note` + timestamps.
   - Added and applied migration: `20260602090000_add_computed_monthly_status`.
   - New owner API route: `POST /api/owner/computed-history/status` with actions:
     - `mark_paid` (single month)
     - `mark_pending` (single month)
     - `mark_paid_range` (bulk month range; idempotent via upsert)

3. **New valve-history UI controls for monthly reference state.**
   - Added `components/owner/owner-computed-history.tsx` and wired it into `owner/valvulas/[valveId]`.
   - Added per-month toggle (Pagado/Reabrir) + bulk "Marcar históricos como pagados".
   - Updated section wording to **"Historial de referencia"** so it no longer implies retro-generated official invoices.

4. **Reference formula alignment to match client expectation (PDF-like view).**
   - For reference displays, switched to simplified model:
     - subtotal = `TON-hr * energyRate`
     - IVA if enabled (`taxRate`)
     - no fixed charge, no water charge, no efficiency*CFE path in these reference cards.
   - Implemented via `computeReferenceChargeFromTariff(...)` and applied in owner/admin estimate callsites that were producing inflated values.

5. **Owner floor + Resumen amounts now represent last finalized month (not rolling/cumulative).**
   - `Válvulas por piso`: floor headers + local amounts now use **last closed month** reference estimates.
   - Mixed-status floor label refined to **"Algunos pendientes de factura"**.
   - Owner `Resumen` KPI cards switched from cumulative invoice sums to month-scoped values and relabeled:
     - `Por cobrar (mes cerrado)`
     - `Cobrado (mes cerrado)`
     - `Vencido (mes cerrado)`

6. **Status semantics clarified in owner views.**
   - Local/floor status now reflects reference month payment state (`Pagado` / `Pendiente de factura`) rather than stale lifetime invoice state.

7. **Validation safety.**
   - Regenerated Prisma client.
   - Applied migrations successfully.
   - Re-ran `npm run typecheck` after each edit batch (passing).

## 2026-06-02 — Structure reorg (Settings) + real valve actuation (Belimo write seam confirmed)

### Structural cleanup (config off the landing page)
- **Owner Settings page** added: `app/(owner)/owner/configuracion/page.tsx` ("Ajustes" nav item).
  - **Building logo upload moved here** from the Resumen first page (`components/owner/owner-resumen.tsx` logo card removed). New client component `components/owner/building-logo-manager.tsx`. Settings also links to Inquilinos.
- Nav: new "Configuración" group in `components/shell/owner-shell.tsx` (+ icons in `owner-nav.tsx`); new "Control" group in `components/shell/admin-shell.tsx`.

### Actuators → dedicated, password-gated tab (owner + admin)
- New pages `app/(owner)/owner/actuadores/page.tsx` and `app/(admin)/admin/actuadores/page.tsx`; shared client `components/actuation/actuator-panel.tsx`.
- Old ungated ON/OFF buttons removed from the owner valve-detail page (now a link to Actuadores); deleted `components/owner/owner-valve-command.tsx`.
- **Re-auth gate (chosen mechanism = re-enter login password):**
  - `lib/actuation-auth.ts` — HMAC token (5-min TTL) signed/verified with **`AUTH_SECRET`** (NextAuth v5; NOT `NEXTAUTH_SECRET` — that var is absent here, the original bug that made the gate reject every command instantly).
  - `POST /api/actuation/unlock` verifies password (bcrypt) → returns short-lived token.
  - `POST /api/valves/[valveId]/command` now requires header `x-actuation-token`; still role-gated (Administrador / Administrador Edificio) and allowlist-gated.

### Belimo WRITE/actuation seam — discovered and CONFIRMED working
- **Endpoint:** `POST /devices/{id}/data`  ·  **Body:** `{"datapoints": {"evcloud.30": <int>}}` (raw integer value; `{value:n}` is rejected "Invalid format"). Other paths (`/datapoints`, `/commands`) 404 for writes.
- **Datapoint:** `evcloud.30` = "Override Control" (rw enum `1|2|3|4|5|6|7|8|11`).
- **Open/close codes (empirically swept on the dummy, reading applied `evcloud.30` vs `evcloud.80` position):**
  - **`4` → 100% OPEN**, **`1` → 0% CLOSED** (also: `2`→0%, `3`→~32%, `8`→100%). Wired as `BELIMO_ACTUATION_ON_VALUE=4`, `BELIMO_ACTUATION_OFF_VALUE=1`.
- **Scope:** writing needs **`public.write`** (grantable with existing creds; added to `BELIMO_SCOPES`). Default Belimo scope is read-only.
- **Async + slow telemetry:** a write returns `200` with an async command `state:"PENDING"`; the device applies it on its push cycle (**~2–5 min**, sometimes longer). The `/devices/{id}/data` endpoint is the **daily 02:00 snapshot**; LIVE state is `GET /devices/{id}` → `state.datapoints` (still only pushed every ~90 s–5 min, not real-time). So no instant click→move feedback over cloud.
- `lib/belimo.ts` `sendActuationCommand` rewritten to this real format (datapoint + ON/OFF values env-configurable). Generic `BELIMO_ACTUATION_PATH/METHOD` no longer used.

### Why the first UI tests "did nothing" (resolved, NOT a bug)
- App was initially wired ON=1/OFF=2 — but **both 1 and 2 are "closed"**, so it commanded closed→closed. The open code is `4`. Fixed. The full chain (UI → gate → API → cloud → device) worked the whole time; the dummy physically opens/closes from the local Belimo web UI too.
- BACnet was NOT blocking the cloud channel; the cloud override outranks the analog setpoint (Setpoint Source=Analog ~0 V). Device health shows `ERROR: Flow_sensor_error` (expected — valve is on a bench, not in a pipe).

### Admin discovery probe (kept, in-app)
- `POST /api/admin/actuation/probe` + UI on the admin Actuadores page (`components/actuation/actuation-probe.tsx`): admin-only, read-only discovery battery (GET/OPTIONS) + manual write attempts; **hard-restricted to the allowlisted dummy**; write attempts require the password token.

### Safety: allowlist + audit (verified nothing but the dummy was touched)
- Only `BELIMO_DUMMY_DEVICE_ID=62901482-…-3a9d36926cdb` (valve `21932-40148-022-127`) is allowlisted; `BELIMO_ACTUATION_ALLOWLIST` empty. A real valve can be commanded ONLY if its belimoId is explicitly added there.
- Verified: `ValveCommandAudit` = 8 commands, all the dummy; only the dummy has `commandedState/lastCommandAt` set; ingest is read-only to Belimo. **No in-use valve was altered.**
- Temp diagnostic scripts (`scripts/belimo-*.mjs`) were removed after discovery; `scripts/run-ingest.mjs` (operational) kept.

### To activate / test
- `BELIMO_*` actuation env added to `.env` → requires **service restart** (env read at process start). Then: Actuadores tab → unlock with password → Encender (override 4, opens in a few min) / Apagar (override 1, closes).
