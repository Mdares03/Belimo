import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { actuationAllowlist, verifyActuationToken } from '@/lib/actuation-auth';
import { belimoProbe } from '@/lib/belimo';

type Attempt = { method?: string; pathTemplate?: string; body?: unknown };
type Body = { deviceId?: string; attempts?: Attempt[]; discover?: boolean };

// Read-only discovery battery: GET/OPTIONS only — never mutates the valve.
// Reveals which command-ish resources exist (200 vs 404/405) and surfaces
// any `Allow` header so we can learn the supported write method/path.
const DISCOVERY: Attempt[] = [
  { method: 'OPTIONS', pathTemplate: '/devices/{id}' },
  { method: 'OPTIONS', pathTemplate: '/devices/{id}/data' },
  { method: 'OPTIONS', pathTemplate: '/devices/{id}/datapoints' },
  { method: 'GET', pathTemplate: '/devices/{id}/datapoints' },
  { method: 'GET', pathTemplate: '/devices/{id}/commands' },
  { method: 'OPTIONS', pathTemplate: '/devices/{id}/commands' },
  { method: 'GET', pathTemplate: '/devices/{id}/writable' },
  { method: 'GET', pathTemplate: '/devices/{id}/setpoints' },
];

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || (session.user.role ?? '') !== 'Administrador') {
    return NextResponse.json({ error: 'Sin permisos.' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const deviceId = (body.deviceId || process.env.BELIMO_DUMMY_DEVICE_ID || '').trim();
  if (!deviceId) {
    return NextResponse.json({ error: 'Falta deviceId (o BELIMO_DUMMY_DEVICE_ID).' }, { status: 400 });
  }

  // Hard safety backstop: only the allowlisted (dummy) device may be probed.
  if (!actuationAllowlist().has(deviceId)) {
    return NextResponse.json({ error: 'deviceId fuera de la allowlist. Solo se permite la válvula dummy.' }, { status: 403 });
  }

  const attempts = body.discover ? DISCOVERY : (body.attempts ?? []);
  if (!attempts.length) {
    return NextResponse.json({ error: 'Sin intentos. Usa discover:true o envía attempts[].' }, { status: 400 });
  }

  // Any write attempt requires the same password re-auth as real actuation.
  const hasWrite = attempts.some((a) => WRITE_METHODS.has((a.method ?? 'GET').toUpperCase()));
  if (hasWrite && !verifyActuationToken(request.headers.get('x-actuation-token'), userId)) {
    return NextResponse.json({ error: 'Los intentos de escritura requieren desbloqueo por contraseña.', code: 'reauth_required' }, { status: 401 });
  }

  const results = [];
  for (const a of attempts) {
    const method = (a.method ?? 'GET').toUpperCase();
    const tmpl = a.pathTemplate ?? '/devices/{id}';
    const path = tmpl.includes('{id}') ? tmpl.replace('{id}', encodeURIComponent(deviceId)) : tmpl;
    try {
      const r = await belimoProbe({ method, path, body: a.body });
      results.push({ method, path, ...r });
    } catch (e) {
      results.push({ method, path, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ deviceId, results });
}
