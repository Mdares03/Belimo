# EVAC cloud v2 — Handoff: feature batch (onboarding, actuation, PDF, logos, email, charts)

_Date: 2026-06-01. This is a build plan for the next phase. Read the project's prior handoffs for
context (data pipeline, billing, integrity all verified). Conventions that have held all session:
exact find/replace or Python-patch edits + full-file overwrites (NOT chained sed/heredocs that paste-
corrupt); after EVERY change: build -> `sudo systemctl restart evac-cloud.service` (interactive) ->
confirm `ActiveEnterTimestamp` is post-build -> look at the actual value on :3000. "typecheck/build ✅"
is necessary, never sufficient. Spanish (Mexico) UI copy; English working language._

## ⚠️ DO THIS FIRST — diagnose whether ingestion is even running (possible outage)

The operator reports **not seeing today's reading**. That may mean the daily/15-min ingest cron is
NOT running — which is a silent data-pipeline failure, not a feature gap. The whole platform depends on
fresh readings; if this is broken, billing slowly runs on stale data. Diagnose before building anything:

```bash
crontab -l                                   # is the ingest job present?
tail -50 /home/mdares/evac-cloud/ingest.log  # last successful run? errors? auth failures?
systemctl show evac-cloud.service -p ActiveEnterTimestamp   # is the service even current?
# most recent reading actually in the DB, per building:
psql "$DB_PSQL" -c 'SELECT b.name, max(r.ts) AS last_reading FROM "Reading" r JOIN "Valve" v ON v.id=r."valveId" JOIN "Building" b ON b.id=v."buildingId" GROUP BY b.name ORDER BY last_reading DESC;'
```
Likely causes (from this session's history): the cron POSTs to `:3000` but the **service was stale**
(restart blocked by sudo password prompt) so the route 404'd; or `CRON_SECRET` mismatch; or the cron
was never persisted. Note also: Belimo's snapshots are timestamped **02:00 daily** (device-native);
"today's reading" may legitimately not appear until after Belimo publishes it. Confirm what's actually
wrong before changing the schedule.

### Then: move ingest to a daily 02:00 run (item 6)
Once ingestion is confirmed working, change the schedule from every-15-min to **once daily at 02:00**
(aligns with Belimo's snapshot cadence; reduces API pressure). Edit the user crontab; keep the
`x-cron-secret` guard. Verify the next 02:00 run lands a new `Reading` row per active valve and
appends to `ingest.log`. (Decide explicitly: replace the 15-min job, don't leave both.)

## 1. Hourly power line chart (photo 1, bottom) — REAL hourly data, not fabricated

Constraint confirmed: current stored readings are **daily** snapshots (resolution=1d), so an hourly
power-by-hour chart CANNOT be drawn from existing data. **Do not fabricate hourly points.**

Build it from a real Belimo pull:
- Add a server fn that calls `getTimeseries(deviceId, ["evcloud.140"], { from: <day 00:00>, to: <day
  23:59>, resolution: "1h", aggregation: "last" })` for a selected building/valve + day, converts
  W->TON (`/3516.853`), returns 24 hourly points.
- The "Consumo … por Día" daily bar chart (photo 1 top) CAN come from existing daily deltas (reuse the
  monthly/daily aggregation already in `getOwnerValveHistory` / the admin usage view), aggregated
  across the building's valves.
- **Fallback rule:** if the hourly pull returns empty/unavailable for your Belimo account, render
  daily-resolution power with an HONEST label ("resolución diaria") — never invented hourly points.
  (First probe `resolution=1h` on the dummy/known valve to confirm hourly history exists, same as the
  timeseries probe pattern.)

## 2. Daily/sample tables descending (photos 2 & 3)

In `getOwnerValveHistory`: the "Últimos 30 días (delta)" table currently ascends (02/05 first); the
samples table already descends (newest first). Make the **daily table newest-first** to match. This is
a sort/`.reverse()` flip on the `recentDaily` array — confirm the chart (if any) still reads
chronologically while the TABLE reads newest-first. Trivial, but verify live.

## 3. Valve on/off — REAL actuation (controls physical HVAC — handle with extreme care)

The operator wants **real actuation** (open/close the physical valve), available to **admin AND
building owner**, and has a **dummy valve** for testing.

**Critical:** every Belimo call used so far is READ-ONLY (`/devices`, `/data`, `/timeseries`). A WRITE/
command endpoint has NOT been confirmed to exist or been tested. A bug here controls real building
cooling. Therefore, spec in this order — DO NOT skip to "wire a button to any valve":

1. **Confirm the write endpoint.** Check Belimo Cloud API docs for a device command/write/control
   endpoint (setpoint/open-close/override). If unknown, discovering+verifying it is step one. Build a
   TEMP admin probe (like timeseries-probe) that issues a command to the DUMMY valve's belimoId ONLY
   and reports the response. Verify against the physical dummy valve before any UI.
2. **Hard allowlist.** Until explicitly widened, only the dummy valve's UUID may be commanded
   (env var or constant). This prevents an accidental fleet-wide actuation during development.
3. **Then** the action: server route (auth + role-gated: admin OR the owner of that valve's building),
   calls the Belimo command, records the intent + result + actor in an audit log (who toggled what,
   when, response). Reflect desired state on `Valve` (add a field, e.g. `commandedState` /
   `lastCommandAt` / `lastCommandBy`).
4. **UI:** on/off control on the valve in admin valve views AND owner Válvulas-por-piso/valve detail,
   role-gated, with a confirm step (actuating a real valve isn't a casual click). Show current vs
   commanded state; surface command failures.
5. Never expose actuation behind an unauthenticated route. Never command a valve outside the allowlist
   until the operator confirms readiness.

OPEN QUESTION for the operator: does Belimo's API have a known command/write endpoint, or is finding it
part of this task? (Doesn't block starting — step 1 is the probe either way.)

## 4. File upload / storage — owner logo (NEW subsystem, prerequisite for the PDF)

No upload/storage exists yet; this must be built before the PDF logo works.
- Storage: decide local disk (e.g. `/home/mdares/evac-cloud/uploads/…` served via a route or nginx)
  vs object storage. Local disk is simplest for this VM; ensure it's OUTSIDE the build dir and backed
  up. Validate type (png/jpg/svg), size cap, dimensions.
- Model: add `logoPath`/`logoUrl` to **Building** (the logo is per-building/owner — photo 4 shows the
  NID/Puerto Cancún building logo, NOT the tenant's). Migration needed.
- Upload UI: in the owner app (owner uploads their building's logo) and/or admin. A square upload slot
  (matches the square logo area in photo 4). Show current logo + replace.
- The PDF (item 5) reads `Building.logoPath`; fall back to a neutral placeholder if none set.

## 5. PDF invoice generation + email (photo 4 is the template)

### PDF rendering
- Recreate the legacy layout (photo 4) faithfully-ish: header with **owner/building logo** (from item
  4) + "VISTA PREVIA" banner; Razón Social / Edificio / Piso / Válvula / Correo / Nombre Comercial /
  Local block; "Medición de Energía para la Climatización"; Periodo Fecha Inicio/Fin; LECTURA
  Actual/Anterior/Consumo (= the cumulative end/start readings + their delta — you already store these
  as the invoice's `startReading`/`endReading` audit fields); CLAVE/DESCRIPCIÓN/CANTIDAD/PRECIO/TOTAL
  line(s); SUBTOTAL / IVA / TOTAL; "Consumo Diario del Mes" chart.
- Library: NO renderer is chosen yet — OPEN QUESTION. Legacy served `demo.evac.mx/temp/*.pdf`
  (server-rendered). Pick a server-side approach (e.g. a React->PDF or HTML->PDF lib) and state it.
- The PDF's NUMBERS come straight from the existing `Invoice` row (energyTonHr, the efficiency×CFE
  total, IVA, the start/end readings). Reuse them — do not recompute.
- ⚠️ The invoice VALUES are still on PROVISIONAL tariffs (efficiency 1.99 / CFE 3.43 / water off / IVA
  on, from the legacy screenshot) pending client confirmation. The PDF will render whatever the invoice
  holds — fine for preview, but see the gate below before SENDING to real tenants.

### Email send (SMTP2GO) — BUILD WIRED, LEAVE GATED
- Transport: **SMTP2GO**; config to be provided later — leave the transport pluggable, read creds from
  env, do not hardcode.
- Recipient resolution already exists (`lib/recipient.ts`) with the confidence guard (refuses to send
  when it'd fall back to org email; needs tenant user email). Reuse it — send only to confirmed
  tenant emails.
- Owner "Generar y enviar recibos" flow: generate PDFs per tenant -> send via SMTP2GO -> mark invoice
  ENVIADA (lifecycle endpoints already exist: mark_sent/mark_paid/mark_overdue).
- **GATE: do NOT enable real sending until (a) SMTP2GO config is provided AND (b) the client confirms
  the billing formula values.** Sending real invoices on provisional pesos to real tenants is the one
  irreversible mistake here. Until then: generate + preview PDFs, allow send only to a test address.

## 6. (covered above — daily 02:00 ingest)

## 7. End-to-end onboarding flow (stitch existing pieces into one coherent path)

Target flow: owner wants Belimo -> **admin** onboards owner + building, pairs valves to the building ->
owner gets account scoped to their building(s) -> owner onboards **tenants** (create account, assign
valves/locals, set tenant email) -> metering + billing + PDF proceed.

Pieces that EXIST (verify each is live on :3000, not just compiled): admin linking APIs
(`building-org`, `local-client`, `valve-placement`), owner Inquilinos email workflow, org-scoped owner
views + building switcher, recipient guard, lifecycle endpoints.

Likely MISSING / to build:
- **Valve pairing method (admin side).** The system-owner (valve seller) pairs a physical valve to a
  building. Today valves arrive via ingest with raw metadata; "Sin asignar" inventory needs an admin
  action to assign valve -> building -> floor/local. Build/confirm this as the pairing UI
  (extends `valve-placement`).
- **Owner-creates-tenant flow:** create tenant Client + tenant User (with email), assign local(s)/
  valve(s), in one owner-side flow (Inquilinos). Ensure the tenant User email is the canonical
  recipient (feeds item 5's guard).
- **Role division (confirm holds):** ADMIN provisions owners/buildings + pairs valves; OWNER assigns
  to tenants + bills. (Matches product spec.) Actuation (item 3) is the exception — both admin and
  owner can toggle.
- Stitch: make sure each step hands off to the next without a dead end (e.g. after admin pairs valves,
  they appear in the owner's building; after owner assigns a tenant, billing/PDF light up).

## Cross-cutting safety carried forward
- **OK status ≠ installed-and-metering.** Inventory + uncommissioned valves read OK + zero (verified
  legit, not a data bug). Before billing/PDF, a preflight should warn on "linked local whose valve has
  zero lifetime consumption" so a dormant valve never produces a silently-valid $0 invoice.
- Integrity: keep `dup_valve_days = 0`, `negative_steps = 0`; re-check after any new ingest/backfill.
- Provisional tariffs + the incumbent's local->client->tenant mapping export remain the open client
  asks.

## Suggested build order (dependencies)
1. **Diagnose + fix ingest** (possible outage; everything depends on fresh data) -> then 02:00 cron.
2. **Descending tables** (photo 2/3) — trivial, do while in the file.
3. **File upload/storage + Building.logo** (prerequisite for PDF).
4. **PDF generation** (preview only) — reads existing invoice + logo.
5. **Hourly power chart** (real Belimo 1h pull, or honest daily fallback).
6. **Onboarding flow stitch** (valve pairing + owner-creates-tenant).
7. **Actuation** — probe write endpoint on dummy valve behind allowlist FIRST, then UI.
8. **Email send** — built but GATED until SMTP2GO config + client rate confirmation.

## Open questions still needing the operator
- Belimo: is there a known command/WRITE endpoint, or is discovering it part of item 3?
- PDF: which server-side render library do you want? (None chosen.)
- SMTP2GO config (pending — you said you'll provide).


## 2026-06-01 Addendum — MTD Estimate Flat-Value Diagnostic (from operator review)

A critical observation was raised during live review of the new indicative MTD estimate:

- Multiple locals with very different usage were showing the same estimate (around `$139`).
- One row with `0.00 TON-hr` also showed the same estimate.

This can mean either:

1. **Real bug:** variable term is not being applied (only fixed charge survives), or MTD delta is coming back 0 due to boundary/math wiring.
2. **Date-window effect:** because this review happened on **June 1, 2026**, true calendar **month-to-date** may legitimately be near zero for many valves, so fixed charge dominates and values appear flat.

### Required verification (do not sign off from UI alone)

Inspect the actual estimate breakdown for at least one known valve/local row:

- `energyAmount`
- `waterAmount`
- `fixedCharge`
- `subtotal`
- `tax`
- `total`

Interpretation:

- If `energyAmount ~= 0` and `fixedCharge ~= 139`, this may be correct for June 1 MTD (not a compute bug), but UX is highly misleading.
- If `energyAmount` should be non-zero but remains zero for non-trivial MTD usage, then the bug is in MTD aggregation or tariff multiply path.
- If `energyAmount` is non-zero but UI still shows a flat number, UI is rendering the wrong field.

### Operational check to isolate data vs app logic

Run an MTD delta check directly from DB for sampled valves and compare with app-calculated MTD deltas.
If DB deltas vary but UI estimate stays flat, app logic/rendering is wrong. If DB deltas are near-zero on June 1, flat estimates can be expected.

### UX implication (even if math is correct)

MTD on day 1 can appear “broken” because fixed charge dominates. Keep this in mind for product interpretation. Consider follow-up UX improvements such as showing variable/fixed components inline or alternate time windows (e.g., trailing 30d / last complete month) if operator confusion persists.

