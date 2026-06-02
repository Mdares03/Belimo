import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { loadFileOrNull } from '@/lib/file-assets';

async function canReadBuilding(buildingId: string) {
  const session = await auth();
  if (!session?.user?.id) return false;

  const role = session.user.role ?? '';
  if (role === 'Administrador') return true;

  if (role === 'Administrador Edificio') {
    const orgId = session.user.orgId ?? null;
    if (!orgId) return false;
    const allowed = await prisma.building.findFirst({ where: { id: buildingId, orgId }, select: { id: true } });
    return Boolean(allowed);
  }

  if (role === 'Cliente') {
    const buildingIdFromSession = session.user.buildingId ?? null;
    return buildingIdFromSession === buildingId;
  }

  return false;
}

export async function GET(_request: Request, context: { params: Promise<{ buildingId: string }> }) {
  const { buildingId } = await context.params;
  const allowed = await canReadBuilding(buildingId);
  if (!allowed) return NextResponse.json({ error: 'Sin permisos.' }, { status: 403 });

  const building = await prisma.building.findUnique({
    where: { id: buildingId },
    select: { logoPath: true, logoMime: true },
  });

  if (!building?.logoPath || !building.logoMime) {
    return NextResponse.json({ error: 'Logo no configurado.' }, { status: 404 });
  }

  const buf = loadFileOrNull(building.logoPath);
  if (!buf) return NextResponse.json({ error: 'Archivo de logo no encontrado.' }, { status: 404 });

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'content-type': building.logoMime,
      'cache-control': 'private, max-age=300',
    },
  });
}
