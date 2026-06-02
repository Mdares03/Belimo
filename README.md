# EVAC cloud v2

Next.js App Router implementation of the EVAC design handoff in `/home/mdares/design_handoff_evac_v2`.

## Local toolchain

This server currently uses a user-local Node install at `/home/mdares/.local/nodejs`.

```bash
export PATH=/home/mdares/.local/nodejs/bin:$PATH
pnpm install
```

## Database

The app expects PostgreSQL:

```bash
sudo apt-get install -y postgresql postgresql-contrib nginx build-essential openssl
sudo -u postgres psql
CREATE ROLE evac_app LOGIN PASSWORD 'evac_dev_password';
CREATE DATABASE evac_cloud OWNER evac_app;
```

Then:

```bash
pnpm prisma:generate
pnpm prisma:dev --name init
pnpm seed
```

Seed logins:

- Admin: `ddares@maliountech.com` / `Evac2026!`
- Cliente: `contacto@investport.mx` / `Evac2026!`

## Verify

```bash
pnpm lint
pnpm typecheck
pnpm prisma validate
pnpm build
```

## Deploy

After database setup and `pnpm build`:

```bash
sudo ./deploy/bootstrap-ubuntu.sh
sudo systemctl start evac-cloud
sudo systemctl status evac-cloud
```

Nginx proxies port 80 to `127.0.0.1:3000` and accepts both `10.0.0.10` (WireGuard) and `5.180.151.243` (public IP).

Set `AUTH_TRUST_HOST="true"` and leave `AUTH_URL` unset to prevent localhost redirects and preserve the incoming host. Add Certbot/TLS once DNS points to the server.
