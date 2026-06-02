import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { ingestFleet } from '@/lib/ingest';

export const maxDuration = 120;

export async function POST() {
  const session = await auth();
  if ((session?.user?.role ?? '') !== 'Administrador') {
    return NextResponse.json({ error: 'Sin permisos.' }, { status: 403 });
  }

  try {
    const result = await ingestFleet();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
