import { InvoiceStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { resolveRecipient } from "@/lib/recipient";

type Body = { invoiceId?: string; action?: "mark_sent" | "mark_paid" | "mark_overdue" };

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = session.user.role ?? "";
  if (role !== "Administrador Edificio" && role !== "Administrador") {
    return NextResponse.json({ error: "Sin permisos." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.invoiceId || !body.action) return NextResponse.json({ error: "Faltan datos." }, { status: 400 });

  const invoice = await prisma.invoice.findUnique({
    where: { id: body.invoiceId },
    include: {
      local: {
        select: {
          buildingId: true,
          client: {
            select: {
              id: true,
              users: { select: { email: true }, orderBy: { createdAt: "asc" } },
              org: { select: { contactEmail: true } },
            },
          },
        },
      },
    },
  });
  if (!invoice) return NextResponse.json({ error: "Recibo no encontrado." }, { status: 404 });

  const orgId = session.user.orgId ?? null;
  if (orgId) {
    const allowed = await prisma.building.findFirst({ where: { id: invoice.local.buildingId, orgId }, select: { id: true } });
    if (!allowed) return NextResponse.json({ error: "Sin acceso a este recibo." }, { status: 403 });
  }

  if (body.action === "mark_sent") {
    if (invoice.status === InvoiceStatus.PAGADA) {
      return NextResponse.json({ error: "No se puede enviar un recibo pagado." }, { status: 400 });
    }

    const recipient = resolveRecipient(invoice.local.client);
    if (!recipient.canSend) {
      return NextResponse.json(
        {
          error: "Falta correo del inquilino. Asigna un email de usuario del cliente antes de enviar.",
          code: recipient.blockReason ?? "recipient_not_confident",
          recipientSource: recipient.source,
          recipientPreview: recipient.email,
        },
        { status: 400 },
      );
    }

    const updated = await prisma.invoice.update({ where: { id: invoice.id }, data: { status: InvoiceStatus.ENVIADA } });
    return NextResponse.json({ ok: true, status: updated.status, recipient: recipient.email, recipientSource: recipient.source });
  }

  if (body.action === "mark_paid") {
    const updated = await prisma.invoice.update({ where: { id: invoice.id }, data: { status: InvoiceStatus.PAGADA, paidAt: new Date() } });
    return NextResponse.json({ ok: true, status: updated.status });
  }

  if (body.action === "mark_overdue") {
    if (invoice.status === InvoiceStatus.PAGADA) return NextResponse.json({ error: "No se puede vencer un recibo pagado." }, { status: 400 });
    const updated = await prisma.invoice.update({ where: { id: invoice.id }, data: { status: InvoiceStatus.VENCIDA } });
    return NextResponse.json({ ok: true, status: updated.status });
  }

  return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
}
