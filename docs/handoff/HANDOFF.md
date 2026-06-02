# EVAC cloud v2 — Handoff

_Last updated: 2026-05-31. Source of truth for the next operator._

## What this is

SaaS for AC thermal-energy metering and billing. Belimo Energy Valves report thermal energy
(TON-hr) and water (m3); the platform ingests Belimo Cloud data, scopes it by role
(Admin/Owner/Client), and generates invoices.

Stack: Next.js 16 + TypeScript + Tailwind + Prisma + PostgreSQL + NextAuth.
Runtime: systemd (`evac-cloud.service`) + nginx on Ubuntu VM.
Repo/workdir on server: `/home/mdares/evac-cloud`.

## Current snapshot (verified)

- Fleet discovery is complete: **153 Belimo devices total**, **102 energy valves**.
- `listDevices()` pagination bug is fixed (offset/limit loop to full `paging.total`).
- Owner app is org-scoped with building switcher and runs on real DB data.
- Runtime mock dependencies removed from active app paths (`lib/mock-data.ts` deleted).
- Billing supports period-driven generation and invoice lifecycle actions.
- Real history backfill executed and integrity-normalized.
- First audited real invoices created with reconciliation checks passing.

## Major completed work (2026-05-30 to 2026-05-31)

1. Auth/session scope hardening
- Added `orgId` to auth `authorize`, JWT callback, session callback, and `next-auth.d.ts` types.

2. Belimo ingestion correctness
- Fixed `/devices` pagination (critical: prior code only read first page).
- Confirmed two energy dataprofiles share the same datapoint IDs used by mappings.
- Ingest now decodes `metadata.1001` as `SITE-FLOOR-LOCAL[-VALVE]`.
- Floor/local grouping fixed so multi-valve locals map correctly.

3. Owner scope + navigation
- `getOwnerScopedView(buildingId?)` validates selected building against owner org.
- Added org building context/switcher across owner pages.

4. Billing data model + APIs
- Added invoice audit fields:
  `periodStartTs`, `periodEndTs`, `startReadingTs`, `endReadingTs`,
  `startReadingId`, `endReadingId`, `anomalies`.
- Added tariff fields for legacy billing model path:
  `efficiencyKwhPerTonHr`, `cfeRatePerKwh`, `includeHeating`, `applyTax`.
- Added billing-period endpoint and lifecycle actions endpoint
  (`mark_sent`, `mark_paid`, `mark_overdue`).

5. Timeseries and backfill fix
- Root cause fixed: Belimo timeseries parser expected wrong payload shape.
- Parser now handles `series[] -> values[{timestamp,value}]` correctly.
- Defaults aligned to Belimo-valid daily history usage (`resolution=1d`, `aggregation=last`).
- Backfill executed in throttled batches; no API errors in reported runs.

6. Reading integrity hardening
- One-time cleanup applied for mixed granularity overlap.
- Added permanent day-grain cumulative-max merge behavior in ingest/backfill paths.
- Boundary read selection hardened for billing.
- Final integrity checks: `dup_valve_days=0`, `negative_steps=0`.

7. Billing proof points
- Pilot audited invoice generated for local `001-001-003` (NID, Abril 2026) with arithmetic
  reconciliation passing (`end-start == billed energy basis`, totals consistent).
- NIDO test invoice `cmpu9pj780001kl7kkibl2mqe` created under efficiency*CFE branch,
  anomalies metadata shows `billingMode=legacy_efficiency_cfe`.
- Lifecycle transitions validated in transaction rollback test:
  `GENERADA -> ENVIADA -> VENCIDA -> PAGADA`, with post-PAGADA protections enforced.

## Fleet and data reality

- Real high-activity owner buildings:
  - `NID® Puerto Cancún` (62 valves)
  - `NIDO` (14 valves)
- Inventory/test groups remain:
  - `Sin asignar` (24)
  - `Sin definir` (1)
  - `Testplatz EU` (1)
- History gap closure status:
  - NID pre-2025-06-01 missing valves: `0 / 62`
  - NIDO pre-2025-06-01 missing valves: `0 / 14`

## Billing correctness status

Pipeline status: **mechanically proven end-to-end**.
Commercial status: **still provisional** until client confirms tariff/business policy.

Open business-policy confirmations:
- Final formula policy (efficiency*CFE path is implemented and tested).
- Water billing policy (legacy behavior suggested frequent zero water charges).
- IVA treatment.
- Heating inclusion policy (`includeHeating`).

## Highest-priority risks

1. Recipient safety risk
- Current fallback may resolve tenant invoices to org contact email when tenant email is missing.
- This is unsafe for production sends (privacy/correctness).

2. Provisional tariffs
- Broad billing runs are risky until commercial rates/policy are confirmed.

3. Temporary debug/backfill artifacts
- Must be removed before production hardening closure.

## Strict next-step sequence

1. Set tenant recipient source of truth
- Populate dedicated tenant email on canonical path (prefer client `User.email` if login identity
  is canonical).

2. Run one persistent lifecycle pass on a real invoice
- Use `cmpu9pj780001kl7kkibl2mqe`:
  - `GENERADA -> ENVIADA`
  - `ENVIADA -> PAGADA`
- Verify UI status pill updates and persisted `paidAt`.
- Keep `VENCIDA` out of this persistent pass unless explicitly testing overdue behavior.

3. Add recipient-confidence guard before any real send
- If recipient would fall back to org contact, fail safely as "needs attention".

4. Keep billing scope controlled
- Do not broad-run billing portfolio-wide until tariff policy is confirmed.

5. Remove temporary routes/scripts and close production checklist
- Delete temporary probe/backfill/debug endpoints and leftover patch artifacts.

## Key technical notes

Belimo essentials:
- Auth: OAuth2 password grant + refresh token usage.
- Base: `https://cloud.belimo.com/api/v3`
- `/devices` is paginated; always iterate `offset/limit` to `paging.total`.
- Datapoints in use:
  - `evcloud.200` cooling energy (J -> TON-hr)
  - `evcloud.210` heating energy (J -> TON-hr)
  - `evcloudplus.461` water (m3)
  - `evcloud.140` power (W -> TON)

Conversions:
- `TON-hr = Joules / 12,660,670.8`
- `TON = Watts / 3516.853`

Cumulative semantics:
- `evcloud.200` and `evcloudplus.461` are lifetime counters.
- Billing is boundary delta over selected period.

## Operational commands

```bash
# build + restart
npm run build && sudo systemctl restart evac-cloud.service

# trigger ingest
SECRET=$(grep ^CRON_SECRET .env | cut -d= -f2 | tr -d '"')
curl -s -X POST -H "x-cron-secret: $SECRET" http://localhost:3000/api/cron/ingest | python3 -m json.tool

# tail ingest log
tail /home/mdares/evac-cloud/ingest.log

# psql helper (strip Prisma query params)
DB=$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2- | sed -e 's/^["'\''']//' -e 's/["'\'']$//')
DB_PSQL=$(printf '%s' "$DB" | sed 's/[?].*$//')
psql "$DB_PSQL" -c 'SELECT ...;'
```

## Environment

```dotenv
DATABASE_URL=postgresql://evac_app:<pass>@localhost:5432/evac_cloud?schema=public
NEXTAUTH_SECRET=...
BELIMO_CLIENT_ID=...
BELIMO_CLIENT_SECRET=...
BELIMO_USERNAME=evac@maliountech.com
BELIMO_PASSWORD=...
CRON_SECRET=...
```

## Access (seed)

- `ddares@maliountech.com` (admin)
- `espaciocancun@gmail.com` (owner)
- `contacto@investport.mx` (client)
- Password: `Evac2026!`

## Production-safe checklist

- Remove temp routes/helpers and root-level patch artifacts before release.
- Run `npm run typecheck` and `npm run build` after each structural change.
- Re-run ingest before billing cutoff windows.
- Never mutate `PAGADA` invoices during regeneration.
- Keep this file and `progress-updated.md` aligned at each checkpoint.

## 2026-05-31 — Recipient-confidence guard implemented

### Completed in this step

- Added shared recipient resolver: `lib/recipient.ts`.
  - Prioritizes tenant `Client -> User.email`.
  - Marks org-contact fallback as non-sendable.
- Hardened owner invoice lifecycle API `POST /api/owner/invoices/status`:
  - `mark_sent` now blocks when recipient confidence is low/missing.
  - Returns explicit actionable error when tenant email is missing.
- Surfaced send readiness in owner views:
  - `lib/scoped-data.ts` now emits recipient metadata: `sendEligible`, `recipientSource`, `sendBlockReason`.
  - `owner/recibos` and `owner/cobranza` disable `Enviar` when unsafe and show context.

### Verification

- `npm run typecheck` passed.
- `npm run build` passed.

### Impact on handoff sequence

- Previous strict step 3 (recipient-confidence guard before real send) is now complete in code.
- Remaining highest-priority actions are now:
  1. Set canonical tenant emails on client users for intended recipients.
  2. Execute one persistent lifecycle pass (`GENERADA -> ENVIADA -> PAGADA`) on real invoice and verify UI+DB.
  3. Keep billing scope controlled until tariff policy is commercially confirmed.

## 2026-05-31 — Tenant email source-of-truth workflow added

### Completed in this step

- Added owner-managed tenant email update workflow in
  `app/(owner)/owner/inquilinos/page.tsx` using a server action.
- Updates now target canonical tenant user identity (`Client -> first User.email`) with org/building
  access checks.
- Added validation + operator feedback states for:
  - invalid email
  - tenant user missing
  - email already taken
  - generic failure/success
- Added cache revalidation for owner pages after update:
  - `/owner/inquilinos`
  - `/owner/recibos`
  - `/owner/cobranza`
- Extended owner data model output to include `tenant.clientId` for actionable rows.

### Verification

- `npm run typecheck` passed.
- `npm run build` passed.

### Sequence impact

- Strict step 1 (set canonical tenant emails on client users) is now supported in-product.
- Remaining immediate operations:
  1. Use `Inquilinos` to set real tenant emails for active billed locals.
  2. Execute one persistent lifecycle pass (`GENERADA -> ENVIADA -> PAGADA`) and verify UI/DB.

## 2026-05-31 — Step 5 persistent pass + guard proof completed

### Guard proof (block then allow)

Target invoice: `cmpu9pj780001kl7kkibl2mqe`.

1. **Precondition check** (DB):
   - invoice status: `GENERADA`
   - client user count: `0`
   - fallback recipient present: `Client.org.contactEmail = espaciocancun@gmail.com`

2. **Block test (before tenant email)** against updated app runtime:
   - `POST /api/owner/invoices/status` with `action=mark_sent` returned `400`:
     - `code=missing_tenant_email`
     - `recipientSource=org_fallback`
     - preview showed org fallback email.

3. **Set canonical tenant email**:
   - Linked tenant user created for the client with `email=tenant.nido@example.com`.
   - Recipient precedence SQL confirmed:
     - `tenant_user_email=tenant.nido@example.com`
     - `org_fallback=espaciocancun@gmail.com`

4. **Allow test (after tenant email)**:
   - `mark_sent` returned `200` with:
     - `status=ENVIADA`
     - `recipient=tenant.nido@example.com`
     - `recipientSource=client_user`

### Persistent lifecycle pass

- Executed persistent endpoint transition on the same invoice:
  - `mark_paid` returned `200`, `status=PAGADA`.
- DB verification:
  - `status=PAGADA`
  - `paidAt` persisted (`2026-05-31 21:34:14.484`).
- Post-condition safety:
  - `mark_sent` on paid invoice returns `400` (`No se puede enviar un recibo pagado.`).

### Important runtime note

- `localhost:3000` initially returned old endpoint behavior (`mark_sent` succeeded without recipient metadata), indicating stale process/runtime.
- Guard verification and lifecycle pass were executed against the freshly started updated runtime on `localhost:3100`.
- Before relying on live UI behavior in the systemd-served app, restart `evac-cloud.service` and re-check the endpoint response shape.

## 2026-06-01 — Owner valve-history visibility checkpoint

### Completed in this step

- Added owner valve detail/history route:
  - `app/(owner)/owner/valvulas/[valveId]/page.tsx`
- Wired drill-down from owner floor page:
  - `components/owner/owner-valvulas.tsx` valve chips open valve history.
- History view now surfaces real Reading data (no billing/client dependency):
  - 14-month trend,
  - last-30-day delta table,
  - cumulative readings table,
  - coverage window + total reading count.

### Critical bug fix included

- Fixed 14-month chart month-selection bug caused by duplicate labels across years.
  - `components/charts/monthly-bars.tsx` now uses stable month IDs.
  - history labels now include year suffix (`Abr 25`, `May 26`) to avoid ambiguity.

### Owner visibility semantics corrected

- Unlinked/no-invoice rows now remain visible with real usage deltas.
- Row labels corrected:
  - `Sin cliente` for unlinked locals,
  - `Sin facturar` for linked-but-not-invoiced locals.
- Floor headers can now resolve to neutral `Sin facturar` instead of wrongly showing billing-alert labels.

### Clarification to avoid operator confusion

- Row text `24h: X TON-hr · Y m³` is a **recent delta metric** (latest 2 points), not full history depth.
- Full history depth is available in valve detail (`Lecturas`, oldest/newest range).

### Live-runtime discipline checkpoint

- Verified service restart/build ordering on live app:
  - `ActiveEnterTimestamp=Mon 2026-06-01 07:35:09 CEST`
  - `.next/BUILD_ID mtime=Mon 2026-06-01 07:34:25 CEST`
- Integrity pair remains clean on live data:
  - `dup_valve_days=0`
  - `negative_steps=0`.

### Coverage snapshot (NID/NIDO)

- NID® Puerto Cancún: `62/62` valves with readings, all 3+ points.
- NIDO: `14/14` valves with readings, all 3+ points.
- History window present in both: `2025-04-01` to `2026-05-31`.

### Updated immediate next sequence

1. Build admin all-valve history/health views (client-independent visibility layer).
2. Optionally rename row metric from `24h` to `Δ reciente` to remove the “only 2 readings” misread.
3. Keep broad billing runs gated on tariff/business-policy confirmation; mechanics are proven.
