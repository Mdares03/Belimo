import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { sendActuationCommand } from '@/lib/belimo';

type Body = {
  state?: 'ON' | 'OFF';
  payload?: Record<string, unknown>;
  deviceId?: string;
};

export async function POST(request: Request) {
  const session = await auth();
  if ((session?.user?.role ?? '') !== 'Administrador') {
    return NextResponse.json({ error: 'Sin permisos.' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const state = body.state ?? 'OFF';
  const deviceId = body.deviceId || process.env.BELIMO_DUMMY_DEVICE_ID || '';

  if (!deviceId) {
    return NextResponse.json({ error: 'Falta deviceId (o BELIMO_DUMMY_DEVICE_ID).' }, { status: 400 });
  }

  try {
    const result = await sendActuationCommand({ deviceId, state, payload: body.payload });
    return NextResponse.json({ ok: result.ok, state, deviceId, status: result.status, endpoint: result.endpointPath, response: result.body });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
