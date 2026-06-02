import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

type Body = { buildingId?: string; orgId?: string; redirectTo?: string };

export async function POST(request: Request) {
  const session = await auth();
  if ((session?.user?.role ?? "") !== "Administrador") return NextResponse.json({ error: "Sin permisos." }, { status: 403 });

  const contentType = request.headers.get("content-type") ?? "";
  let body: Body = {};
  if (contentType.includes("application/json")) {
    body = (await request.json().catch(() => ({}))) as Body;
  } else {
    const fd = await request.formData();
    body = {
      buildingId: String(fd.get("buildingId") ?? ""),
      orgId: String(fd.get("orgId") ?? ""),
      redirectTo: String(fd.get("redirectTo") ?? ""),
    };
  }

  if (!body.buildingId) return NextResponse.json({ error: "Falta buildingId." }, { status: 400 });
  await prisma.building.update({ where: { id: body.buildingId }, data: { orgId: body.orgId || null } });

  if (body.redirectTo) return NextResponse.redirect(new URL(body.redirectTo, request.url));
  return NextResponse.json({ ok: true });
}
