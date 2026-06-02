import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { deletePreviousLogos, saveLogo, validateLogoFile } from '@/lib/file-assets';

async function canManageBuilding(buildingId: string) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, code: 401 as const, error: 'No autenticado.' };

  const role = session.user.role ?? '';
  if (role !== 'Administrador' && role !== 'Administrador Edificio') {
    return { ok: false, code: 403 as const, error: 'Sin permisos.' };
  }

  if (role === 'Administrador') {
    const exists = await prisma.building.findUnique({ where: { id: buildingId }, select: { id: true } });
    if (!exists) return { ok: false, code: 404 as const, error: 'Edificio no encontrado.' };
    return { ok: true, role };
  }

  const orgId = session.user.orgId ?? null;
  if (!orgId) return { ok: false, code: 403 as const, error: 'Sin organización asignada.' };

  const exists = await prisma.building.findFirst({ where: { id: buildingId, orgId }, select: { id: true } });
  if (!exists) return { ok: false, code: 403 as const, error: 'El edificio no pertenece a tu alcance.' };
  return { ok: true, role };
}

export async function POST(request: Request) {
  const form = await request.formData();
  const buildingId = String(form.get('buildingId') ?? '').trim();
  const action = String(form.get('action') ?? '').trim();
  const file = form.get('logo');

  if (!buildingId) return NextResponse.json({ error: 'Falta buildingId.' }, { status: 400 });

  const access = await canManageBuilding(buildingId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.code });

  if (action === 'delete') {
    deletePreviousLogos(buildingId);
    await prisma.building.update({
      where: { id: buildingId },
      data: { logoPath: null, logoMime: null, logoUpdatedAt: null },
    });
    return NextResponse.json({ ok: true });
  }

  if (!(file instanceof File)) return NextResponse.json({ error: 'Falta archivo logo.' }, { status: 400 });

  try {
    const parsed = await validateLogoFile(file);
    deletePreviousLogos(buildingId);
    const logoPath = saveLogo(buildingId, parsed.ext, parsed.buffer);

    await prisma.building.update({
      where: { id: buildingId },
      data: {
        logoPath,
        logoMime: parsed.mime,
        logoUpdatedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, logoUrl: `/api/media/building-logo/${buildingId}` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const buildingId = url.searchParams.get('buildingId') ?? '';
  if (!buildingId) return NextResponse.json({ error: 'Falta buildingId.' }, { status: 400 });

  const access = await canManageBuilding(buildingId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.code });

  deletePreviousLogos(buildingId);
  await prisma.building.update({
    where: { id: buildingId },
    data: { logoPath: null, logoMime: null, logoUpdatedAt: null },
  });

  return NextResponse.json({ ok: true });
}
