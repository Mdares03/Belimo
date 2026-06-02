import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getIngestHealthSummary } from '@/lib/ingest-health';

export async function GET() {
  const session = await auth();
  if ((session?.user?.role ?? '') !== 'Administrador') {
    return NextResponse.json({ error: 'Sin permisos.' }, { status: 403 });
  }

  const summary = await getIngestHealthSummary();
  return NextResponse.json(summary);
}
