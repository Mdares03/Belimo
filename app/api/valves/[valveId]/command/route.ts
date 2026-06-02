import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { sendActuationCommand } from '@/lib/belimo';
import { prisma } from '@/lib/db';

type Body = { state?: 'ON' | 'OFF' };

function allowedBelimoIds() {
  const set = new Set<string>();
  const dummy = process.env.BELIMO_DUMMY_DEVICE_ID?.trim();
  if (dummy) set.add(dummy);
  const extra = (process.env.BELIMO_ACTUATION_ALLOWLIST || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  for (const item of extra) set.add(item);
  return set;
}

export async function POST(request: Request, context: { params: Promise<{ valveId: string }> }) {
  const { valveId } = await context.params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const role = session.user.role ?? '';
  if (role !== 'Administrador' && role !== 'Administrador Edificio') {
    return NextResponse.json({ error: 'Sin permisos.' }, { status: 403 });
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

  const allowlist = allowedBelimoIds();
  if (!allowlist.has(valve.belimoId)) {
    return NextResponse.json({ error: 'Actuación bloqueada por allowlist. Usa válvula dummy o expande BELIMO_ACTUATION_ALLOWLIST.' }, { status: 403 });
  }

  const payload = { command: 'set_state', state };
  const requestHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');

  try {
    const result = await sendActuationCommand({ deviceId: valve.belimoId, state, payload });

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
        endpoint: process.env.BELIMO_ACTUATION_PATH ?? 'not_configured',
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
