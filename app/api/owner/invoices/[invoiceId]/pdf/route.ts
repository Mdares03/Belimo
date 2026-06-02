import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { renderInvoicePdf } from '@/lib/invoice-pdf';

export async function GET(_request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await context.params;

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const role = session.user.role ?? '';
  if (role !== 'Administrador' && role !== 'Administrador Edificio' && role !== 'Cliente') {
    return NextResponse.json({ error: 'Sin permisos.' }, { status: 403 });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      local: { select: { buildingId: true } },
      clientId: true,
    },
  });

  if (!invoice) return NextResponse.json({ error: 'Recibo no encontrado.' }, { status: 404 });

  if (role === 'Administrador Edificio') {
    const orgId = session.user.orgId ?? null;
    const allowed = orgId
      ? await prisma.building.findFirst({ where: { id: invoice.local.buildingId, orgId }, select: { id: true } })
      : null;
    if (!allowed) return NextResponse.json({ error: 'Sin acceso a este recibo.' }, { status: 403 });
  }

  if (role === 'Cliente') {
    const clientId = session.user.clientId ?? null;
    if (!clientId || clientId !== invoice.clientId) {
      return NextResponse.json({ error: 'Sin acceso a este recibo.' }, { status: 403 });
    }
  }

  try {
    const pdf = await renderInvoicePdf(invoiceId);
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="recibo-${invoiceId}.pdf"`,
        'cache-control': 'private, max-age=60',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
