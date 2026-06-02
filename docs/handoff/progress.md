# EVAC cloud v2 — Progress & Handoff

_Last updated: 2026-05-30. Living document — update as work proceeds._

## What this is

SaaS for AC thermal-energy metering & billing. Belimo Energy Valves in buildings meter
thermal energy (TON-hr) and water (m³); the platform reads that via the **Belimo Cloud API**,
attributes consumption to tenants/locales, and generates monthly invoices. Three role-scoped
apps: **Client** (tenant), **Owner** (building owner / dueño), **Admin** (EVAC / system owner).
UI is Spanish (Mexico). See `README.md` for the full product spec.

Stack: Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind · Prisma · PostgreSQL ·
NextAuth (credentials, JWT). Deployed via systemd (`evac-cloud.service`) + nginx on an Ubuntu VM.
Working dir on the box: `/home/mdares/evac-cloud`.

## End goal

Replace all mock data with the real seam: **Belimo -> Postgres -> role-scoped views -> invoices**.
Each role sees only its scope (system provisions owners/buildings/valves -> owner bills tenants ->
client pays). Billing is the last piece.

## Done so far

1. **Real Belimo client** (`lib/belimo.ts`) — replaced the stub. OAuth2 password-grant with token
   caching + refresh; `listDevices`, `getDeviceData`, `getTimeseries`, `getDataprofile`,
   `inspectDevice`, `getBelimoConnectionStatus`. Reading mapping (`toReading`) + status mapping
   (`toValveStatus`). Datapoint IDs hardcoded (whole fleet is one profile — see table).
2. **Datapoint mapping decoded** for the fleet (all `energyvalve3`). See table below.
3. **Organization model** added (`OrgType` enum + `Organization` model + `orgId` on
   `User`/`Building`/`Client`). Migration `20260530072537_add_organizations`.
4. **Seed updated** (`prisma/seed.ts`) — creates one SYSTEM org (EVAC) + one OWNER org per dueño
   (Espacio Cancún, NID, Altea) and stamps `orgId` on every building/client/user. DB reset + reseeded.
   NOTE: still seeds mock buildings/clients/locals/invoices for owner/client demo; mock VALVES removed.
5. **Ingestion** (`lib/ingest.ts` + `app/api/cron/ingest/route.ts`) — loops the fleet, skips
   non-energy actuators, resolves building/local from device metadata, upserts Valves on `belimoId`,
   appends a cumulative Reading + status. Verified: 20 devices seen, **17 energy valves**, 3 skipped,
   0 errors. Idempotent (re-sync creates 0 dupes).
6. **Mock valves removed.** The seed used to create 9 demo valves (`belimoId = null`), which polluted
   the admin fleet view (showed 26 = 17 real + 9 mock). Deleted via
   `DELETE FROM "Valve" WHERE "belimoId" IS NULL;` and the mock-valve loop removed from `seed.ts`.
   Real = has UUID `belimoId`; mock = null.
7. **Admin fleet views live on real data:**
   - `app/(admin)/admin/estado/page.tsx` -> server component using `getAdminFleetView()`
     (KPIs, pendientes, Belimo connection, por-edificio) from the DB.
   - `app/(admin)/admin/valvulas/page.tsx` -> server component loads `getAdminValves()` and passes
     valves + counts + dynamic client/building filter options into `valvulas-client.tsx` (which no
     longer imports mock data). Tiles/search/filters all work on live valves.
   - Both data functions appended to `lib/scoped-data.ts`.
8. **Cron** installed (user crontab): every 15 min POSTs `/api/cron/ingest` with `x-cron-secret`,
   logging to `/home/mdares/evac-cloud/ingest.log`. Verified the endpoint authenticates (secret
   len=48, single line).

## Belimo API specifics (hard-won)

- **Auth:** OAuth2 **password grant**. Token URL `https://id.belimo.com/oauth/token`,
  audience `https://api.cloud.belimo.com/`, scopes `public.read offline_access read:dataprofile`.
- **REST base:** `https://cloud.belimo.com/api/v3` (Swagger 2.0, host `cloud.belimo.com`, no basePath).
- **Endpoints:** `GET /devices`, `GET /devices/{id}/data` (current datapoints, keyed by
  profile-specific IDs), `GET /devices/{id}/data/history/timeseries` (aggregated history — for
  billing), `GET /definitions/dataprofiles/{id}/{ver}` (resolves datapoint IDs -> name/desc/unit).
  The dataprofile `ref` is a full path (`/definitions/dataprofiles/...`) — pass it directly, don't
  re-prefix.
- **Device identity:** `id` (UUID) -> `Valve.belimoId`; `serialNumber` -> `Valve.serial`;
  `deviceType`/`dataprofile.displayName` -> type/profile. Building/local come from the data payload:
  `metadata.1004` = building name, `metadata.1002` = project, `metadata.1001` = device/local code,
  `metainfo.100` = city.

### Datapoint mapping (energyvalve3 family — entire fleet)

| EVAC field | Datapoint | Raw unit | Conversion |
|---|---|---|---|
| Thermal energy | `evcloud.200` (Cooling Energy) | Joules | / 12,660,670.8 -> TON-hr |
| (heating, if used) | `evcloud.210` (Heating Energy) | Joules | / 12,660,670.8 -> TON-hr |
| Water | `evcloudplus.461` (Flow_Volume_total_m3) | m3 | none |
| Power | `evcloud.140` (Absolute Power) | Watts | / 3516.853 -> TON |
| Status | `default.1` (Aggregated health) | OK/ERROR/... | -> ValveStatus |
| Health detail | `default.2` | text | e.g. "Flow_sensor_error" |

Conversions: 1 refrigeration ton = 3516.853 W; 1 TON-hr = 12,660,670.8 J.
**`evcloud.200`/`evcloudplus.461` are LIFETIME CUMULATIVE counters.** A monthly bill =
counter at period end - counter at period start. Ingestion stores cumulative snapshots; billing diffs them.
Note: `slsystem.410` is only the web-display unit string ("Power:Ton,Energy:TonH") — the raw
datapoints are J/W, hence the conversions.

## Architecture / key files

- `lib/belimo.ts` — Belimo client + mappings (server-only).
- `lib/ingest.ts` — fleet ingestion.
- `app/api/cron/ingest/route.ts` — secret-guarded ingestion trigger (POST, `x-cron-secret`).
- `app/api/belimo-inspect/route.ts` — **TEMP** debug route (delete before prod; has a `?debug=1`
  masked-secret branch + dataprofile inspector).
- `lib/scoped-data.ts` — role-scoped read layer. Has `getClientScopedView`, `getOwnerScopedView`
  (still partly mock-fallback), and the new `getAdminFleetView` / `getAdminValves` (live).
- `lib/mock-data.ts` — mock values (still used by seed + as fallbacks in client/owner views).
- `prisma/schema.prisma`, `prisma/seed.ts` — data model + seed.
- `auth.ts`, `middleware.ts`, `next-auth.d.ts` — credentials auth + role-scope routing. Session
  carries `role`, `scope`, `clientId`, `buildingId` — **NOT yet `orgId`** (next step).

## Next steps — OWNER / CLIENT on real data (the next chat)

Current gap (visible in admin valvulas): every ingested valve is Cliente "Sin asignar", on raw Belimo
buildings ("NID(R) Puerto Cancún", "NIDO", "Testplatz EU"), has a `localId` but **no `floorId`**, and
its building belongs to the EVAC system org. So owner/client views won't show real data until linked.

Plan:
1. **Add `orgId` to the auth session** — set it in `authorize` return (`auth.ts`), carry through the
   `jwt`/`session` callbacks, and add to `next-auth.d.ts` (User + Session + JWT). Needed so owner views
   scope by org across all the owner's buildings.
2. **Reassign a real building to an owner org** — pick e.g. "NID(R) Puerto Cancún" (has real valves),
   set its `orgId` to the Espacio Cancún OWNER org, and point the owner user (`espaciocancun`) at it
   (`buildingId`, and rely on `orgId` for multi-building). One-off SQL or a small admin action.
3. **Attach ingested valves to floors** — ingestion currently sets `localId` but not `floorId`, so
   the owner "Válvulas por piso" accordion is empty. Either (a) create/resolve a Floor per valve during
   ingest (e.g. from the local code prefix `001-003-...` -> "Nivel 3"), or (b) make `getOwnerScopedView`
   group floor-less valves under a "Sin nivel" bucket. Prefer (a) — add floor resolution to `ingest.ts`.
4. **Link locals -> clients** — assign a couple of ingested locals to a Client so the tenant (client)
   view + owner cobranza have someone to bill. Needs an admin linking UI eventually; SQL/seed for now.
5. **Rework `getOwnerScopedView`** to scope by `orgId` (all owner buildings) + building switcher,
   reading real valves/floors/locals. Then swap the owner pages (`resumen`, `valvulas`, `cobranza`,
   `recibos`, `inquilinos`) and client pages off mock fallbacks.
6. **Admin linking UI** (`edificios/[id]`, valvulas) — assign valve->floor/local, building->owner org,
   local->client. Replaces the one-off SQL.

## Then: BILLING (final step)

Compute period deltas from Readings (cumulative end - start) or `getTimeseries`, apply the building's
`Tariff` (energyRate/waterRate/fixedCharge/taxRate), write `Invoice` rows. **Confirm the formula with
the client** — README has a placeholder:
`total = energia*tarifa_energia + agua*tarifa_agua + cargo_fijo + IVA(16%)`.
Wire the owner "Generar y enviar recibos" flow (PDF + email per tenant) on top.

## Known issues / gotchas (lessons learned)

- **Belimo credentials have I/l (capital-i vs lowercase-L) ambiguity** — NEVER type them, copy exact
  bytes. Setup burned about an hour on this: `.env.example` shipped a wrong client_id (`...2qIZ...` vs
  real `...2qlZ...`), and the `.env` client_secret had the same swap. The isolated `curl` to
  `id.belimo.com/oauth/token` proved creds were valid while the app got `access_denied` -> it was an
  `.env` transcription error, confirmed via **md5 mismatch** of the `.env` value vs the working value.
  Fix = paste exact bytes; the masked debug branch (length + first/last 3 chars) and `?debug=1` route
  were how we located it.
- **Rotate exposed secrets.** During setup the Belimo password + client_secret + CRON_SECRET were
  pasted in shell history/chat — rotate them and clear `~/.bash_history`.
- **`.env` parsing:** `@next/env` expands `$` — escape `\$` in any secret containing it. Higher-precedence
  `.env.local`/`.env.production` override `.env` (none present). Edit `.env` as the service user, not
  `sudo` (avoid root-owned file the service can't read).
- **Prisma `migrate dev` needs CREATEDB** (shadow DB). Granted via `ALTER ROLE <user> CREATEDB;`
  (`sudo -u postgres psql`). Without it: P3014.
- **pnpm is broken on this box** (needs Node 22, box runs Node 20 -> `node:sqlite` crash). Use
  `npm`/`npx`, or upgrade Node to 22.
- **`cat >>` double-append bites** — appending a function block twice caused "defined multiple times".
  Use `grep -q NAME file || cat >> ...` guards. Editor copy-paste sometimes leaves files **empty/0-byte**
  (route.ts) -> "is not a module" build error; verify with `wc -l`/`ls -l` after writing.
- **Auto-ingested buildings != mock buildings.** Real valves create "NID(R) Puerto Cancún" etc. under the
  EVAC system org; mock buildings (Espacio Puerto Cancún, El Nido, Altea) are demo. Reconcile in next step.
- **"hace 8 h" is device-native**, not sync staleness — Belimo valves push every few hours; our 15-min
  sync just re-reads. Don't chase "stale" timestamps.
- **Readings are append-only** — every sync writes a row. Fine for dev; consider dedup/retention later.
- **Sidebar nav badges (`9`, `19`) are hardcoded** in the admin shell — cosmetic, not from DB.
- **Energy = cooling only** (`evcloud.200`). If any valve heats, sum `evcloud.210` (configurable later).
- **TEMP to remove before prod:** `app/api/belimo-inspect/route.ts`.
- **Middleware deprecation warning** — Next 16 wants `proxy` instead of `middleware`; harmless for now.

## Env vars

```
DATABASE_URL=postgresql://<user>:<pass>@localhost:5432/evac_cloud
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
# schema change
npx prisma migrate dev --name <name>
npx prisma migrate reset --force        # clean reseed (dev)
# rebuild + restart after code/schema changes
npm run build && sudo systemctl restart evac-cloud.service
# manual sync
SECRET=$(grep ^CRON_SECRET .env | cut -d= -f2 | tr -d '"')
curl -s -X POST -H "x-cron-secret: $SECRET" http://localhost:3000/api/cron/ingest | python3 -m json.tool
tail /home/mdares/evac-cloud/ingest.log  # cron output
npx prisma studio                        # inspect data
```

Logins (seed): `ddares@maliountech.com` (admin), `espaciocancun@gmail.com` (owner),
`contacto@investport.mx` (client) — all password `Evac2026!`.
