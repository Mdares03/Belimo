import 'server-only';

import { prisma } from '@/lib/db';
import { loadFileOrNull } from '@/lib/file-assets';

type DailyPoint = { day: string; tonHr: number };

function money(value: number) {
  return `$${value.toFixed(2)}`;
}

function asDate(value: Date | null | undefined) {
  if (!value) return '—';
  return value.toLocaleDateString('es-MX');
}

function asDateTime(value: Date | null | undefined) {
  if (!value) return '—';
  return value.toLocaleString('es-MX');
}

function makeChartSvg(points: DailyPoint[]) {
  const width = 760;
  const height = 200;
  const pad = 24;
  if (!points.length) {
    return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${width}" height="${height}" fill="#f7f6f2"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#9a8c78" font-size="14">Sin consumo diario para este periodo</text></svg>`;
  }

  const max = Math.max(1, ...points.map((p) => p.tonHr));
  const path = points
    .map((point, idx) => {
      const x = pad + (idx / Math.max(1, points.length - 1)) * (width - pad * 2);
      const y = height - pad - (point.tonHr / max) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const labels = points
    .filter((_, idx) => idx % Math.max(1, Math.floor(points.length / 8)) === 0)
    .map((point, idx) => {
      const realIdx = idx * Math.max(1, Math.floor(points.length / 8));
      const x = pad + (realIdx / Math.max(1, points.length - 1)) * (width - pad * 2);
      return `<text x="${x.toFixed(1)}" y="${height - 4}" text-anchor="middle" font-size="10" fill="#8b7b68">${point.day}</text>`;
    })
    .join('');

  return `
  <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${width}" height="${height}" fill="#f7f6f2" rx="6"/>
    <polyline fill="none" stroke="#0f5f80" stroke-width="2.4" points="${path}" />
    ${labels}
  </svg>`;
}

async function buildDailyPoints(invoiceId: string): Promise<DailyPoint[]> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      periodStartTs: true,
      periodEndTs: true,
      local: {
        select: {
          valves: {
            select: {
              readings: {
                select: { ts: true, energyTonHr: true },
                orderBy: { ts: 'asc' },
              },
            },
          },
        },
      },
    },
  });

  if (!invoice?.periodStartTs || !invoice.periodEndTs) return [];

  const byDay = new Map<string, number>();

  for (const valve of invoice.local.valves) {
    const rows = valve.readings;
    for (let i = 1; i < rows.length; i += 1) {
      const prev = rows[i - 1];
      const curr = rows[i];
      if (curr.ts < invoice.periodStartTs || curr.ts > invoice.periodEndTs) continue;
      const delta = Math.max(0, curr.energyTonHr - prev.energyTonHr);
      const day = curr.ts.toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + delta);
    }
  }

  return Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, tonHr]) => ({ day: day.slice(8, 10), tonHr }));
}

export async function renderInvoicePdf(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      period: true,
      local: {
        include: {
          building: true,
          valves: { select: { floor: { select: { name: true } } } },
          client: {
            include: {
              users: { select: { email: true }, take: 1, orderBy: { createdAt: 'asc' } },
            },
          },
        },
      },
      client: true,
    },
  });

  if (!invoice) throw new Error('Recibo no encontrado.');

  const dailyPoints = await buildDailyPoints(invoiceId);
  const chartSvg = makeChartSvg(dailyPoints);

  const logo = invoice.local.building.logoPath ? loadFileOrNull(invoice.local.building.logoPath) : null;
  const logoDataUrl = logo && invoice.local.building.logoMime
    ? `data:${invoice.local.building.logoMime};base64,${logo.toString('base64')}`
    : null;

  const floorName = invoice.local.valves.find((v) => v.floor?.name)?.floor?.name ?? 'Sin nivel';

  const html = `<!doctype html>
  <html lang="es-MX">
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: Arial, sans-serif; color: #222; margin: 26px; }
        .head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }
        .logo { width:96px; height:96px; border:1px solid #ddd; display:grid; place-items:center; overflow:hidden; }
        .logo img { width:100%; height:100%; object-fit:contain; }
        .title { font-size:18px; font-weight:700; }
        .muted { color:#666; font-size:11px; }
        .block { border:1px solid #ddd; border-radius:6px; padding:10px; margin-top:10px; }
        table { width:100%; border-collapse:collapse; margin-top:10px; }
        th, td { border:1px solid #ddd; padding:6px 8px; font-size:12px; }
        th { background:#f7f6f2; text-align:left; }
        .r { text-align:right; }
      </style>
    </head>
    <body>
      <div class="head">
        <div class="logo">${logoDataUrl ? `<img src="${logoDataUrl}" alt="Logo"/>` : `<span class="muted">Sin logo</span>`}</div>
        <div style="flex:1;">
          <div class="title">VISTA PREVIA · Recibo ${invoice.id}</div>
          <div class="muted">Generado: ${asDateTime(invoice.createdAt)} · Estado: ${invoice.status}</div>
        </div>
      </div>

      <div class="block">
        <b>Razón Social:</b> ${invoice.client.name}<br/>
        <b>Edificio:</b> ${invoice.local.building.name}<br/>
        <b>Piso:</b> ${floorName}<br/>
        <b>Válvula/Local:</b> ${invoice.local.code}<br/>
        <b>Correo:</b> ${invoice.local.client?.users?.[0]?.email ?? 'sin-correo'}
      </div>

      <div class="block">
        <b>Medición de Energía para la Climatización</b><br/>
        <span class="muted">Periodo ${asDate(invoice.periodStartTs)} a ${asDate(invoice.periodEndTs)}</span>
      </div>

      <table>
        <thead>
          <tr><th>CLAVE</th><th>DESCRIPCIÓN</th><th class="r">CANTIDAD</th><th class="r">PRECIO</th><th class="r">TOTAL</th></tr>
        </thead>
        <tbody>
          <tr><td>ENER</td><td>Energía térmica</td><td class="r">${invoice.energyTonHr.toFixed(2)} TON-hr</td><td class="r">${money(invoice.energyAmount / Math.max(0.0001, invoice.energyTonHr))}</td><td class="r">${money(invoice.energyAmount)}</td></tr>
          <tr><td>AGUA</td><td>Agua</td><td class="r">${invoice.waterM3.toFixed(2)} m³</td><td class="r">${money(invoice.waterM3 > 0 ? invoice.waterAmount / invoice.waterM3 : 0)}</td><td class="r">${money(invoice.waterAmount)}</td></tr>
          <tr><td>FIJO</td><td>Cargo fijo</td><td class="r">1</td><td class="r">${money(invoice.fixedCharge)}</td><td class="r">${money(invoice.fixedCharge)}</td></tr>
        </tbody>
      </table>

      <table>
        <tbody>
          <tr><th>LECTURA ANTERIOR</th><td>${asDateTime(invoice.startReadingTs)}</td><th>LECTURA ACTUAL</th><td>${asDateTime(invoice.endReadingTs)}</td></tr>
          <tr><th>SUBTOTAL</th><td class="r">${money(invoice.energyAmount + invoice.waterAmount + invoice.fixedCharge)}</td><th>IVA</th><td class="r">${money(invoice.tax)}</td></tr>
          <tr><th>TOTAL</th><td class="r" colspan="3" style="font-weight:700;">${money(invoice.total)}</td></tr>
        </tbody>
      </table>

      <div class="block">
        <b>Consumo Diario del Mes</b>
        <div style="margin-top:8px;">${chartSvg}</div>
      </div>
    </body>
  </html>`;

  const playwright = await (new Function("return import('playwright')")() as Promise<any>).catch(() => null);
  if (!playwright?.chromium) {
    throw new Error('Playwright no está instalado. Ejecuta `npm install playwright` y `npx playwright install chromium`.');
  }
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '16px', right: '16px', bottom: '16px', left: '16px' } });
    return pdf;
  } finally {
    await browser.close();
  }
}
