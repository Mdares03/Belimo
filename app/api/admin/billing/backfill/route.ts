import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getTimeseries } from "@/lib/belimo";
import { prisma } from "@/lib/db";

const J_PER_TONHR = 3516.853 * 3600;
const W_PER_TON = 3516.853;

type Body = {
  buildingId?: string;
  valveIds?: string[];
  from?: string;
  to?: string;
  dryRun?: boolean;
};

async function allow(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const header = request.headers.get("x-cron-secret");
  if (cronSecret && header && header === cronSecret) return true;
  const session = await auth();
  return (session?.user?.role ?? "") === "Administrador";
}

export async function POST(request: Request) {
  if (!(await allow(request))) {
    return NextResponse.json({ error: "Sin permisos." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.from || !body.to) return NextResponse.json({ error: "Faltan from/to." }, { status: 400 });

  const valves = await prisma.valve.findMany({
    where: {
      belimoId: { not: null },
      ...(body.buildingId ? { buildingId: body.buildingId } : {}),
      ...(body.valveIds?.length ? { id: { in: body.valveIds } } : {}),
    },
    select: { id: true, serial: true, belimoId: true },
    orderBy: { serial: "asc" },
  });

  const results: Array<{ valveId: string; serial: string; points: number; upserted: number; skipped: number; errors: string[] }> = [];

  for (const valve of valves) {
    const row = { valveId: valve.id, serial: valve.serial, points: 0, upserted: 0, skipped: 0, errors: [] as string[] };
    try {
      const points = await getTimeseries(valve.belimoId!, ["evcloud.200", "evcloudplus.461", "evcloud.140"], {
        from: body.from,
        to: body.to,
        resolution: "1d",
        aggregation: "last",
      });
      row.points = points.length;

      for (const point of points) {
        const ts = new Date(point.ts);
        if (Number.isNaN(ts.getTime())) {
          row.errors.push(`invalid_ts:${point.ts}`);
          continue;
        }
        const dayTs = new Date(Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate()));

        const energyJ = Number(point.values["evcloud.200"] ?? 0);
        const waterM3 = Number(point.values["evcloudplus.461"] ?? 0);
        const powerW = Number(point.values["evcloud.140"] ?? 0);

        const data = {
          valveId: valve.id,
          ts: dayTs,
          energyTonHr: energyJ / J_PER_TONHR,
          waterM3,
          powerTon: powerW / W_PER_TON,
        };

        if (body.dryRun) {
          row.upserted += 1;
          continue;
        }

        const existing = await prisma.reading.findFirst({ where: { valveId: valve.id, ts: dayTs } });
        if (existing) {
          const keepEnergy = Math.max(existing.energyTonHr, data.energyTonHr);
          const keepWater = Math.max(existing.waterM3, data.waterM3);
          const useIncomingPower = data.energyTonHr >= existing.energyTonHr;
          await prisma.reading.update({
            where: { id: existing.id },
            data: {
              energyTonHr: keepEnergy,
              waterM3: keepWater,
              powerTon: useIncomingPower ? data.powerTon : existing.powerTon,
            },
          });
        } else {
          await prisma.reading.create({ data });
        }
        row.upserted += 1;
      }
    } catch (error) {
      row.errors.push(error instanceof Error ? error.message : "unknown_error");
    }
    results.push(row);
  }

  return NextResponse.json({
    dryRun: Boolean(body.dryRun),
    buildingId: body.buildingId ?? null,
    from: body.from,
    to: body.to,
    valves: results.length,
    totals: {
      points: results.reduce((a, b) => a + b.points, 0),
      upserted: results.reduce((a, b) => a + b.upserted, 0),
      errors: results.reduce((a, b) => a + b.errors.length, 0),
    },
    results,
  });
}
