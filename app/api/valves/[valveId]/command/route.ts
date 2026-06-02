import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { actuationAllowlist, verifyActuationToken } from '@/lib/actuation-auth';
import { sendActuationCommand } from '@/lib/belimo';
import { prisma } from '@/lib/db';

type Body = { state?: 'ON' | 'OFF' };

export async function POST(request: Request, context: { params: Promise<{ valveId: string }> }) {
  const { valveId } = await context.params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const role = session.user.role ?? '';
  if (role !== 'Administrador' && role !== 'Administrador Edificio') {
    return NextResponse.json({ error: 'Sin permisos.' }, { status: 403 });
  }

  // Password re-auth gate: the caller must present a valid actuation token
  // obtained from /api/actuation/unlock by re-entering their login password.
  const actuationToken = request.headers.get('x-actuation-token');
  if (!verifyActuationToken(actuationToken, session.user.id)) {
    return NextResponse.json({ error: 'Sesión de actuación expirada. Vuelve a ingresar tu contraseña.', code: 'reauth_required' }, { status: 401 });
  }

  const valve = await prisma.valve.findUnique({
    where: { id: valveId },
    select: { id: true, serial: true, belimoId: true, buildingId: true },
  });

  if (!valve) return NextResponse.json({ error: 'Válvula no encontrada.' }, { status: 404 });
  if (!valve.belimoId) return NextResponse.json({ error: 'La válvula no está vinculada a Belimo.' }, { status: 400 });

  if (role === 'Administrador Edificio') {
    const orgId = session.user.orgId ?? null;
    const allowed = orgId
      ? await prisma.building.findFirst({ where: { id: valve.buildingId, orgId }, select: { id: true } })
      : null;
    if (!allowed) return NextResponse.json({ error: 'Sin acceso a esta válvula.' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const state = body.state === 'ON' ? 'ON' : 'OFF';

  const allowlist = actuationAllowlist();
  if (!allowlist.has(valve.belimoId)) {
    return NextResponse.json({ error: 'Actuación bloqueada por allowlist. Usa válvula dummy o expande BELIMO_ACTUATION_ALLOWLIST.' }, { status: 403 });
  }

  const requestHash = createHash('sha256').update(`${valve.belimoId}:${state}`).digest('hex');

  try {
    const result = await sendActuationCommand({ deviceId: valve.belimoId, state });

    await prisma.valveCommandAudit.create({
      data: {
        valveId: valve.id,
        actorUserId: session.user.id,
        actorRole: role,
        requestedState: state,
        requestHash,
        endpoint: result.endpointPath,
        success: result.ok,
        responseStatus: result.status,
        responseBody: result.body,
      },
    });

    await prisma.valve.update({
      where: { id: valve.id },
      data: {
        commandedState: state,
        lastCommandAt: new Date(),
        lastCommandBy: session.user.id,
        lastCommandResult: result.ok ? `OK:${result.status}` : `FAIL:${result.status}`,
      },
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: 'Belimo rechazó el comando.',
          valveId: valve.id,
          serial: valve.serial,
          status: result.status,
          response: result.body,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, valveId: valve.id, serial: valve.serial, state, status: result.status });
  } catch (error) {
    await prisma.valveCommandAudit.create({
      data: {
        valveId: valve.id,
        actorUserId: session.user.id,
        actorRole: role,
        requestedState: state,
        requestHash,
        endpoint: `/devices/${valve.belimoId}/data`,
        success: false,
        responseBody: error instanceof Error ? error.message : String(error),
      },
    });

    await prisma.valve.update({
      where: { id: valve.id },
      data: {
        commandedState: state,
        lastCommandAt: new Date(),
        lastCommandBy: session.user.id,
        lastCommandResult: `ERROR:${error instanceof Error ? error.message.slice(0, 180) : 'unknown'}`,
      },
    });

    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
