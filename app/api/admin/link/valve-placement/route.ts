import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

type Body = { valveId?: string; floorId?: string; localId?: string; redirectTo?: string };

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
      valveId: String(fd.get("valveId") ?? ""),
      floorId: String(fd.get("floorId") ?? ""),
      localId: String(fd.get("localId") ?? ""),
      redirectTo: String(fd.get("redirectTo") ?? ""),
    };
  }

  if (!body.valveId) return NextResponse.json({ error: "Falta valveId." }, { status: 400 });
  await prisma.valve.update({ where: { id: body.valveId }, data: { floorId: body.floorId || null, localId: body.localId || null } });

  if (body.redirectTo) return NextResponse.redirect(new URL(body.redirectTo, request.url));
  return NextResponse.json({ ok: true });
}
