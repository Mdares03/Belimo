import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { runBillingForPeriod } from "@/lib/billing";

type Body = {
  buildingId?: string;
  billingPeriodId?: string;
};

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = session.user.role ?? "";
  if (role !== "Administrador Edificio" && role !== "Administrador") {
    return NextResponse.json({ error: "Sin permisos para generar recibos." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const buildingId = body.buildingId ?? session.user.buildingId;
  if (!buildingId) return NextResponse.json({ error: "Falta buildingId." }, { status: 400 });
  if (!body.billingPeriodId) return NextResponse.json({ error: "Falta billingPeriodId." }, { status: 400 });

  const orgId = session.user.orgId ?? null;
  const where = orgId
    ? { id: buildingId, orgId }
    : role === "Administrador"
      ? { id: buildingId }
      : { id: session.user.buildingId ?? "" };

  const allowedBuilding = await prisma.building.findFirst({ where, select: { id: true } });
  if (!allowedBuilding) {
    return NextResponse.json({ error: "El edificio no pertenece a tu alcance." }, { status: 403 });
  }

  const period = await prisma.billingPeriod.findUnique({ where: { id: body.billingPeriodId }, select: { id: true, buildingId: true } });
  if (!period || period.buildingId !== buildingId) {
    return NextResponse.json({ error: "Periodo inválido para este edificio." }, { status: 400 });
  }

  const summary = await runBillingForPeriod({ buildingId, billingPeriodId: body.billingPeriodId });
  return NextResponse.json(summary);
}
