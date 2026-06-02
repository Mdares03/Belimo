import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(request.url);
  const buildingId = url.searchParams.get("buildingId") ?? session.user.buildingId;
  if (!buildingId) return NextResponse.json({ error: "Falta buildingId." }, { status: 400 });

  const role = session.user.role ?? "";
  const orgId = session.user.orgId ?? null;
  const where = orgId
    ? { id: buildingId, orgId }
    : role === "Administrador"
      ? { id: buildingId }
      : { id: session.user.buildingId ?? "" };

  const allowedBuilding = await prisma.building.findFirst({ where, select: { id: true } });
  if (!allowedBuilding) return NextResponse.json({ error: "Sin acceso al edificio." }, { status: 403 });

  const periods = await prisma.billingPeriod.findMany({
    where: { buildingId },
    orderBy: [{ year: "desc" }, { startDate: "desc" }],
    select: { id: true, label: true, year: true, startDate: true, endDate: true },
  });

  return NextResponse.json({ periods });
}
