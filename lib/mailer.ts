import 'server-only';


export type MailConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
};

export function getMailConfig(): MailConfig | null {
  const host = process.env.SMTP2GO_HOST || '';
  const user = process.env.SMTP2GO_USER || '';
  const pass = process.env.SMTP2GO_PASS || '';
  const from = process.env.SMTP2GO_FROM || '';
  const port = Number(process.env.SMTP2GO_PORT || '2525');
  const secure = String(process.env.SMTP2GO_SECURE || '').toLowerCase() === 'true';

  if (!host || !user || !pass || !from) return null;
  return { host, user, pass, from, port, secure };
}

export function sendingPolicy() {
  const testRecipient = (process.env.SMTP_TEST_RECIPIENT || '').trim().toLowerCase() || null;
  const billingConfirmed = String(process.env.BILLING_POLICY_CONFIRMED || '').toLowerCase() === 'true';
  return { testRecipient, billingConfirmed };
}

export async function sendInvoiceEmail(args: {
  to: string;
  subject: string;
  html: string;
  pdfBuffer: Buffer;
  filename: string;
}) {
  const config = getMailConfig();
  if (!config) throw new Error('SMTP2GO no configurado.');

  const nodemailer = await (new Function("return import('nodemailer')")() as Promise<any>).catch(() => null);
  if (!nodemailer?.default) {
    throw new Error('Nodemailer no está instalado. Ejecuta `npm install nodemailer`.');
  }

  const transporter = nodemailer.default.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });

  return transporter.sendMail({
    from: config.from,
    to: args.to,
    subject: args.subject,
    html: args.html,
    attachments: [
      {
        filename: args.filename,
        content: args.pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });
}
