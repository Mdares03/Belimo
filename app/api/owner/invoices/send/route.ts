import { InvoiceStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { sendingPolicy, sendInvoiceEmail } from '@/lib/mailer';
import { resolveRecipient } from '@/lib/recipient';
import { renderInvoicePdf } from '@/lib/invoice-pdf';

type Body = { invoiceId?: string };

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const role = session.user.role ?? '';
  if (role !== 'Administrador' && role !== 'Administrador Edificio') {
    return NextResponse.json({ error: 'Sin permisos.' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.invoiceId) return NextResponse.json({ error: 'Falta invoiceId.' }, { status: 400 });

  const invoice = await prisma.invoice.findUnique({
    where: { id: body.invoiceId },
    include: {
      period: true,
      local: {
        include: {
          building: { select: { id: true, name: true } },
          client: {
            select: {
              name: true,
              users: { select: { email: true }, orderBy: { createdAt: 'asc' }, take: 1 },
              org: { select: { contactEmail: true } },
            },
          },
        },
      },
    },
  });

  if (!invoice) return NextResponse.json({ error: 'Recibo no encontrado.' }, { status: 404 });

  const orgId = session.user.orgId ?? null;
  if (role === 'Administrador Edificio') {
    const allowed = orgId
      ? await prisma.building.findFirst({ where: { id: invoice.local.building.id, orgId }, select: { id: true } })
      : null;
    if (!allowed) return NextResponse.json({ error: 'Sin acceso a este recibo.' }, { status: 403 });
  }

  if (invoice.status === InvoiceStatus.PAGADA) {
    return NextResponse.json({ error: 'No se puede enviar un recibo pagado.' }, { status: 400 });
  }

  const recipient = resolveRecipient(invoice.local.client);
  if (!recipient.canSend) {
    return NextResponse.json(
      {
        error: 'Falta correo del inquilino. Asigna un email de usuario del cliente antes de enviar.',
        code: recipient.blockReason ?? 'recipient_not_confident',
        recipientSource: recipient.source,
        recipientPreview: recipient.email,
      },
      { status: 400 },
    );
  }

  const policy = sendingPolicy();
  const normalizedRecipient = recipient.email.toLowerCase();
  const canSendReal = policy.billingConfirmed;

  if (!canSendReal) {
    if (!policy.testRecipient) {
      return NextResponse.json(
        { error: 'Envío real deshabilitado: falta confirmación comercial y SMTP_TEST_RECIPIENT.' },
        { status: 400 },
      );
    }
    if (normalizedRecipient !== policy.testRecipient) {
      return NextResponse.json(
        {
          error: `Envío real deshabilitado. Solo permitido a correo de prueba (${policy.testRecipient}).`,
          code: 'send_gated_to_test_recipient',
        },
        { status: 400 },
      );
    }
  }

  try {
    const pdf = await renderInvoicePdf(invoice.id);
    const filename = `recibo-${invoice.id}.pdf`;
    const subject = `Recibo ${invoice.period.label} ${invoice.period.year} · ${invoice.local.building.name} · ${invoice.local.code}`;

    await sendInvoiceEmail({
      to: recipient.email,
      subject,
      html: `<p>Hola,</p><p>Adjuntamos tu recibo del periodo <b>${invoice.period.label} ${invoice.period.year}</b>.</p><p>Total: <b>$${invoice.total.toFixed(2)}</b></p>`,
      pdfBuffer: Buffer.from(pdf),
      filename,
    });

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: InvoiceStatus.ENVIADA },
      select: { id: true, status: true },
    });

    return NextResponse.json({ ok: true, invoiceId: updated.id, status: updated.status, recipient: recipient.email });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
