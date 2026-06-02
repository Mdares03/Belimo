import { ComputedPaidStatus, InvoiceStatus, type ValveStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { computeChargeFromTariff, type ChargeFromTariffBreakdown } from "@/lib/billing";
import { getTimeseries } from "@/lib/belimo";
import { resolveRecipient } from "@/lib/recipient";
import type { Tone } from "@/components/ui/primitives";

export type InvoiceModalData = {
  title: string;
  period: string;
  due: string;
  total: string;
  lines: Array<{ label: string; calc: string; amount: string }>;
  isEmpty?: boolean;
  emptyReason?: string;
  emptyActionHref?: string;
  emptyActionLabel?: string;
};

export type ClientValveBreakdown = {
  name: string;
  amount: string;
  pct: number;
  energy: string;
  water: string;
  peak: string;
};

export type ClientInvoiceRow = {
  id: string;
  period: string;
  local: string;
  total: string;
  tone: Tone;
  status: string;
};

export type ClientHistoryRow = {
  month: string;
  status: string;
  tone: Tone;
  receiptLabel: string;
  valves: Record<string, { tonHr: number; amount: number }>;
};

export type ClientScopedView = {
  name: string;
  roleLabel: string;
  gaugePct: number;
  delta: string;
  deltaLabel: string;
  estimate: string;
  months: Array<{ label: string; value: number; tonHr: number; current?: boolean }>;
  valves: ClientValveBreakdown[];
  valveFilters: Array<{ id: string; label: string }>;
  history: ClientHistoryRow[];
  invoiceModal: InvoiceModalData;
  invoices: ClientInvoiceRow[];
  summaryDate: string;
};

export type OwnerValveChip = {
  id: string;
  label: string;
  status: ValveStatus;
  commandedState?: "ON" | "OFF" | null;
  lastCommandAt?: string;
  lastCommandResult?: string | null;
  readingsCount: number;
  oldestReading?: string;
  newestReading?: string;
};

export type EstimateStatus = "ok" | "no_tariff" | "no_data";

export type RowEstimate = {
  estimateLabel: string;
  estimateAmount: string;
  estimateStatus: EstimateStatus;
  estimateBreakdown?: ChargeFromTariffBreakdown;
};

export type OwnerLocalRow = {
  invoiceId?: string;
  local: string;
  client: string;
  valves: OwnerValveChip[];
  consumption: string;
  coverageLabel: string;
  readingsCount: number;
  oldestReading?: string;
  newestReading?: string;
  amount: string;
  statusLabel: string;
  tone: Tone;
  sendEligible: boolean;
  invoiceModal: InvoiceModalData;
} & RowEstimate;

export type OwnerFloorGroup = {
  floor: string;
  locales: number;
  valves: number;
  amount: string;
  statusLabel: string;
  tone: Tone;
  rows: OwnerLocalRow[];
};

export type OwnerTenantRow = {
  clientId?: string;
  tenant: string;
  local: string;
  valves: OwnerValveChip[];
  email: string;
  accountStatus: string;
  tone: Tone;
  action: string;
};

export type OwnerScopedView = {
  ownerName: string;
  ownerRole: string;
  buildingName: string;
  buildingId: string;
  buildingCount: number;
  buildingLogoUrl: string | null;
  stats: {
    valves: number;
    floors: number;
    locales: number;
  };
  kpis: {
    due: string;
    paid: string;
    overdue: string;
  };
  valveHealth: {
    ok: number;
    alerta: number;
    error: number;
    offline: number;
  };
  floorGroups: OwnerFloorGroup[];
  cobranzaRows: Array<{
    invoiceId?: string;
    local: string;
    client: string;
    floor: string;
    consumption: string;
    amount: string;
    statusLabel: string;
    tone: Tone;
    sendEligible: boolean;
    invoiceModal: InvoiceModalData;
  } & RowEstimate>;
  recibosSummary: Array<{ label: string; value: number; tone: Tone }>;
  recipients: Array<{
    invoiceId?: string;
    local: string;
    client: string;
    email: string;
    amount: string;
    statusLabel: string;
    sendEligible: boolean;
    recipientSource: "client_user" | "org_fallback" | "missing";
    sendBlockReason?: string;
  }>;
  sendTotals: { count: number; amount: string };
  tenants: OwnerTenantRow[];
};

function asMoney(value: number) {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function asMoneyPrecise(value: number) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildEmptyInvoiceModal(local: string, client: string, opts?: { hasClient?: boolean }): InvoiceModalData {
  const hasClient = opts?.hasClient ?? false;
  return {
    title: `${client} — Local ${local}`,
    period: "Sin periodo",
    due: "sin vencimiento",
    total: "—",
    lines: [],
    isEmpty: true,
    emptyReason: hasClient
      ? "No hay recibo generado para este local. Puede haberse saltado por consumo 0 o lecturas inválidas en el periodo. Revisa el resultado detallado en Recibos > Generar."
      : "Este local no tiene cliente asignado. Primero asigna inquilino en Inquilinos; después podrás generar su recibo.",
    emptyActionHref: hasClient ? "/owner/recibos" : "/owner/inquilinos",
    emptyActionLabel: hasClient ? "Ir a Recibos" : "Ir a Inquilinos",
  };
}

function buildInvoiceModalData(invoice: {
  energyTonHr: number;
  waterM3: number;
  energyAmount: number;
  waterAmount: number;
  fixedCharge: number;
  tax: number;
  total: number;
  dueDate: Date | null;
  period: { label: string; year: number };
  local: { code: string; client: { name: string } | null };
}): InvoiceModalData {
  return {
    title: `${invoice.local.client?.name ?? "Sin asignar"} — Local ${invoice.local.code}`,
    period: `${invoice.period.label.replace(" - Locales", "")} ${invoice.period.year}`,
    due: invoice.dueDate
      ? `vence ${invoice.dueDate.toLocaleDateString("es-MX", { day: "2-digit", month: "short" }).toLowerCase()}`
      : "sin vencimiento",
    total: asMoney(invoice.total),
    lines: [
      { label: "Energía térmica", calc: `${Math.round(invoice.energyTonHr).toLocaleString("en-US")} TON-hr`, amount: asMoney(invoice.energyAmount) },
      { label: "Agua", calc: `${Math.round(invoice.waterM3).toLocaleString("en-US")} m³`, amount: asMoney(invoice.waterAmount) },
      { label: "Cargo fijo", calc: "servicio mensual", amount: asMoney(invoice.fixedCharge) },
      { label: "IVA", calc: "16%", amount: asMoney(invoice.tax) },
    ],
  };
}

function asCoverageLabel(readingsCount: number, oldestReading?: string) {
  if (!readingsCount || !oldestReading) return "Sin historial";
  const monthYear = new Date(oldestReading).toLocaleDateString("es-MX", { month: "short", year: "numeric" }).replace(".", "");
  return `${readingsCount.toLocaleString("en-US")} lecturas · desde ${monthYear}`;
}

function trailing30dStartUtc(now = new Date()) {
  return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
}

const CANCUN_TZ = "America/Cancun";

function getNowInCancunParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: CANCUN_TZ,
    year: "numeric",
    month: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value ?? "0");
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "1");
  return { year, month };
}

function monthKey(year: number, month1to12: number) {
  return `${year}-${String(month1to12).padStart(2, "0")}`;
}

function monthStartUtcInCancun(year: number, month1to12: number) {
  // Cancun runs at UTC-5 year-round; local midnight maps to 05:00 UTC.
  return new Date(Date.UTC(year, month1to12 - 1, 1, 5, 0, 0, 0));
}

function closedMonthKeys(limit: number) {
  const { year: nowYear, month: nowMonth } = getNowInCancunParts(new Date());
  const keys: string[] = [];
  let year = nowYear;
  let month = nowMonth - 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }

  while (keys.length < limit) {
    keys.push(monthKey(year, month));
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
  }

  return keys;
}

type ValveUsageDelta = {
  tonHr: number;
  waterM3: number;
  hasData: boolean;
};

async function getTrailingUsageByValveId(
  valveIds: string[],
  startBoundary: Date,
  endBoundary: Date,
): Promise<Map<string, ValveUsageDelta>> {
  const usageByValveId = new Map<string, ValveUsageDelta>();
  if (!valveIds.length) return usageByValveId;

  const startBeforeBoundary = await prisma.reading.findMany({
    where: { valveId: { in: valveIds }, ts: { lte: startBoundary } },
    select: { valveId: true, ts: true, energyTonHr: true, waterM3: true },
    orderBy: [{ valveId: "asc" }, { energyTonHr: "desc" }, { ts: "desc" }],
    distinct: ["valveId"],
  });

  const endBeforeBoundary = await prisma.reading.findMany({
    where: { valveId: { in: valveIds }, ts: { lte: endBoundary } },
    select: { valveId: true, ts: true, energyTonHr: true, waterM3: true },
    orderBy: [{ valveId: "asc" }, { energyTonHr: "desc" }, { ts: "desc" }],
    distinct: ["valveId"],
  });

  const startByValveId = new Map(startBeforeBoundary.map((reading) => [reading.valveId, reading] as const));
  const endByValveId = new Map(endBeforeBoundary.map((reading) => [reading.valveId, reading] as const));

  for (const valveId of valveIds) {
    const start = startByValveId.get(valveId);
    const end = endByValveId.get(valveId);
    if (!start || !end || end.ts <= startBoundary) {
      usageByValveId.set(valveId, { tonHr: 0, waterM3: 0, hasData: false });
      continue;
    }

    usageByValveId.set(valveId, {
      tonHr: Math.max(0, end.energyTonHr - start.energyTonHr),
      waterM3: Math.max(0, end.waterM3 - start.waterM3),
      hasData: true,
    });
  }

  return usageByValveId;
}

type TariffLike = {
  efficiencyKwhPerTonHr?: number | null;
  cfeRatePerKwh?: number | null;
  energyRate: number;
  waterRate: number;
  fixedCharge: number;
  applyTax: boolean;
  taxRate: number;
};

async function getEffectiveTariffByBuildingId(buildingIds: string[], boundary: Date): Promise<Map<string, TariffLike>> {
  const map = new Map<string, TariffLike>();
  if (!buildingIds.length) return map;
  const tariffs = await prisma.tariff.findMany({
    where: { buildingId: { in: buildingIds }, effectiveFrom: { lte: boundary } },
    orderBy: [{ buildingId: "asc" }, { effectiveFrom: "desc" }],
  });
  for (const tariff of tariffs) {
    if (!map.has(tariff.buildingId)) {
      map.set(tariff.buildingId, tariff);
    }
  }
  return map;
}

function computeReferenceChargeFromTariff(input: {
  tonHr: number;
  tariff: TariffLike;
}): ChargeFromTariffBreakdown {
  return computeChargeFromTariff({
    tonHr: input.tonHr,
    waterM3: 0,
    tariff: {
      ...input.tariff,
      efficiencyKwhPerTonHr: null,
      cfeRatePerKwh: null,
      waterRate: 0,
      fixedCharge: 0,
    },
    includeFixedCharge: false,
  });
}

function makeEstimateDisplay(input: {
  status: EstimateStatus;
  amount?: number;
  breakdown?: ChargeFromTariffBreakdown;
  basisLabel?: string;
}): RowEstimate {
  if (input.status === "no_tariff") {
    return {
      estimateLabel: "≈ — (sin tarifa)",
      estimateAmount: "—",
      estimateStatus: "no_tariff",
    };
  }
  if (input.status === "no_data") {
    const suffix = input.basisLabel ? ` en ${input.basisLabel}` : "";
    return {
      estimateLabel: `≈ — (sin lecturas${suffix})`,
      estimateAmount: "—",
      estimateStatus: "no_data",
    };
  }

  const amount = input.amount ?? 0;
  const breakdown = input.breakdown;
  const windowLabel = input.basisLabel ?? "mes cerrado más reciente";
  return {
    estimateLabel: `≈ ${asMoneyPrecise(amount)} · estimado ${windowLabel} (tarifa provisional)`,
    estimateAmount: asMoneyPrecise(amount),
    estimateStatus: "ok",
    estimateBreakdown: breakdown,
  };
}

function statusToTone(status: InvoiceStatus): Tone {
  if (status === InvoiceStatus.PAGADA) return "good";
  if (status === InvoiceStatus.VENCIDA) return "bad";
  if (status === InvoiceStatus.BORRADOR) return "neutral";
  return "warn";
}

function statusToLabel(status: InvoiceStatus) {
  if (status === InvoiceStatus.PAGADA) return "Pagado";
  if (status === InvoiceStatus.VENCIDA) return "Vencido";
  if (status === InvoiceStatus.BORRADOR) return "Borrador";
  if (status === InvoiceStatus.ENVIADA) return "Enviado";
  return "Por cobrar";
}

function valveToTone(status: ValveStatus): Tone {
  if (status === "OK") return "good";
  if (status === "ALERTA") return "warn";
  if (status === "ERROR") return "bad";
  return "neutral";
}

export async function getClientScopedView(): Promise<ClientScopedView> {
  const session = await auth();
  if (!session?.user?.clientId) {
    return {
      name: session?.user?.name ?? "Cliente",
      roleLabel: "Sin local asignado",
      gaugePct: 0,
      delta: "—",
      deltaLabel: "sin comparativo",
      estimate: "$0",
      months: [],
      valves: [],
      valveFilters: [],
      history: [],
      invoiceModal: { title: "Sin factura", period: "Sin periodo", due: "sin vencimiento", total: "$0", lines: [] },
      invoices: [],
      summaryDate: "sin datos",
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      client: { select: { name: true } },
    },
  });

  const locals = await prisma.local.findMany({
    where: { clientId: session.user.clientId },
    select: { id: true, code: true, building: { select: { name: true } } },
    orderBy: { code: "asc" },
  });

  const localIds = locals.map((local) => local.id);
  const invoices = localIds.length
    ? await prisma.invoice.findMany({
      where: { clientId: session.user.clientId, localId: { in: localIds } },
      orderBy: { createdAt: "desc" },
      include: { local: true, period: true },
    })
    : [];

  const byLocal = new Map<string, { energy: number; water: number; total: number }>();
  for (const item of invoices) {
    const key = item.local.code;
    const curr = byLocal.get(key) ?? { energy: 0, water: 0, total: 0 };
    curr.energy += item.energyTonHr;
    curr.water += item.waterM3;
    curr.total += item.total;
    byLocal.set(key, curr);
  }

  const totals = Array.from(byLocal.values()).reduce((acc, row) => {
    acc.energy += row.energy;
    acc.total += row.total;
    return acc;
  }, { energy: 0, total: 0 });

  const valves = Array.from(byLocal.entries()).map(([name, row]) => ({
    name,
    amount: asMoney(row.total),
    pct: totals.total > 0 ? Math.max(8, Math.round((row.total / totals.total) * 100)) : 0,
    energy: `${Math.round(row.energy).toLocaleString("en-US")}`,
    water: `${Math.round(row.water).toLocaleString("en-US")}`,
    peak: "N/A · N/A",
  }));

  const firstInvoice = invoices[0];
  const invoiceModal: InvoiceModalData = firstInvoice ? {
    title: `${user?.client?.name ?? "Cliente"} — Local ${firstInvoice.local.code}`,
    period: `${firstInvoice.period.label.replace(" - Locales", "")} ${firstInvoice.period.year}`,
    due: firstInvoice.dueDate ? `vence ${firstInvoice.dueDate.toLocaleDateString("es-MX", { day: "2-digit", month: "short" }).toLowerCase()}` : "sin vencimiento",
    total: asMoney(firstInvoice.total),
    lines: [
      { label: "Energía térmica", calc: `${Math.round(firstInvoice.energyTonHr).toLocaleString("en-US")} TON-hr`, amount: asMoney(firstInvoice.energyAmount) },
      { label: "Agua", calc: `${Math.round(firstInvoice.waterM3).toLocaleString("en-US")} m³`, amount: asMoney(firstInvoice.waterAmount) },
      { label: "Cargo fijo", calc: "servicio mensual", amount: asMoney(firstInvoice.fixedCharge) },
      { label: "IVA", calc: "16%", amount: asMoney(firstInvoice.tax) },
    ],
  } : { title: "Sin factura", period: "Sin periodo", due: "sin vencimiento", total: "—", lines: [], isEmpty: true, emptyReason: "Aún no hay un recibo generado para este cliente." };

  const invoiceRows = invoices.map((item) => ({
    id: item.id,
    period: `${item.period.label.replace(" - Locales", "")} ${item.period.year}`,
    local: item.local.code,
    total: asMoney(item.total),
    tone: statusToTone(item.status),
    status: statusToLabel(item.status),
  }));

  const now = new Date();
  const months = Array.from({ length: 6 }).map((_, idx) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1);
    const label = d.toLocaleDateString("es-MX", { month: "short" }).replace(".", "");
    const monthInvoices = invoices.filter((inv) => inv.createdAt.getMonth() === d.getMonth() && inv.createdAt.getFullYear() === d.getFullYear());
    const tonHr = monthInvoices.reduce((acc, inv) => acc + inv.energyTonHr, 0);
    const value = monthInvoices.reduce((acc, inv) => acc + inv.total, 0);
    return { label: label.charAt(0).toUpperCase() + label.slice(1), value: Math.round(value), tonHr: Math.round(tonHr), current: idx === 5 };
  });

  const roleLabel = locals[0] ? `${locals[0].code} · ${locals[0].building.name}` : "Sin local asignado";

  return {
    name: user?.name ?? session.user.name ?? "Cliente",
    roleLabel,
    gaugePct: totals.total > 0 ? Math.min(100, Math.round((totals.energy / Math.max(1, totals.energy + 2000)) * 100)) : 0,
    delta: "—",
    deltaLabel: "vs. periodo anterior",
    estimate: asMoney(totals.total),
    months,
    valves,
    valveFilters: valves.map((v) => ({ id: v.name, label: v.name })),
    history: invoiceRows.map((row) => ({ month: row.period, status: row.status, tone: row.tone, receiptLabel: "Ver recibo", valves: {} })),
    invoiceModal,
    invoices: invoiceRows,
    summaryDate: "al corte de hoy",
  };
}

export type OwnerBuildingOption = { id: string; name: string };

export async function getOwnerContext(): Promise<{
  orgId: string | null;
  orgName: string;
  buildings: OwnerBuildingOption[];
  activeBuildingId: string | null;
}> {
  const session = await auth();
  const orgId = session?.user?.orgId ?? null;
  const userBuilding = session?.user?.buildingId ?? null;
  const buildings = orgId
    ? await prisma.building.findMany({ where: { orgId, valves: { some: {} } }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    : userBuilding
      ? await prisma.building.findMany({ where: { id: userBuilding }, select: { id: true, name: true } })
      : [];
  const org = orgId ? await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }) : null;
  const activeBuildingId =
    (userBuilding && buildings.some((b) => b.id === userBuilding) ? userBuilding : null) ?? buildings[0]?.id ?? null;
  return { orgId, orgName: org?.name ?? "Dueño", buildings, activeBuildingId };
}

export async function getOwnerScopedView(buildingId?: string): Promise<OwnerScopedView> {
  const session = await auth();
  const orgId = session?.user?.orgId ?? null;
  const userBuilding = session?.user?.buildingId ?? null;

  // Buildings this owner can see: their whole org, or just their assigned building.
  const orgBuildings = orgId
    ? await prisma.building.findMany({ where: { orgId, valves: { some: {} } }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    : userBuilding
      ? await prisma.building.findMany({ where: { id: userBuilding }, select: { id: true, name: true } })
      : [];

  if (orgBuildings.length === 0) {
    throw new Error("No hay edificios asignados para este dueño.");
  }

  // Active building: requested (if it belongs to the owner) -> user default -> first.
  const allowed = new Set(orgBuildings.map((b) => b.id));
  const activeBuildingId =
    (buildingId && allowed.has(buildingId) ? buildingId : null) ??
    (userBuilding && allowed.has(userBuilding) ? userBuilding : null) ??
    orgBuildings[0].id;

  const ownerUser = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { name: true, role: { select: { name: true } } },
  });

  const building = await prisma.building.findUnique({
    where: { id: activeBuildingId },
    select: {
      id: true,
      name: true,
      logoPath: true,
      logoMime: true,
      floors: {
        include: {
          valves: {
            include: {
              local: {
                include: {
                  client: true,
                },
              },
              readings: {
                select: { ts: true, energyTonHr: true, waterM3: true },
                orderBy: { ts: "desc" },
                take: 2,
              },
            },
          },
        },
      },
      valves: { select: { status: true } },
      locales: { select: { id: true } },
    },
  });

  if (!ownerUser || !building) {
    throw new Error("No se encontró configuración de edificio para el dueño.");
  }

  const valveIds = building.floors.flatMap((floor) => floor.valves.map((valve) => valve.id));
  const coverageRows = valveIds.length
    ? await prisma.reading.groupBy({
      by: ["valveId"],
      where: { valveId: { in: valveIds } },
      _count: { _all: true },
      _min: { ts: true },
      _max: { ts: true },
    })
    : [];
  const coverageByValveId = new Map(
    coverageRows.map((row) => [
      row.valveId,
      {
        readingsCount: row._count._all,
        oldestReading: row._min.ts?.toISOString(),
        newestReading: row._max.ts?.toISOString(),
      },
    ] as const),
  );

  const lastClosedMonth = closedMonthKeys(1)[0];
  const [lastClosedYearRaw, lastClosedMonthRaw] = lastClosedMonth.split("-");
  const lastClosedYear = Number(lastClosedYearRaw);
  const lastClosedMonthNum = Number(lastClosedMonthRaw);
  const estimateStart = monthStartUtcInCancun(lastClosedYear, lastClosedMonthNum);
  const estimateEnd = lastClosedMonthNum === 12
    ? monthStartUtcInCancun(lastClosedYear + 1, 1)
    : monthStartUtcInCancun(lastClosedYear, lastClosedMonthNum + 1);
  const tariffByBuilding = await getEffectiveTariffByBuildingId([building.id], estimateEnd);
  const buildingTariff = tariffByBuilding.get(building.id);
  const usageByValveId = await getTrailingUsageByValveId(valveIds, estimateStart, estimateEnd);

  const localIds = building.locales.map((local) => local.id);
  const computedStatuses = localIds.length
    ? await prisma.computedMonthlyStatus.findMany({
      where: { localId: { in: localIds }, monthKey: lastClosedMonth },
      select: { localId: true, status: true },
    })
    : [];
  const computedStatusByLocalId = new Map(computedStatuses.map((row) => [row.localId, row.status] as const));

  const invoices = await prisma.invoice.findMany({
    where: { local: { buildingId: building.id } },
    include: {
      local: { include: { client: true } },
      period: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const clientUsers = await prisma.client.findMany({
    where: { buildingId: building.id },
    select: {
      id: true,
      org: { select: { contactEmail: true } },
      users: { select: { email: true }, orderBy: { createdAt: "asc" }, take: 1 },
    },
  });
  const recipientByClientId = new Map(
    clientUsers.map((c) => [c.id, resolveRecipient({ users: c.users, org: c.org })] as const),
  );

  const invoiceByLocal = new Map<string, (typeof invoices)[number]>();
  for (const item of invoices) {
    if (!invoiceByLocal.has(item.localId)) invoiceByLocal.set(item.localId, item);
  }

  const floorGroups: OwnerFloorGroup[] = building.floors.map((floor) => {
    const localMap = new Map<string, OwnerLocalRow>();
    const liveDeltaByLocal = new Map<string, { tonHr: number; waterM3: number }>();
    const mtdByLocal = new Map<string, { tonHr: number; waterM3: number; dataValves: number; valves: number }>();

    for (const valve of floor.valves) {
      const localId = valve.local?.id ?? `unassigned:${valve.id}`;
      const invoice = valve.local ? invoiceByLocal.get(valve.local.id) : undefined;
      const hasClient = Boolean(valve.local?.client);
      const referenceStatus = valve.local?.id ? (computedStatusByLocalId.get(valve.local.id) ?? ComputedPaidStatus.PENDIENTE) : ComputedPaidStatus.PENDIENTE;
      const statusLabel = !hasClient
        ? "Sin cliente"
        : referenceStatus === ComputedPaidStatus.PAGADO
          ? "Pagado"
          : "Pendiente de factura";
      const tone: Tone = !hasClient
        ? "neutral"
        : referenceStatus === ComputedPaidStatus.PAGADO
          ? "good"
          : "warn";

      const recipient = valve.local?.client ? recipientByClientId.get(valve.local.client.id) : undefined;
      const coverage = coverageByValveId.get(valve.id) ?? { readingsCount: 0, oldestReading: undefined, newestReading: undefined };
      const current = localMap.get(localId) ?? {
        invoiceId: invoice?.id,
        local: valve.local?.code ?? "Sin asignar",
        client: valve.local?.client?.name ?? "Sin asignar",
        valves: [],
        consumption: invoice ? `${Math.round(invoice.energyTonHr).toLocaleString("en-US")} TON-hr · ${Math.round(invoice.waterM3).toLocaleString("en-US")} m³` : "sin lectura",
        coverageLabel: "Sin historial",
        readingsCount: 0,
        oldestReading: undefined,
        newestReading: undefined,
        amount: invoice ? asMoney(invoice.total) : "—",
        statusLabel,
        tone,
        sendEligible: invoice ? (recipient?.canSend ?? false) : false,
        invoiceModal: invoice
          ? buildInvoiceModalData(invoice)
          : buildEmptyInvoiceModal(
            valve.local?.code ?? "Sin asignar",
            valve.local?.client?.name ?? "Sin asignar",
            { hasClient },
          ),
        estimateLabel: "≈ — (sin datos)",
        estimateAmount: "—",
        estimateStatus: "no_data" as EstimateStatus,
      };

      current.valves.push({
        id: valve.id,
        label: valve.serial,
        status: valve.status,
        commandedState: valve.commandedState,
        lastCommandAt: valve.lastCommandAt?.toISOString(),
        lastCommandResult: valve.lastCommandResult,
        readingsCount: coverage.readingsCount,
        oldestReading: coverage.oldestReading,
        newestReading: coverage.newestReading,
      });
      current.readingsCount += coverage.readingsCount;
      if (coverage.oldestReading && (!current.oldestReading || coverage.oldestReading < current.oldestReading)) {
        current.oldestReading = coverage.oldestReading;
      }
      if (coverage.newestReading && (!current.newestReading || coverage.newestReading > current.newestReading)) {
        current.newestReading = coverage.newestReading;
      }
      current.coverageLabel = asCoverageLabel(current.readingsCount, current.oldestReading);
      localMap.set(localId, current);

      const latest = valve.readings[0];
      const prev = valve.readings[1];
      if (latest && prev) {
        const tonDelta = Math.max(0, latest.energyTonHr - prev.energyTonHr);
        const waterDelta = Math.max(0, latest.waterM3 - prev.waterM3);
        const agg = liveDeltaByLocal.get(localId) ?? { tonHr: 0, waterM3: 0 };
        agg.tonHr += tonDelta;
        agg.waterM3 += waterDelta;
        liveDeltaByLocal.set(localId, agg);
      }

      const recentUsage = usageByValveId.get(valve.id) ?? { tonHr: 0, waterM3: 0, hasData: false };
      const currentMtd = mtdByLocal.get(localId) ?? { tonHr: 0, waterM3: 0, dataValves: 0, valves: 0 };
      currentMtd.valves += 1;
      if (recentUsage.hasData) {
        currentMtd.tonHr += recentUsage.tonHr;
        currentMtd.waterM3 += recentUsage.waterM3;
        currentMtd.dataValves += 1;
      }
      mtdByLocal.set(localId, currentMtd);
    }

    const rows = Array.from(localMap.entries()).map(([localId, row]) => {
      const live = liveDeltaByLocal.get(localId);
      const withConsumption = row.amount !== "—" || !live
        ? row
        : {
          ...row,
          consumption: `Δ últimas 2 lecturas: ${live.tonHr.toFixed(2)} TON-hr · ${live.waterM3.toFixed(2)} m³`,
        };

      if (!buildingTariff) {
        return { ...withConsumption, ...makeEstimateDisplay({ status: "no_tariff" }) };
      }

      const mtd = mtdByLocal.get(localId);
      if (!mtd || mtd.dataValves === 0) {
        return { ...withConsumption, ...makeEstimateDisplay({ status: "no_data" }) };
      }

      const breakdown = computeReferenceChargeFromTariff({
        tonHr: mtd.tonHr,
        tariff: buildingTariff,
      });
      return {
        ...withConsumption,
        consumption: `${mtd.tonHr.toFixed(2)} TON-hr · ${mtd.waterM3.toFixed(2)} m³`,
        ...makeEstimateDisplay({ status: "ok", amount: breakdown.total, breakdown }),
      };
    });
    const totalAmount = rows.reduce((acc, row) => {
      const source = row.estimateStatus === "ok" ? row.estimateAmount : row.amount;
      const val = Number(source.replace(/[$,]/g, ""));
      return Number.isFinite(val) ? acc + val : acc;
    }, 0);

    const statuses = rows.map((row) => row.tone);
    const hasBad = statuses.includes("bad");
    const hasWarn = statuses.includes("warn");
    const hasNeutral = statuses.includes("neutral");
    const hasGood = statuses.includes("good");

    const tone: Tone = hasBad
      ? "bad"
      : (hasWarn || (hasGood && hasNeutral))
        ? "warn"
        : hasNeutral
          ? "neutral"
          : "good";

    const statusLabel = hasBad
      ? "Con vencidos"
      : (hasWarn || (hasGood && hasNeutral))
        ? "Algunos pendientes de factura"
        : hasNeutral
          ? "Sin facturar"
          : "Al corriente";

    return {
      floor: floor.name,
      locales: rows.length,
      valves: floor.valves.length,
      amount: totalAmount > 0 ? asMoney(totalAmount) : "—",
      statusLabel,
      tone,
      rows,
    };
  });

  floorGroups.sort((a, b) => (parseInt(a.floor.replace(/\D/g, ""), 10) || 0) - (parseInt(b.floor.replace(/\D/g, ""), 10) || 0));

  const localCount = building.locales.length;
  const valveCount = building.valves.length;
  const health = building.valves.reduce((acc, valve) => {
    if (valve.status === "OK") acc.ok += 1;
    if (valve.status === "ALERTA") acc.alerta += 1;
    if (valve.status === "ERROR") acc.error += 1;
    if (valve.status === "OFFLINE") acc.offline += 1;
    return acc;
  }, { ok: 0, alerta: 0, error: 0, offline: 0 });

  const monthlyRows = floorGroups.flatMap((group) => group.rows);
  const dueTotal = monthlyRows.reduce((acc, row) => {
    if (row.statusLabel !== "Pendiente de factura" || row.estimateStatus !== "ok") return acc;
    const amount = Number(row.estimateAmount.replace(/[$,]/g, ""));
    return Number.isFinite(amount) ? acc + amount : acc;
  }, 0);
  const paidTotal = monthlyRows.reduce((acc, row) => {
    if (row.statusLabel !== "Pagado" || row.estimateStatus !== "ok") return acc;
    const amount = Number(row.estimateAmount.replace(/[$,]/g, ""));
    return Number.isFinite(amount) ? acc + amount : acc;
  }, 0);
  const overdueTotal = 0;

  const cobranzaRows = floorGroups.flatMap((group) => group.rows.map((row) => ({
    invoiceId: row.invoiceId,
    local: row.local,
    client: row.client,
    floor: group.floor,
    consumption: row.consumption,
    amount: row.amount,
    statusLabel: row.statusLabel,
    tone: row.tone,
    sendEligible: row.sendEligible,
    invoiceModal: row.invoiceModal,
    estimateLabel: row.estimateLabel,
    estimateAmount: row.estimateAmount,
    estimateStatus: row.estimateStatus,
    estimateBreakdown: row.estimateBreakdown,
  })));

  const summaryCounters = invoices.reduce((acc, item) => {
    if (item.status === InvoiceStatus.BORRADOR) acc.borrador += 1;
    if (item.status === InvoiceStatus.GENERADA) acc.generado += 1;
    if (item.status === InvoiceStatus.ENVIADA) acc.enviado += 1;
    if (item.status === InvoiceStatus.PAGADA) acc.pagado += 1;
    return acc;
  }, { borrador: 0, generado: 0, enviado: 0, pagado: 0 });

  const recipients = invoices.map((item) => {
    const recipient = item.local.client ? recipientByClientId.get(item.local.client.id) : undefined;
    return {
      invoiceId: item.id,
      local: item.local.code,
      client: item.local.client?.name ?? "Sin asignar",
      email: recipient?.email ?? "sin-correo",
      amount: asMoney(item.total),
      statusLabel: statusToLabel(item.status),
      sendEligible: recipient?.canSend ?? false,
      recipientSource: recipient?.source ?? "missing",
      sendBlockReason: recipient?.blockReason,
    };
  });

  return {
    ownerName: ownerUser.name,
    ownerRole: ownerUser.role.name,
    buildingName: building.name,
    buildingId: building.id,
    buildingCount: orgBuildings.length,
    buildingLogoUrl: building.logoPath && building.logoMime ? `/api/media/building-logo/${building.id}` : null,
    stats: {
      valves: valveCount,
      floors: building.floors.length,
      locales: localCount,
    },
    kpis: {
      due: asMoney(dueTotal),
      paid: asMoney(paidTotal),
      overdue: asMoney(overdueTotal),
    },
    valveHealth: health,
    floorGroups,
    cobranzaRows,
    recibosSummary: [
      { label: "Borrador", value: summaryCounters.borrador, tone: "neutral" },
      { label: "Generado", value: summaryCounters.generado, tone: "accent" },
      { label: "Enviado", value: summaryCounters.enviado, tone: "warn" },
      { label: "Pagado", value: summaryCounters.pagado, tone: "good" },
    ],
    recipients,
    sendTotals: {
      count: recipients.length,
      amount: asMoney(recipients.reduce((acc, row) => acc + Number(row.amount.replace(/[$,]/g, "")), 0)),
    },
    tenants: Array.from(
      new Map(
        building.floors.flatMap((floor) =>
          floor.valves.map((valve) => {
            const local = valve.local;
            const client = local?.client;
            const key = `${client?.id ?? "none"}:${local?.id ?? valve.id}`;
            return [
              key,
              {
                clientId: client?.id,
                tenant: client?.name ?? "Sin cuenta",
                local: local?.code ?? "Sin asignar",
                valves: [{ id: valve.id, label: valve.serial, status: valve.status }],
                email: client ? (recipientByClientId.get(client.id)?.email ?? "—") : "—",
                accountStatus: client ? "Activa" : "Sin cuenta",
                tone: (client ? "good" : "neutral") as Tone,
                action: client ? "Editar" : "Crear cuenta",
              } as OwnerTenantRow,
            ] as const;
          }),
        ),
      ).values(),
    ),
  };
}


export type OwnerValveHistoryView = {
  valve: {
    id: string;
    serial: string;
    status: ValveStatus;
    buildingId: string;
    buildingName: string;
    floorName: string;
    localCode: string;
    clientName: string;
    lastReportLabel: string;
    commandedState?: "ON" | "OFF" | null;
    lastCommandAt?: string;
    lastCommandResult?: string | null;
    totalReadings: number;
    oldestReading: string;
    newestReading: string;
  };
  monthly: Array<{ id: string; label: string; value: number; tonHr: number; waterM3: number }>;
  recentDaily: Array<{ label: string; tonHr: number; waterM3: number }>;
  hourlyPower: {
    day: string;
    mode: "hourly" | "daily_fallback";
    label: string;
    points: Array<{ hour: string; ton: number | null }>;
  };
  readings: Array<{ ts: string; energyTonHr: number; waterM3: number; powerTon: number; deltaTonHr: number; deltaWaterM3: number }>;
  computedMonthlyHistory: Array<{
    month: string;
    periodLabel: string;
    consumptionTonHr: number;
    waterM3: number;
    computedTotal: number | null;
    computationStatus: "ok" | "no_tariff" | "sin_lecturas";
    paidStatus: ComputedPaidStatus;
    paidAt?: string;
    note?: string | null;
    updatedAt?: string;
  }>;
  historyMeta: {
    localId: string | null;
  };
};

export async function getOwnerValveHistory(valveId: string, day?: string): Promise<OwnerValveHistoryView> {
  const session = await auth();
  const orgId = session?.user?.orgId ?? null;
  const userBuilding = session?.user?.buildingId ?? null;

  const allowedBuildings = orgId
    ? await prisma.building.findMany({ where: { orgId, valves: { some: {} } }, select: { id: true } })
    : userBuilding
      ? await prisma.building.findMany({ where: { id: userBuilding }, select: { id: true } })
      : [];

  if (!allowedBuildings.length) {
    throw new Error("No hay edificios asignados para este dueño.");
  }

  const allowedSet = new Set(allowedBuildings.map((b) => b.id));
  const valve = await prisma.valve.findUnique({
    where: { id: valveId },
    include: {
      building: { select: { id: true, name: true } },
      floor: { select: { name: true } },
      local: { select: { id: true, code: true, client: { select: { name: true } } } },
      readings: { orderBy: { ts: "asc" } },
    },
  });

  if (!valve || !allowedSet.has(valve.buildingId)) {
    throw new Error("Válvula no encontrada o sin acceso.");
  }

  const enriched = valve.readings.map((reading, index) => {
    const prev = index > 0 ? valve.readings[index - 1] : null;
    const rawEnergy = prev ? reading.energyTonHr - prev.energyTonHr : 0;
    const rawWater = prev ? reading.waterM3 - prev.waterM3 : 0;
    return {
      ts: reading.ts,
      energyTonHr: reading.energyTonHr,
      waterM3: reading.waterM3,
      powerTon: reading.powerTon,
      deltaTonHr: Math.max(0, rawEnergy),
      deltaWaterM3: Math.max(0, rawWater),
    };
  });

  const monthlyMap = new Map<string, { tonHr: number; waterM3: number; date: Date }>();
  for (const row of enriched) {
    const key = `${row.ts.getUTCFullYear()}-${String(row.ts.getUTCMonth() + 1).padStart(2, "0")}`;
    const curr = monthlyMap.get(key) ?? {
      tonHr: 0,
      waterM3: 0,
      date: new Date(Date.UTC(row.ts.getUTCFullYear(), row.ts.getUTCMonth(), 1)),
    };
    curr.tonHr += row.deltaTonHr;
    curr.waterM3 += row.deltaWaterM3;
    monthlyMap.set(key, curr);
  }

  const monthlyRows = Array.from(monthlyMap.entries())
    .sort((a, b) => a[1].date.getTime() - b[1].date.getTime())
    .slice(-14)
    .map(([key, value]) => ({
      id: key,
      label: value.date.toLocaleDateString("es-MX", { month: "short", year: "2-digit" }).replace(".", ""),
      tonHr: value.tonHr,
      waterM3: value.waterM3,
    }));

  const maxMonth = monthlyRows.reduce((acc, row) => Math.max(acc, row.tonHr), 0);
  const monthly = monthlyRows.map((row, index) => ({
    id: row.id,
    label: row.label.charAt(0).toUpperCase() + row.label.slice(1),
    tonHr: row.tonHr,
    waterM3: row.waterM3,
    value: maxMonth > 0 ? Math.max(6, Math.round((row.tonHr / maxMonth) * 100)) : (index === monthlyRows.length - 1 ? 6 : 0),
  }));

  const recentDaily = enriched
    .slice(-30)
    .map((row) => ({
      label: row.ts.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit" }),
      tonHr: row.deltaTonHr,
      waterM3: row.deltaWaterM3,
    }))
    .reverse();

  const readings = enriched.slice(-120).reverse().map((row) => ({
    ts: row.ts.toISOString(),
    energyTonHr: row.energyTonHr,
    waterM3: row.waterM3,
    powerTon: row.powerTon,
    deltaTonHr: row.deltaTonHr,
    deltaWaterM3: row.deltaWaterM3,
  }));

  const oldest = valve.readings[0]?.ts ?? null;
  const newest = valve.readings[valve.readings.length - 1]?.ts ?? null;

  const defaultDay = newest ? newest.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  const requestedDay = /^\d{4}-\d{2}-\d{2}$/.test(day ?? "") ? (day as string) : defaultDay;
  const dayStart = `${requestedDay}T00:00:00.000Z`;
  const dayEnd = `${requestedDay}T23:59:59.999Z`;

  let hourlyPoints: Array<{ hour: string; ton: number | null }> = [];
  let hourlyMode: "hourly" | "daily_fallback" = "daily_fallback";
  let hourlyLabel = "Potencia diaria (resolución diaria)";

  if (valve.belimoId) {
    try {
      const points = await getTimeseries(valve.belimoId, ["evcloud.140"], {
        from: dayStart,
        to: dayEnd,
        resolution: "1h",
        aggregation: "last",
      });
      const mapped = points
        .map((point) => {
          const raw = point.values?.["evcloud.140"];
          const ton = typeof raw === "number" ? raw / 3516.853 : null;
          return { hour: new Date(point.ts).toISOString().slice(11, 16), ton };
        })
        .sort((a, b) => a.hour.localeCompare(b.hour));

      if (mapped.length > 0) {
        hourlyPoints = mapped;
        hourlyMode = "hourly";
        hourlyLabel = "Potencia por hora (resolución 1h)";
      }
    } catch {
      // Fall through to honest daily fallback.
    }
  }

  if (hourlyPoints.length === 0) {
    hourlyPoints = enriched
      .filter((row) => row.ts.toISOString().slice(0, 10) === requestedDay)
      .map((row) => ({ hour: row.ts.toISOString().slice(11, 16), ton: row.powerTon }))
      .sort((a, b) => a.hour.localeCompare(b.hour));

    if (hourlyPoints.length === 0 && newest) {
      const latest = enriched[enriched.length - 1];
      hourlyPoints = [{ hour: latest.ts.toISOString().slice(11, 16), ton: latest.powerTon }];
    }
    if (hourlyPoints.length === 0) hourlyPoints = [{ hour: "00:00", ton: null }];
  }

  const localId = valve.local?.id ?? null;
  const monthKeys = closedMonthKeys(14);
  const monthStatusRows = localId
    ? await prisma.computedMonthlyStatus.findMany({
      where: { localId, monthKey: { in: monthKeys } },
      select: { monthKey: true, status: true, paidAt: true, note: true, updatedAt: true },
    })
    : [];
  const monthStatusByKey = new Map(monthStatusRows.map((row) => [row.monthKey, row] as const));

  const localValveIds = localId
    ? (await prisma.valve.findMany({ where: { localId }, select: { id: true } })).map((row) => row.id)
    : [valve.id];

  const tariffByBuildingForHistory = await getEffectiveTariffByBuildingId([valve.building.id], new Date());
  const historyTariff = tariffByBuildingForHistory.get(valve.building.id);

  const computedMonthlyHistory = [] as OwnerValveHistoryView["computedMonthlyHistory"];
  for (const month of monthKeys) {
    const [yearRaw, monthRaw] = month.split("-");
    const year = Number(yearRaw);
    const month1to12 = Number(monthRaw);
    const startBoundary = monthStartUtcInCancun(year, month1to12);
    const endBoundary = month1to12 === 12
      ? monthStartUtcInCancun(year + 1, 1)
      : monthStartUtcInCancun(year, month1to12 + 1);

    const usageByValveId = await getTrailingUsageByValveId(localValveIds, startBoundary, endBoundary);
    let tonHr = 0;
    let waterM3 = 0;
    let hasData = false;
    for (const valveUsage of usageByValveId.values()) {
      tonHr += valveUsage.tonHr;
      waterM3 += valveUsage.waterM3;
      if (valveUsage.hasData) hasData = true;
    }

    const monthDate = new Date(Date.UTC(year, month1to12 - 1, 1));
    const periodLabel = monthDate.toLocaleDateString("es-MX", { month: "long", year: "numeric" });

    const paidMeta = monthStatusByKey.get(month);
    const paidStatus = paidMeta?.status ?? ComputedPaidStatus.PAGADO;

    if (!hasData) {
      computedMonthlyHistory.push({
        month,
        periodLabel,
        consumptionTonHr: 0,
        waterM3: 0,
        computedTotal: null,
        computationStatus: "sin_lecturas",
        paidStatus,
        paidAt: paidMeta?.paidAt?.toISOString(),
        note: paidMeta?.note,
        updatedAt: paidMeta?.updatedAt?.toISOString(),
      });
      continue;
    }

    if (!historyTariff) {
      computedMonthlyHistory.push({
        month,
        periodLabel,
        consumptionTonHr: tonHr,
        waterM3,
        computedTotal: null,
        computationStatus: "no_tariff",
        paidStatus,
        paidAt: paidMeta?.paidAt?.toISOString(),
        note: paidMeta?.note,
        updatedAt: paidMeta?.updatedAt?.toISOString(),
      });
      continue;
    }

    const breakdown = computeReferenceChargeFromTariff({
      tonHr,
      tariff: historyTariff,
    });

    computedMonthlyHistory.push({
      month,
      periodLabel,
      consumptionTonHr: tonHr,
      waterM3,
      computedTotal: breakdown.total,
      computationStatus: "ok",
      paidStatus,
      paidAt: paidMeta?.paidAt?.toISOString(),
      note: paidMeta?.note,
      updatedAt: paidMeta?.updatedAt?.toISOString(),
    });
  }

  return {
    valve: {
      id: valve.id,
      serial: valve.serial,
      status: valve.status,
      buildingId: valve.building.id,
      buildingName: valve.building.name,
      floorName: valve.floor?.name ?? "Sin nivel",
      localCode: valve.local?.code ?? "Sin asignar",
      clientName: valve.local?.client?.name ?? "Sin asignar",
      lastReportLabel: relTime(valve.lastReportAt),
      commandedState: valve.commandedState,
      lastCommandAt: valve.lastCommandAt?.toISOString(),
      lastCommandResult: valve.lastCommandResult,
      totalReadings: valve.readings.length,
      oldestReading: oldest ? oldest.toISOString() : "sin datos",
      newestReading: newest ? newest.toISOString() : "sin datos",
    },
    monthly,
    recentDaily,
    hourlyPower: {
      day: requestedDay,
      mode: hourlyMode,
      label: hourlyLabel,
      points: hourlyPoints,
    },
    readings,
    computedMonthlyHistory,
    historyMeta: {
      localId,
    },
  };
}

function relTime(d: Date | null) {
  if (!d) return "sin datos";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "hace segundos";
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

export type AdminFleetView = {
  kpis: { online: number; total: number; attention: number; buildingsWithIncidents: number; buildings: number };
  pending: Array<{ title: string; tone: Tone; action: string }>;
  belimo: { connected: number; offline: number; lastSync: string; ok: boolean };
  byBuilding: Array<{ building: string; owner: string; valves: number; online: number; tone: Tone; estado: string }>;
};

export async function getAdminFleetView(): Promise<AdminFleetView> {
  const buildings = await prisma.building.findMany({
    select: {
      id: true, name: true,
      org: { select: { name: true, type: true } },
      valves: { select: { status: true, cloudConnected: true, localId: true, lastReportAt: true } },
    },
  });

  const valves = buildings.flatMap((b) => b.valves);
  const total = valves.length;
  const online = valves.filter((v) => v.status === "OK").length;
  const errorCount = valves.filter((v) => v.status === "ERROR").length;
  const alertCount = valves.filter((v) => v.status === "ALERTA").length;
  const offlineCount = valves.filter((v) => v.status === "OFFLINE").length;
  const unassigned = valves.filter((v) => !v.localId).length;
  const lastReport = valves.reduce<Date | null>((acc, v) => (v.lastReportAt && (!acc || v.lastReportAt > acc) ? v.lastReportAt : acc), null);
  const lastSync = relTime(lastReport);
  const recent = lastReport ? Date.now() - lastReport.getTime() < 30 * 60000 : false;

  const byBuilding = buildings
    .filter((b) => b.valves.length)
    .map((b) => {
      const on = b.valves.filter((v) => v.status === "OK").length;
      const tone: Tone = b.valves.some((v) => v.status === "ERROR" || v.status === "OFFLINE")
        ? "bad"
        : b.valves.some((v) => v.status === "ALERTA") ? "warn" : "good";
      return {
        building: b.name,
        owner: b.org && b.org.type === "OWNER" ? b.org.name : "Sin asignar",
        valves: b.valves.length,
        online: on,
        tone,
        estado: tone === "bad" ? "Requiere atención" : tone === "warn" ? "Revisar" : "Operando",
      };
    });

  const pending: AdminFleetView["pending"] = [];
  if (errorCount) pending.push({ title: `${errorCount} válvulas con error`, tone: "bad", action: "/admin/valvulas" });
  if (offlineCount) pending.push({ title: `${offlineCount} válvulas offline`, tone: "neutral", action: "/admin/valvulas" });
  if (unassigned) pending.push({ title: `${unassigned} sin asignar a un local`, tone: "warn", action: "/admin/edificios" });
  pending.push({ title: recent ? "Conexión Belimo al día" : "Belimo sin sincronizar reciente", tone: recent ? "good" : "warn", action: "/admin/config/api-belimo" });

  return {
    kpis: { online, total, attention: errorCount + alertCount + offlineCount, buildingsWithIncidents: byBuilding.filter((b) => b.tone !== "good").length, buildings: byBuilding.length },
    pending,
    belimo: { connected: valves.filter((v) => v.cloudConnected).length, offline: valves.filter((v) => !v.cloudConnected).length, lastSync, ok: recent },
    byBuilding,
  };
}

export type AdminBuildingUsageValveRow = {
  id: string;
  serial: string;
  local: string;
  status: ValveStatus;
  readingsCount: number;
  firstReading: string;
  lastReading: string;
  recentTonHr: number;
  recentWaterM3: number;
} & RowEstimate;

export type AdminBuildingUsageView = {
  buildings: Array<{ id: string; name: string }>;
  activeBuildingId: string;
  activeBuildingName: string;
  monthly: Array<{ id: string; label: string; tonHr: number; waterM3: number; value: number }>;
  coverage: {
    valves: number;
    readings: number;
    firstReading: string;
    lastReading: string;
  };
  valves: AdminBuildingUsageValveRow[];
};

export async function getAdminBuildingUsage(buildingId?: string): Promise<AdminBuildingUsageView> {
  const buildings = await prisma.building.findMany({
    where: { valves: { some: {} } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  if (!buildings.length) {
    throw new Error("No hay edificios con válvulas para mostrar consumo.");
  }

  const allowed = new Set(buildings.map((b) => b.id));
  const activeBuildingId = buildingId && allowed.has(buildingId) ? buildingId : buildings[0].id;
  const activeBuilding = buildings.find((b) => b.id === activeBuildingId)!;

  const estimateEnd = new Date();
  const estimateStart = trailing30dStartUtc(estimateEnd);
  const tariffByBuilding = await getEffectiveTariffByBuildingId([activeBuildingId], estimateEnd);
  const activeTariff = tariffByBuilding.get(activeBuildingId);

  const valves = await prisma.valve.findMany({
    where: { buildingId: activeBuildingId },
    select: {
      id: true,
      serial: true,
      status: true,
      local: { select: { code: true } },
      readings: { select: { ts: true, energyTonHr: true, waterM3: true }, orderBy: { ts: "asc" } },
    },
    orderBy: { serial: "asc" },
  });

  const monthlyMap = new Map<string, { tonHr: number; waterM3: number; date: Date }>();
  let firstReading: Date | null = null;
  let lastReading: Date | null = null;
  let readingsTotal = 0;
  const usageByValveId = await getTrailingUsageByValveId(valves.map((v) => v.id), estimateStart, estimateEnd);

  const valveRows: AdminBuildingUsageValveRow[] = valves.map((valve) => {
    const readings = valve.readings;
    readingsTotal += readings.length;

    const first = readings[0]?.ts ?? null;
    const last = readings[readings.length - 1]?.ts ?? null;
    if (first && (!firstReading || first < firstReading)) firstReading = first;
    if (last && (!lastReading || last > lastReading)) lastReading = last;

    for (let idx = 1; idx < readings.length; idx += 1) {
      const prev = readings[idx - 1];
      const curr = readings[idx];
      const tonDelta = Math.max(0, curr.energyTonHr - prev.energyTonHr);
      const waterDelta = Math.max(0, curr.waterM3 - prev.waterM3);
      const key = `${curr.ts.getUTCFullYear()}-${String(curr.ts.getUTCMonth() + 1).padStart(2, "0")}`;
      const bucket = monthlyMap.get(key) ?? {
        tonHr: 0,
        waterM3: 0,
        date: new Date(Date.UTC(curr.ts.getUTCFullYear(), curr.ts.getUTCMonth(), 1)),
      };
      bucket.tonHr += tonDelta;
      bucket.waterM3 += waterDelta;
      monthlyMap.set(key, bucket);
    }

    const latest = readings[readings.length - 1];
    const previous = readings[readings.length - 2];
    const recentTonHr = latest && previous ? Math.max(0, latest.energyTonHr - previous.energyTonHr) : 0;
    const recentWaterM3 = latest && previous ? Math.max(0, latest.waterM3 - previous.waterM3) : 0;

    const recentUsage = usageByValveId.get(valve.id) ?? { tonHr: 0, waterM3: 0, hasData: false };
    const estimate = !activeTariff
      ? makeEstimateDisplay({ status: "no_tariff" })
      : !recentUsage.hasData
        ? makeEstimateDisplay({ status: "no_data" })
        : (() => {
          const breakdown = computeReferenceChargeFromTariff({
            tonHr: recentUsage.tonHr,
            tariff: activeTariff,
          });
          return makeEstimateDisplay({ status: "ok", amount: breakdown.total, breakdown });
        })();

    return {
      id: valve.id,
      serial: valve.serial,
      local: valve.local?.code ?? "Sin asignar",
      status: valve.status,
      readingsCount: readings.length,
      firstReading: first ? first.toISOString() : "sin datos",
      lastReading: last ? last.toISOString() : "sin datos",
      recentTonHr,
      recentWaterM3,
      ...estimate,
    };
  });

  const monthlyRows = Array.from(monthlyMap.entries())
    .sort((a, b) => a[1].date.getTime() - b[1].date.getTime())
    .slice(-14)
    .map(([id, row]) => ({
      id,
      label: row.date.toLocaleDateString("es-MX", { month: "short", year: "2-digit" }).replace(".", ""),
      tonHr: row.tonHr,
      waterM3: row.waterM3,
    }));

  const maxMonth = monthlyRows.reduce((acc, row) => Math.max(acc, row.tonHr), 0);
  const monthly = monthlyRows.map((row, index) => ({
    id: row.id,
    label: row.label.charAt(0).toUpperCase() + row.label.slice(1),
    tonHr: row.tonHr,
    waterM3: row.waterM3,
    value: maxMonth > 0 ? Math.max(6, Math.round((row.tonHr / maxMonth) * 100)) : (index === monthlyRows.length - 1 ? 6 : 0),
  }));

  return {
    buildings,
    activeBuildingId,
    activeBuildingName: activeBuilding.name,
    monthly,
    coverage: {
      valves: valves.length,
      readings: readingsTotal,
      firstReading: (firstReading as Date | null)?.toISOString() ?? "sin datos",
      lastReading: (lastReading as Date | null)?.toISOString() ?? "sin datos",
    },
    valves: valveRows,
  };
}

export type AdminValveRow = {
  id: string;
  serial: string;
  local: string;
  client: string;
  building: string;
  last: string;
  status: ValveStatus;
  commandedState?: "ON" | "OFF" | null;
  lastCommandAt?: string;
  lastCommandResult?: string | null;
} & RowEstimate;

export async function getAdminValves(): Promise<{
  valves: AdminValveRow[];
  counts: { todos: number; OK: number; ALERTA: number; ERROR: number; OFFLINE: number };
  clients: string[];
  buildings: string[];
}> {
  const valves = await prisma.valve.findMany({
    select: {
      id: true,
      serial: true,
      status: true,
      lastReportAt: true,
      commandedState: true,
      lastCommandAt: true,
      lastCommandResult: true,
      buildingId: true,
      building: { select: { name: true } },
      local: { select: { code: true, client: { select: { name: true } } } },
    },
    orderBy: { lastReportAt: "desc" },
  });

  const estimateEnd = new Date();
  const estimateStart = trailing30dStartUtc(estimateEnd);
  const buildingIds = [...new Set(valves.map((v) => v.buildingId))];
  const tariffByBuildingId = await getEffectiveTariffByBuildingId(buildingIds, estimateEnd);
  const usageByValveId = await getTrailingUsageByValveId(valves.map((v) => v.id), estimateStart, estimateEnd);

  const rows: AdminValveRow[] = valves.map((v) => {
    const tariff = tariffByBuildingId.get(v.buildingId);
    const recentUsage = usageByValveId.get(v.id) ?? { tonHr: 0, waterM3: 0, hasData: false };
    const estimate = !tariff
      ? makeEstimateDisplay({ status: "no_tariff" })
      : !recentUsage.hasData
        ? makeEstimateDisplay({ status: "no_data" })
        : (() => {
          const breakdown = computeReferenceChargeFromTariff({
            tonHr: recentUsage.tonHr,
            tariff,
          });
          return makeEstimateDisplay({ status: "ok", amount: breakdown.total, breakdown });
        })();

    return {
      id: v.id,
      serial: v.serial,
      local: v.local?.code ?? "Sin asignar",
      client: v.local?.client?.name ?? "Sin asignar",
      building: v.building.name,
      last: relTime(v.lastReportAt),
      status: v.status,
      commandedState: v.commandedState,
      lastCommandAt: v.lastCommandAt?.toISOString(),
      lastCommandResult: v.lastCommandResult,
      ...estimate,
    };
  });

  return {
    valves: rows,
    counts: {
      todos: rows.length,
      OK: rows.filter((r) => r.status === "OK").length,
      ALERTA: rows.filter((r) => r.status === "ALERTA").length,
      ERROR: rows.filter((r) => r.status === "ERROR").length,
      OFFLINE: rows.filter((r) => r.status === "OFFLINE").length,
    },
    clients: [...new Set(rows.map((r) => r.client))].sort(),
    buildings: [...new Set(rows.map((r) => r.building))].sort(),
  };
}
