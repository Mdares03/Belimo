import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const session = await auth();
  if ((session?.user?.role ?? "") !== "Administrador") return NextResponse.json({ error: "Sin permisos." }, { status: 403 });

  const url = new URL(request.url);
  const buildingId = url.searchParams.get("buildingId");
  if (!buildingId) return NextResponse.json({ error: "Falta buildingId." }, { status: 400 });

  const [stale, missingTariff, unlinkedLocals, periodCount] = await Promise.all([
    prisma.valve.count({ where: { buildingId, OR: [{ lastReportAt: null }, { lastReportAt: { lt: new Date(Date.now() - 48 * 3600_000) } }] } }),
    prisma.tariff.count({ where: { buildingId } }),
    prisma.local.count({ where: { buildingId, clientId: null, valves: { some: {} } } }),
    prisma.billingPeriod.count({ where: { buildingId } }),
  ]);

  return NextResponse.json({
    buildingId,
    checks: {
      staleValves48h: stale,
      missingTariff: missingTariff === 0,
      unlinkedLocalsWithValves: unlinkedLocals,
      billingPeriods: periodCount,
    },
  });
}
