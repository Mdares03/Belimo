import "server-only";
import { ValveStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { listDevices, getDeviceData, toReading, toValveStatus, type BelimoData } from "@/lib/belimo";

const ENERGY_VALVE = /energyvalve|energy-valve/i;
// metadata.1001 local code: SITE-FLOOR-LOCAL[-VALVE], e.g. "001-003-017-A".
// floor = 2nd group (-> "Nivel N"); local = first three groups; 4th group = valve discriminator.
const LOCAL_CODE = /^(\d{3})-(\d{3})-(\d{3})(?:-(.+))?$/;

const str = (data: BelimoData, id: string) => {
  const v = data.datapoints?.[id]?.value;
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
};

export type IngestSummary = {
  devicesSeen: number;
  valvesUpserted: number;
  readingsWritten: number;
  buildingsCreated: number;
  floorsCreated: number;
  localsCreated: number;
  skipped: number;
  errors: Array<{ deviceId: string; error: string }>;
};

export async function ingestFleet(): Promise<IngestSummary> {
  const summary: IngestSummary = {
    devicesSeen: 0, valvesUpserted: 0, readingsWritten: 0,
    buildingsCreated: 0, floorsCreated: 0, localsCreated: 0, skipped: 0, errors: [],
  };

  const systemOrg = await prisma.organization.findFirst({ where: { type: "SYSTEM" } });
  const buildingCache = new Map<string, string>();
  const floorCache = new Map<string, string>();
  const localCache = new Map<string, string>();

  const devices = await listDevices();
  summary.devicesSeen = devices.length;

  for (const device of devices) {
    const profile = device.dataprofile?.displayName ?? device.dataprofile?.ref ?? "";
    if (!ENERGY_VALVE.test(profile)) { summary.skipped++; continue; }

    try {
      const data = await getDeviceData(device.id);
      const lastReport = new Date(data.timestamp);

      const buildingName = str(data, "metadata.1004") ?? str(data, "metadata.1002") ?? "Sin asignar";
      const rawLocalCode = str(data, "metadata.1001") ?? device.displayName ?? device.serialNumber ?? device.id;
      const codeMatch = LOCAL_CODE.exec(rawLocalCode);
      const floorName = codeMatch ? `Nivel ${parseInt(codeMatch[2], 10)}` : null;
      const localCode = codeMatch ? `${codeMatch[1]}-${codeMatch[2]}-${codeMatch[3]}` : rawLocalCode;

      let buildingId = buildingCache.get(buildingName);
      if (!buildingId) {
        const existing = await prisma.building.findFirst({ where: { name: buildingName } });
        buildingId = existing?.id ?? (await prisma.building.create({
          data: { name: buildingName, project: str(data, "metadata.1002"), city: str(data, "metainfo.100"), orgId: systemOrg?.id },
        })).id;
        if (!existing) summary.buildingsCreated++;
        buildingCache.set(buildingName, buildingId);
      }

      // Floor from the 2nd code group; null when the code isn't a NID-style address.
      let floorId: string | null = null;
      if (floorName) {
        const floorKey = `${buildingId}|${floorName}`;
        let fid = floorCache.get(floorKey);
        if (!fid) {
          const existing = await prisma.floor.findFirst({ where: { buildingId, name: floorName } });
          fid = existing?.id ?? (await prisma.floor.create({ data: { buildingId, name: floorName } })).id;
          if (!existing) summary.floorsCreated++;
          floorCache.set(floorKey, fid);
        }
        floorId = fid;
      }

      const localKey = `${buildingId}|${localCode}`;
      let localId = localCache.get(localKey);
      if (!localId) {
        const existing = await prisma.local.findFirst({ where: { buildingId, code: localCode } });
        localId = existing?.id ?? (await prisma.local.create({ data: { buildingId, code: localCode } })).id;
        if (!existing) summary.localsCreated++;
        localCache.set(localKey, localId);
      }

      const status = toValveStatus(data, lastReport) as ValveStatus;

      const valve = await prisma.valve.upsert({
        where: { belimoId: device.id },
        create: {
          belimoId: device.id,
          serial: device.serialNumber ?? device.id,
          type: device.deviceType,
          description: device.displayName,
          buildingId,
          floorId,
          localId,
          status,
          cloudConnected: status !== "OFFLINE",
          lastReportAt: lastReport,
        },
        update: {
          serial: device.serialNumber ?? undefined,
          type: device.deviceType,
          description: device.displayName,
          floorId,
          localId,
          status,
          cloudConnected: status !== "OFFLINE",
          lastReportAt: lastReport,
        },
      });
      summary.valvesUpserted++;

      const r = toReading(data);
      const dayTs = new Date(Date.UTC(r.ts.getUTCFullYear(), r.ts.getUTCMonth(), r.ts.getUTCDate()));
      const existing = await prisma.reading.findFirst({ where: { valveId: valve.id, ts: dayTs } });
      if (!existing) {
        await prisma.reading.create({
          data: { valveId: valve.id, ts: dayTs, energyTonHr: r.energyTonHr, waterM3: r.waterM3, powerTon: r.powerTon },
        });
      } else {
        const keepEnergy = Math.max(existing.energyTonHr, r.energyTonHr);
        const keepWater = Math.max(existing.waterM3, r.waterM3);
        const useIncomingPower = r.energyTonHr >= existing.energyTonHr;
        await prisma.reading.update({
          where: { id: existing.id },
          data: {
            energyTonHr: keepEnergy,
            waterM3: keepWater,
            powerTon: useIncomingPower ? r.powerTon : existing.powerTon,
          },
        });
      }
      summary.readingsWritten++;
    } catch (e) {
      summary.errors.push({ deviceId: device.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return summary;
}
