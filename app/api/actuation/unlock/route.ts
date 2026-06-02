import { compare } from "bcryptjs";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { signActuationToken } from "@/lib/actuation-auth";
import { prisma } from "@/lib/db";

type Body = { password?: string };

// Re-authenticates the current user by login password and returns a short-lived
// token that authorizes valve actuation. No password is ever stored client-side.
export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const role = session.user.role ?? "";
  if (role !== "Administrador" && role !== "Administrador Edificio") {
    return NextResponse.json({ error: "Sin permisos." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const password = typeof body.password === "string" ? body.password : "";
  if (!password) return NextResponse.json({ error: "Contraseña requerida." }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user?.passwordHash) return NextResponse.json({ error: "Usuario sin contraseña." }, { status: 400 });

  const ok = await compare(password, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 });

  const { token, expiresAt } = signActuationToken(userId);
  return NextResponse.json({ ok: true, token, expiresAt });
}
