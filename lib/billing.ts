import { InvoiceStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type RunStatus = "created" | "updated" | "skipped" | "locked" | "error";

export type BillingRunRow = {
  localId: string;
  localCode: string;
  clientId: string;
  clientName: string;
  status: RunStatus;
  reason?: string;
  invoiceId?: string;
  energyTonHr?: number;
  waterM3?: number;
  subtotal?: number;
  tax?: number;
  total?: number;
  anomalies?: string[];
};

export type BillingRunSummary = {
  buildingId: string;
  buildingName: string;
  period: {
    id: string;
    label: string;
    year: number;
    startUtc: string;
    endUtcExclusive: string;
    timezone: string;
  };
  counts: {
    created: number;
    updated: number;
    skipped: number;
    locked: number;
    error: number;
    anomalies: number;
  };
  rows: BillingRunRow[];
};

export type BillingInput = {
  buildingId: string;
  billingPeriodId: string;
};

export type ChargeFromTariffInput = {
  tonHr: number;
  waterM3: number;
  tariff: {
    efficiencyKwhPerTonHr?: number | null;
    cfeRatePerKwh?: number | null;
    energyRate: number;
    waterRate: number;
    fixedCharge: number;
    applyTax: boolean;
    taxRate: number;
  };
  includeFixedCharge: boolean;
};

export type ChargeFromTariffBreakdown = {
  energyAmount: number;
  waterAmount: number;
  fixedCharge: number;
  subtotal: number;
  tax: number;
  total: number;
};

const DEFAULT_DUE_DAYS = 10;
const BILLING_MODE = "legacy_efficiency_cfe" as const;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function resolveTimeZone(city?: string | null) {
  const key = (city ?? "").trim().toLowerCase();
  if (key.includes("canc")) return "America/Cancun";
  if (key.includes("monterrey")) return "America/Monterrey";
  if (key.includes("guadalajara")) return "America/Mexico_City";
  return process.env.BILLING_DEFAULT_TIMEZONE || "America/Mexico_City";
}

async function getBoundaryReading(valveId: string, boundary: Date) {
  const before = await prisma.reading.findFirst({
    where: { valveId, ts: { lte: boundary } },
    orderBy: [{ energyTonHr: "desc" }, { ts: "desc" }],
  });
  if (before) return before;
  return prisma.reading.findFirst({
    where: { valveId, ts: { gte: boundary } },
    orderBy: { ts: "asc" },
  });
}

function computeLegacyEnergyAmount(
  thermalTonHr: number,
  opts: { efficiencyKwhPerTonHr?: number | null; cfeRatePerKwh?: number | null; energyRate: number },
) {
  if (opts.efficiencyKwhPerTonHr != null && opts.cfeRatePerKwh != null) {
    return round2(thermalTonHr * opts.efficiencyKwhPerTonHr * opts.cfeRatePerKwh);
  }
  return round2(thermalTonHr * opts.energyRate);
}

export function computeChargeFromTariff(input: ChargeFromTariffInput): ChargeFromTariffBreakdown {
  const energyAmount = computeLegacyEnergyAmount(input.tonHr, {
    efficiencyKwhPerTonHr: input.tariff.efficiencyKwhPerTonHr,
    cfeRatePerKwh: input.tariff.cfeRatePerKwh,
    energyRate: input.tariff.energyRate,
  });
  const waterAmount = round2(input.waterM3 * input.tariff.waterRate);
  const fixedCharge = round2(input.includeFixedCharge ? input.tariff.fixedCharge : 0);
  const subtotal = round2(energyAmount + waterAmount + fixedCharge);
  const tax = input.tariff.applyTax ? round2(subtotal * input.tariff.taxRate) : 0;
  const total = round2(subtotal + tax);
  return { energyAmount, waterAmount, fixedCharge, subtotal, tax, total };
}

export async function runBillingForPeriod(input: BillingInput): Promise<BillingRunSummary> {
  const periodRow = await prisma.billingPeriod.findUnique({
    where: { id: input.billingPeriodId },
    include: { building: { select: { id: true, name: true, city: true } } },
  });
  if (!periodRow) throw new Error("Periodo no encontrado.");
  if (periodRow.buildingId !== input.buildingId) throw new Error("El periodo no pertenece al edificio.");

  const building = periodRow.building;
  const timezone = resolveTimeZone(building.city);
  const startUtc = periodRow.startDate;
  const endUtcExclusive = new Date(periodRow.endDate.getTime() + 1000);

  const tariff = await prisma.tariff.findFirst({
    where: { buildingId: building.id, effectiveFrom: { lte: startUtc } },
    orderBy: { effectiveFrom: "desc" },
  });

  const locals = await prisma.local.findMany({
    where: { buildingId: building.id, clientId: { not: null } },
    select: {
      id: true,
      code: true,
      clientId: true,
      client: { select: { name: true } },
      valves: { select: { id: true, serial: true } },
    },
    orderBy: { code: "asc" },
  });

  const rows: BillingRunRow[] = [];

  for (const local of locals) {
    try {
      if (!local.clientId || !local.client?.name) {
        rows.push({ localId: local.id, localCode: local.code, clientId: local.clientId ?? "", clientName: local.client?.name ?? "Sin asignar", status: "skipped", reason: "missing_client" });
        continue;
      }
      if (!tariff) {
        rows.push({ localId: local.id, localCode: local.code, clientId: local.clientId, clientName: local.client.name, status: "skipped", reason: "missing_tariff" });
        continue;
      }
      if (local.valves.length === 0) {
        rows.push({ localId: local.id, localCode: local.code, clientId: local.clientId, clientName: local.client.name, status: "skipped", reason: "missing_valves" });
        continue;
      }

      let coolingTonHr = 0;
      let waterM3 = 0;
      let earliestStartTs: Date | null = null;
      let latestEndTs: Date | null = null;
      let earliestStartId: string | null = null;
      let latestEndId: string | null = null;
      const anomalies: string[] = [];

      for (const valve of local.valves) {
        const start = await getBoundaryReading(valve.id, startUtc);
        const end = await getBoundaryReading(valve.id, endUtcExclusive);
        if (!start || !end) {
          anomalies.push(`missing_boundary_reading:${valve.serial}`);
          continue;
        }

        if (!earliestStartTs || start.ts < earliestStartTs) {
          earliestStartTs = start.ts;
          earliestStartId = start.id;
        }
        if (!latestEndTs || end.ts > latestEndTs) {
          latestEndTs = end.ts;
          latestEndId = end.id;
        }

        const rawEnergy = end.energyTonHr - start.energyTonHr;
        const rawWater = end.waterM3 - start.waterM3;
        if (rawEnergy < 0) anomalies.push(`negative_energy_delta:${valve.serial}`);
        if (rawWater < 0) anomalies.push(`negative_water_delta:${valve.serial}`);

        coolingTonHr += Math.max(0, rawEnergy);
        waterM3 += Math.max(0, rawWater);
      }

      if (coolingTonHr === 0 && waterM3 === 0) {
        rows.push({
          localId: local.id,
          localCode: local.code,
          clientId: local.clientId,
          clientName: local.client.name,
          status: "skipped",
          reason: anomalies.length ? "missing_or_invalid_boundary_readings" : "zero_consumption",
          anomalies,
        });
        continue;
      }

      const includeHeating = tariff.includeHeating;
      if (includeHeating) anomalies.push("heating_not_backfilled_using_cooling_only");

      const charge = computeChargeFromTariff({
        tonHr: coolingTonHr,
        waterM3,
        tariff,
        includeFixedCharge: true,
      });
      const { energyAmount, waterAmount, subtotal, tax, total } = charge;
      const dueDate = new Date(endUtcExclusive.getTime() + DEFAULT_DUE_DAYS * 86400000);

      const existing = await prisma.invoice.findMany({
        where: { periodId: periodRow.id, localId: local.id, clientId: local.clientId },
        orderBy: { createdAt: "desc" },
      });
      const paid = existing.find((row) => row.status === InvoiceStatus.PAGADA);
      if (paid) {
        rows.push({ localId: local.id, localCode: local.code, clientId: local.clientId, clientName: local.client.name, status: "locked", reason: "paid_invoice_locked", invoiceId: paid.id, energyTonHr: round2(coolingTonHr), waterM3: round2(waterM3), subtotal, tax, total, anomalies });
        continue;
      }

      const reusable = existing.find((row) => row.status !== InvoiceStatus.PAGADA);
      const invoiceData: Prisma.InvoiceUncheckedCreateInput = {
        periodId: periodRow.id,
        clientId: local.clientId,
        localId: local.id,
        energyTonHr: round2(coolingTonHr),
        waterM3: round2(waterM3),
        energyAmount,
        waterAmount,
        fixedCharge: charge.fixedCharge,
        tax,
        total,
        dueDate,
        status: InvoiceStatus.GENERADA,
        periodStartTs: startUtc,
        periodEndTs: new Date(endUtcExclusive.getTime() - 1),
        startReadingTs: earliestStartTs,
        endReadingTs: latestEndTs,
        startReadingId: earliestStartId,
        endReadingId: latestEndId,
        anomalies: {
          billingMode: BILLING_MODE,
          includeHeating,
          applyTax: tariff.applyTax,
          anomalies,
        },
      };

      if (!reusable) {
        const created = await prisma.invoice.create({ data: invoiceData });
        rows.push({ localId: local.id, localCode: local.code, clientId: local.clientId, clientName: local.client.name, status: "created", invoiceId: created.id, energyTonHr: invoiceData.energyTonHr, waterM3: invoiceData.waterM3, subtotal, tax, total, anomalies });
      } else {
        const updated = await prisma.invoice.update({ where: { id: reusable.id }, data: invoiceData });
        rows.push({ localId: local.id, localCode: local.code, clientId: local.clientId, clientName: local.client.name, status: "updated", invoiceId: updated.id, energyTonHr: invoiceData.energyTonHr, waterM3: invoiceData.waterM3, subtotal, tax, total, anomalies });
      }
    } catch (error) {
      rows.push({ localId: local.id, localCode: local.code, clientId: local.clientId ?? "", clientName: local.client?.name ?? "Sin asignar", status: "error", reason: error instanceof Error ? error.message : "unknown_error" });
    }
  }

  const counts = rows.reduce(
    (acc, row) => {
      acc[row.status] += 1;
      acc.anomalies += row.anomalies?.length ?? 0;
      return acc;
    },
    { created: 0, updated: 0, skipped: 0, locked: 0, error: 0, anomalies: 0 },
  );

  return {
    buildingId: building.id,
    buildingName: building.name,
    period: {
      id: periodRow.id,
      label: periodRow.label,
      year: periodRow.year,
      startUtc: startUtc.toISOString(),
      endUtcExclusive: endUtcExclusive.toISOString(),
      timezone,
    },
    counts,
    rows,
  };
}
