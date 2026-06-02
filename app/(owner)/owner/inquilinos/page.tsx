import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { Button, Card, Input, PageHead, Pill } from '@/components/ui/primitives';
import { prisma } from '@/lib/db';
import { getOwnerScopedView } from '@/lib/scoped-data';

function valveTone(status: string) {
  if (status === 'OK') return 'good' as const;
  if (status === 'ALERTA') return 'warn' as const;
  if (status === 'ERROR') return 'bad' as const;
  return 'neutral' as const;
}

async function ownerScope(buildingId: string) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, reason: 'unauthorized' };
  const role = session.user.role ?? '';
  if (role !== 'Administrador Edificio' && role !== 'Administrador') return { ok: false as const, reason: 'forbidden' };

  if (role === 'Administrador') return { ok: true as const, orgId: null as string | null };

  const orgId = session.user.orgId ?? null;
  if (!orgId) return { ok: false as const, reason: 'forbidden' };

  const allowed = await prisma.building.findFirst({ where: { id: buildingId, orgId }, select: { id: true, orgId: true } });
  if (!allowed) return { ok: false as const, reason: 'forbidden' };
  return { ok: true as const, orgId };
}

function redirectWith(buildingId: string, params: Record<string, string>): never {
  const qs = new URLSearchParams({ building: buildingId, ...params });
  redirect(`/owner/inquilinos?${qs.toString()}`);
}

async function createTenant(formData: FormData) {
  'use server';

  const buildingId = String(formData.get('buildingId') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const commercialName = String(formData.get('commercialName') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();

  if (!buildingId || !name || !email) redirectWith(buildingId, { status: 'error', reason: 'missing_fields' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirectWith(buildingId, { status: 'error', reason: 'invalid_email' });

  const scoped = await ownerScope(buildingId);
  if (!scoped.ok) redirectWith(buildingId, { status: 'error', reason: scoped.reason });

  const building = await prisma.building.findUnique({ where: { id: buildingId }, select: { orgId: true } });
  if (!building) redirectWith(buildingId, { status: 'error', reason: 'building_not_found' });

  const clientRole = await prisma.role.findUnique({ where: { name: 'Cliente' }, select: { id: true } });
  if (!clientRole) redirectWith(buildingId, { status: 'error', reason: 'role_missing' });

  const buildingOrgId = building.orgId;
  const clientRoleId = clientRole.id;

  const base = email.split('@')[0].replace(/[^a-z0-9._-]/gi, '').slice(0, 20) || 'tenant';
  let username = `${base}-${Date.now().toString(36).slice(-6)}`;
  let tries = 0;
  while (tries < 4) {
    const exists = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (!exists) break;
    username = `${base}-${Math.random().toString(36).slice(2, 8)}`;
    tries += 1;
  }

  const passwordPlain = process.env.TENANT_DEFAULT_PASSWORD || 'Evac2026!';
  const passwordHash = await bcrypt.hash(passwordPlain, 10);

  try {
    const created = await prisma.client.create({
      data: {
        name,
        commercialName: commercialName || null,
        buildingId,
        orgId: buildingOrgId,
        users: {
          create: {
            username,
            name,
            email,
            passwordHash,
            roleId: clientRoleId,
            buildingId,
            orgId: buildingOrgId,
          },
        },
      },
      select: { id: true },
    });

    revalidatePath('/owner/inquilinos');
    revalidatePath('/owner/recibos');
    revalidatePath('/owner/cobranza');
    redirectWith(buildingId, { status: 'created', clientId: created.id });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      redirectWith(buildingId, { status: 'error', reason: 'email_taken' });
    }
    throw error;
  }
}

async function assignLocal(formData: FormData) {
  'use server';

  const buildingId = String(formData.get('buildingId') ?? '').trim();
  const localId = String(formData.get('localId') ?? '').trim();
  const clientId = String(formData.get('clientId') ?? '').trim();

  if (!buildingId || !localId) redirectWith(buildingId, { status: 'error', reason: 'missing_fields' });

  const scoped = await ownerScope(buildingId);
  if (!scoped.ok) redirectWith(buildingId, { status: 'error', reason: scoped.reason });

  const local = await prisma.local.findFirst({ where: { id: localId, buildingId }, select: { id: true } });
  if (!local) redirectWith(buildingId, { status: 'error', reason: 'local_not_found' });

  if (clientId) {
    const client = await prisma.client.findFirst({ where: { id: clientId, buildingId }, select: { id: true } });
    if (!client) redirectWith(buildingId, { status: 'error', reason: 'client_not_found' });
  }

  await prisma.local.update({ where: { id: localId }, data: { clientId: clientId || null } });

  revalidatePath('/owner/inquilinos');
  revalidatePath('/owner/recibos');
  revalidatePath('/owner/cobranza');
  redirectWith(buildingId, { status: 'assigned' });
}

async function updateTenantEmail(formData: FormData) {
  'use server';

  const clientId = String(formData.get('clientId') ?? '').trim();
  const buildingId = String(formData.get('buildingId') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();

  if (!clientId || !buildingId || !email) redirectWith(buildingId, { status: 'error', reason: 'missing_fields' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirectWith(buildingId, { status: 'error', reason: 'invalid_email' });

  const scoped = await ownerScope(buildingId);
  if (!scoped.ok) redirectWith(buildingId, { status: 'error', reason: scoped.reason });

  const client = await prisma.client.findFirst({
    where: { id: clientId, buildingId },
    select: { users: { select: { id: true }, orderBy: { createdAt: 'asc' }, take: 1 } },
  });

  if (!client) redirectWith(buildingId, { status: 'error', reason: 'client_not_found' });
  const tenantUser = client.users[0];
  if (!tenantUser) redirectWith(buildingId, { status: 'error', reason: 'tenant_user_missing' });

  try {
    await prisma.user.update({ where: { id: tenantUser.id }, data: { email } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      redirectWith(buildingId, { status: 'error', reason: 'email_taken' });
    }
    throw error;
  }

  revalidatePath('/owner/inquilinos');
  revalidatePath('/owner/recibos');
  revalidatePath('/owner/cobranza');
  redirectWith(buildingId, { status: 'updated' });
}

function statusMessage(status?: string, reason?: string) {
  if (status === 'updated') return { tone: 'good' as const, text: 'Correo del inquilino actualizado.' };
  if (status === 'created') return { tone: 'good' as const, text: 'Inquilino creado y listo para asignación de locales.' };
  if (status === 'assigned') return { tone: 'good' as const, text: 'Asignación de local actualizada.' };
  if (status === 'error' && reason === 'invalid_email') return { tone: 'bad' as const, text: 'Correo inválido. Usa formato nombre@dominio.com.' };
  if (status === 'error' && reason === 'tenant_user_missing') return { tone: 'bad' as const, text: 'Este inquilino no tiene usuario aún; crea la cuenta primero.' };
  if (status === 'error' && reason === 'email_taken') return { tone: 'bad' as const, text: 'Ese correo ya está en uso por otro usuario.' };
  if (status === 'error') return { tone: 'bad' as const, text: 'No se pudo completar la operación de onboarding.' };
  return null;
}

export default async function InquilinosPage({ searchParams }: { searchParams: Promise<{ building?: string; status?: string; reason?: string }> }) {
  const { building, status, reason } = await searchParams;
  const data = await getOwnerScopedView(building);
  const message = statusMessage(status, reason);

  const [clients, locals] = await Promise.all([
    prisma.client.findMany({
      where: { buildingId: data.buildingId },
      select: {
        id: true,
        name: true,
        users: { select: { email: true }, orderBy: { createdAt: 'asc' }, take: 1 },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.local.findMany({
      where: { buildingId: data.buildingId },
      select: {
        id: true,
        code: true,
        clientId: true,
        client: { select: { name: true } },
        valves: { select: { id: true }, orderBy: { serial: 'asc' } },
      },
      orderBy: { code: 'asc' },
    }),
  ]);

  return (
    <>
      <PageHead title="Inquilinos">Alta de cuentas de inquilino y asignación local → cliente.</PageHead>
      {message && (
        <p className={`mb-4 rounded-sm border p-3 text-sm ${message.tone === 'good' ? 'border-good-soft bg-good-soft/30 text-good-ink' : 'border-bad-soft bg-bad-soft/30 text-bad-ink'}`}>
          {message.text}
        </p>
      )}

      <Card className="mb-5 p-5">
        <h3 className="text-lg font-bold">Nuevo inquilino</h3>
        <p className="mt-1 text-sm text-ink-2">Crear cliente + usuario de acceso del inquilino en un solo paso.</p>
        <form action={createTenant} className="mt-3 grid gap-2 md:grid-cols-5">
          <input type="hidden" name="buildingId" value={data.buildingId} />
          <Input name="name" placeholder="Nombre del inquilino" required />
          <Input name="commercialName" placeholder="Nombre comercial (opcional)" />
          <Input name="email" type="email" placeholder="inquilino@dominio.com" required />
          <Button type="submit" className="md:col-span-2">Crear inquilino</Button>
        </form>
      </Card>

      <Card className="mb-5">
        <div className="p-5"><h3 className="text-lg font-bold">Asignación de locales</h3></div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Local</th>
              <th>Cliente actual</th>
              <th>Válvulas</th>
              <th>Asignar a</th>
            </tr>
          </thead>
          <tbody>
            {locals.map((local) => (
              <tr key={local.id}>
                <td className="font-bold">{local.code}</td>
                <td>{local.client?.name ?? 'Sin asignar'}</td>
                <td>{local.valves.length}</td>
                <td>
                  <form action={assignLocal} className="flex items-center gap-2">
                    <input type="hidden" name="buildingId" value={data.buildingId} />
                    <input type="hidden" name="localId" value={local.id} />
                    <select name="clientId" defaultValue={local.clientId ?? ''} className="rounded-sm border border-border-2 bg-surface px-2 py-1 text-xs">
                      <option value="">Sin asignar</option>
                      {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                    </select>
                    <Button type="submit" variant="ghost" size="sm">Guardar</Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="text-sm text-ink-2">{data.buildingName} · {data.tenants.length} filas de inquilino</div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Inquilino</th>
              <th>Local</th>
              <th>Válvulas asignadas</th>
              <th>Usuario</th>
              <th>Estado de cuenta</th>
              <th className="r">Acción</th>
            </tr>
          </thead>
          <tbody>
            {data.tenants.map((tenant) => (
              <tr key={`${tenant.tenant}-${tenant.local}`}>
                <td className="font-bold">{tenant.tenant}</td>
                <td>{tenant.local}</td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    {tenant.valves.length
                      ? tenant.valves.map((valve) => <Pill key={`${tenant.local}-${valve.label}`} tone={valveTone(valve.status)}>{valve.label}</Pill>)
                      : <span className="text-xs text-ink-3">Sin válvulas</span>}
                  </div>
                </td>
                <td>
                  {tenant.clientId ? (
                    <form action={updateTenantEmail} className="flex items-center gap-2">
                      <input type="hidden" name="clientId" value={tenant.clientId} />
                      <input type="hidden" name="buildingId" value={data.buildingId} />
                      <Input
                        name="email"
                        type="email"
                        defaultValue={tenant.email === 'sin-correo' || tenant.email === '—' ? '' : tenant.email}
                        placeholder="inquilino@dominio.com"
                        className="min-w-[240px]"
                        required
                      />
                      <Button type="submit" variant="ghost" size="sm">Guardar</Button>
                    </form>
                  ) : (
                    tenant.email
                  )}
                </td>
                <td><Pill tone={tenant.tone}>{tenant.accountStatus}</Pill></td>
                <td className="r"><Button variant="ghost" size="sm">{tenant.action}</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
