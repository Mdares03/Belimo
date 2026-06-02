import { ComputedPaidStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

type Body = {
  action?: "mark_paid" | "mark_pending" | "mark_paid_range";
  localId?: string;
  month?: string;
  localIds?: string[];
  fromMonth?: string;
  toMonth?: string;
  note?: string;
};

function isMonthKey(value: string | undefined): value is string {
  return !!value && /^\d{4}-\d{2}$/.test(value);
}

function monthRangeInclusive(fromMonth: string, toMonth: string) {
  const [fromYear, fromMon] = fromMonth.split("-").map(Number);
  const [toYear, toMon] = toMonth.split("-").map(Number);
  const fromIdx = fromYear * 12 + (fromMon - 1);
  const toIdx = toYear * 12 + (toMon - 1);
  const min = Math.min(fromIdx, toIdx);
  const max = Math.max(fromIdx, toIdx);
  const out: string[] = [];
  for (let idx = min; idx <= max; idx += 1) {
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    out.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = session.user.role ?? "";
  if (role !== "Administrador Edificio" && role !== "Administrador") {
    return NextResponse.json({ error: "Sin permisos." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.action) return NextResponse.json({ error: "Falta acción." }, { status: 400 });

  const orgId = session.user.orgId ?? null;
  const userBuildingId = session.user.buildingId ?? null;
  const allowedBuildings = orgId
    ? await prisma.building.findMany({ where: { orgId }, select: { id: true } })
    : userBuildingId
      ? [{ id: userBuildingId }]
      : [];
  const allowedBuildingIds = new Set(allowedBuildings.map((b) => b.id));

  if (body.action === "mark_paid" || body.action === "mark_pending") {
    if (!body.localId || !isMonthKey(body.month)) {
      return NextResponse.json({ error: "Faltan localId o month (YYYY-MM)." }, { status: 400 });
    }

    const local = await prisma.local.findUnique({ where: { id: body.localId }, select: { id: true, buildingId: true } });
    if (!local || !allowedBuildingIds.has(local.buildingId)) {
      return NextResponse.json({ error: "Sin acceso a este local." }, { status: 403 });
    }

    const status = body.action === "mark_paid" ? ComputedPaidStatus.PAGADO : ComputedPaidStatus.PENDIENTE;
    const row = await prisma.computedMonthlyStatus.upsert({
      where: { localId_monthKey: { localId: local.id, monthKey: body.month } },
      create: {
        localId: local.id,
        monthKey: body.month,
        status,
        paidAt: status === ComputedPaidStatus.PAGADO ? new Date() : null,
        note: body.note?.trim() || null,
      },
      update: {
        status,
        paidAt: status === ComputedPaidStatus.PAGADO ? new Date() : null,
        note: body.note?.trim() || null,
      },
    });

    return NextResponse.json({ ok: true, updated: 1, row });
  }

  if (body.action === "mark_paid_range") {
    if (!Array.isArray(body.localIds) || !body.localIds.length || !isMonthKey(body.fromMonth) || !isMonthKey(body.toMonth)) {
      return NextResponse.json({ error: "Faltan localIds o rango de meses válido." }, { status: 400 });
    }

    const locals = await prisma.local.findMany({
      where: { id: { in: body.localIds } },
      select: { id: true, buildingId: true },
    });
    const allowedLocalIds = locals.filter((local) => allowedBuildingIds.has(local.buildingId)).map((local) => local.id);
    if (!allowedLocalIds.length) {
      return NextResponse.json({ error: "Sin acceso a los locales solicitados." }, { status: 403 });
    }

    const months = monthRangeInclusive(body.fromMonth, body.toMonth);
    let updated = 0;
    for (const localId of allowedLocalIds) {
      for (const month of months) {
        await prisma.computedMonthlyStatus.upsert({
          where: { localId_monthKey: { localId, monthKey: month } },
          create: {
            localId,
            monthKey: month,
            status: ComputedPaidStatus.PAGADO,
            paidAt: new Date(),
            note: body.note?.trim() || null,
          },
          update: {
            status: ComputedPaidStatus.PAGADO,
            paidAt: new Date(),
            note: body.note?.trim() || null,
          },
        });
        updated += 1;
      }
    }

    return NextResponse.json({ ok: true, updated, locals: allowedLocalIds.length, months: months.length });
  }

  return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
}
