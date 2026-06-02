import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '@/lib/db';

export type IngestHealthBuildingRow = {
  name: string;
  lastReadingIso: string | null;
  stale: boolean;
};

export type IngestHealthSummary = {
  logPath: string;
  staleThresholdHours: number;
  attempts: {
    lastAttemptIso: string | null;
    lastAttemptStatus: 'ok' | 'fail' | 'unknown';
    lastSuccessIso: string | null;
    tail: string[];
  };
  readings: {
    nowIso: string;
    buildings: IngestHealthBuildingRow[];
  };
};

function getLogPath() {
  return process.env.INGEST_LOG_PATH || path.join(process.cwd(), 'ingest.log');
}

function parseLine(line: string): { ts: string | null; status: 'ok' | 'fail' | 'unknown' } {
  const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[^\s]+)/);
  const statusMatch = line.match(/status=(ok|fail)/);
  return {
    ts: tsMatch?.[1] ?? null,
    status: (statusMatch?.[1] as 'ok' | 'fail' | undefined) ?? 'unknown',
  };
}

export async function getIngestHealthSummary(): Promise<IngestHealthSummary> {
  const logPath = getLogPath();
  const staleThresholdHours = Number(process.env.INGEST_STALE_THRESHOLD_HOURS ?? '36');
  const staleMs = staleThresholdHours * 3600 * 1000;

  const lines = fs.existsSync(logPath)
    ? fs
        .readFileSync(logPath, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    : [];

  const tail = lines.slice(-30);
  const lastLine = tail[tail.length - 1] ?? null;
  const lastParsed = lastLine ? parseLine(lastLine) : { ts: null, status: 'unknown' as const };

  let lastSuccessIso: string | null = null;
  for (let idx = lines.length - 1; idx >= 0; idx -= 1) {
    const parsed = parseLine(lines[idx]);
    if (parsed.status === 'ok' && parsed.ts) {
      lastSuccessIso = parsed.ts;
      break;
    }
  }

  const rows = (await prisma.$queryRawUnsafe(
    'SELECT b.name, max(r.ts) AS "lastReadingIso" FROM "Reading" r JOIN "Valve" v ON v.id=r."valveId" JOIN "Building" b ON b.id=v."buildingId" GROUP BY b.name ORDER BY b.name ASC',
  )) as Array<{ name: string; lastReadingIso: Date | null }>;

  const now = Date.now();
  const buildings = rows.map((row) => {
    const iso = row.lastReadingIso ? new Date(row.lastReadingIso).toISOString() : null;
    const stale = !iso || now - new Date(iso).getTime() > staleMs;
    return { name: row.name, lastReadingIso: iso, stale };
  });

  return {
    logPath,
    staleThresholdHours,
    attempts: {
      lastAttemptIso: lastParsed.ts,
      lastAttemptStatus: lastParsed.status,
      lastSuccessIso,
      tail,
    },
    readings: {
      nowIso: new Date().toISOString(),
      buildings,
    },
  };
}
