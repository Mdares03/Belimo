import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

type Body = { localId?: string; clientId?: string; redirectTo?: string };

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
      localId: String(fd.get("localId") ?? ""),
      clientId: String(fd.get("clientId") ?? ""),
      redirectTo: String(fd.get("redirectTo") ?? ""),
    };
  }

  if (!body.localId) return NextResponse.json({ error: "Falta localId." }, { status: 400 });
  await prisma.local.update({ where: { id: body.localId }, data: { clientId: body.clientId || null } });

  if (body.redirectTo) return NextResponse.redirect(new URL(body.redirectTo, request.url));
  return NextResponse.json({ ok: true });
}
