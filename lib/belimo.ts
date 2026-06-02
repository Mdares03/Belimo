import "server-only";

/**
 * Belimo Cloud Client API v3 — OAuth2 password grant.
 * Docs: https://cloud.belimo.com (support → Documentation).
 * Spec confirms: token=https://id.belimo.com/oauth/token, host=cloud.belimo.com, paths=/api/v3/*.
 *
 * Required env (server only, never in client bundle):
 *   BELIMO_CLIENT_ID, BELIMO_CLIENT_SECRET, BELIMO_USERNAME, BELIMO_PASSWORD
 * Optional env (sane defaults below):
 *   BELIMO_AUDIENCE, BELIMO_SCOPES, BELIMO_TOKEN_URL, BELIMO_API_BASE
 * Datapoint mapping (per dataprofile — find these with inspectDevice()):
 *   BELIMO_DP_ENERGY, BELIMO_DP_WATER, BELIMO_DP_POWER
 * Unit conversion to EVAC units (TON-hr, m³) — set if Belimo native units differ:
 *   BELIMO_ENERGY_TO_TONHR (default 1), BELIMO_WATER_TO_M3 (default 1)
 *   (1 refrigeration ton-hour ≈ 3.517 kWh, so kWh→TON-hr ≈ 0.28435)
 */

const TOKEN_URL = process.env.BELIMO_TOKEN_URL ?? "https://id.belimo.com/oauth/token";
const API_BASE = process.env.BELIMO_API_BASE ?? "https://cloud.belimo.com/api/v3";
const AUDIENCE = process.env.BELIMO_AUDIENCE ?? "https://api.cloud.belimo.com/";
const SCOPES = process.env.BELIMO_SCOPES ?? "public.read offline_access read:dataprofile";

const DP_ENERGY = process.env.BELIMO_DP_ENERGY;
const DP_WATER = process.env.BELIMO_DP_WATER;
const DP_POWER = process.env.BELIMO_DP_POWER;
const ENERGY_FACTOR = Number(process.env.BELIMO_ENERGY_TO_TONHR ?? "1");
const WATER_FACTOR = Number(process.env.BELIMO_WATER_TO_M3 ?? "1");

export function belimoConfigured(): boolean {
  return Boolean(
    process.env.BELIMO_CLIENT_ID &&
      process.env.BELIMO_CLIENT_SECRET &&
      process.env.BELIMO_USERNAME &&
      process.env.BELIMO_PASSWORD,
  );
}

// ---- Types -----------------------------------------------------------------

export type BelimoDevice = {
  id: string; // UUID — map to Valve.belimoId
  productionId?: string;
  displayName?: string;
  serialNumber?: string; // map to Valve.serial
  materialNumber?: string;
  deviceType?: string; // map to Valve.type
  productionDate?: string;
  purpose?: string;
  dataprofile?: { entityId?: string; ref?: string; displayName?: string };
};

export type BelimoData = {
  timestamp: string;
  datapoints: Record<string, { value: number | string | boolean }>;
};

export type BelimoReading = {
  ts: Date;
  energyTonHr: number;
  waterM3: number;
  powerTon: number;
};

export type BelimoTimeseriesPoint = { ts: string; values: Record<string, number | null> };
type BelimoTimeseriesValue = { timestamp: string; value: number | null };
type BelimoTimeseriesSeries = { datapointId: string; aggregation?: string; values?: BelimoTimeseriesValue[] };

// ---- Token cache -----------------------------------------------------------

type TokenCache = { accessToken: string; expiresAt: number; refreshToken?: string };
let cache: TokenCache | null = null;
let issuedAt = 0;

async function fetchToken(body: URLSearchParams): Promise<TokenCache> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Belimo token request failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
  issuedAt = Date.now();
  return {
    accessToken: json.access_token,
    // refresh 60s early
    expiresAt: issuedAt + (json.expires_in - 60) * 1000,
    refreshToken: json.refresh_token,
  };
}

async function getAccessToken(): Promise<string> {
  if (!belimoConfigured()) throw new Error("Belimo env not configured (BELIMO_CLIENT_ID/SECRET/USERNAME/PASSWORD).");
  if (cache && Date.now() < cache.expiresAt) return cache.accessToken;

  const clientId = process.env.BELIMO_CLIENT_ID!;
  const clientSecret = process.env.BELIMO_CLIENT_SECRET!;

  if (cache?.refreshToken) {
    try {
      cache = await fetchToken(
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: cache.refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      );
      return cache.accessToken;
    } catch {
      cache = null; // fall through to password grant
    }
  }

  cache = await fetchToken(
    new URLSearchParams({
      grant_type: "password",
      username: process.env.BELIMO_USERNAME!,
      password: process.env.BELIMO_PASSWORD!,
      client_id: clientId,
      client_secret: clientSecret,
      audience: AUDIENCE,
      scope: SCOPES,
    }),
  );
  return cache.accessToken;
}

// ---- Core fetch ------------------------------------------------------------

async function belimoFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (res.status === 401) {
    cache = null; // token rejected — force re-auth next call
  }
  if (!res.ok) throw new Error(`Belimo ${path} -> ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

// ---- Public API ------------------------------------------------------------

/** List all devices visible to the account. Map these to Valve rows. */
/** List all devices visible to the account, across all pages.
 *  /devices is offset/limit paginated (paging.total reports the full count);
 *  loop until we've collected every device. */
export async function listDevices(): Promise<BelimoDevice[]> {
  const limit = 100;
  const all: BelimoDevice[] = [];
  let offset = 0;
  for (let guard = 0; guard < 100; guard++) {
    const json = await belimoFetch<{
      data?: BelimoDevice[];
      paging?: { total?: number };
    }>(`/devices?limit=${limit}&offset=${offset}`);
    const batch = json.data ?? [];
    all.push(...batch);
    const total = json.paging?.total;
    offset += batch.length;            // advance by what we got, in case limit is capped
    if (batch.length === 0 || (total !== undefined && all.length >= total)) break;
  }
  return all;
}

/** Current datapoint values for one device. */
export async function getDeviceData(deviceId: string): Promise<BelimoData> {
  return belimoFetch<BelimoData>(`/devices/${encodeURIComponent(deviceId)}/data`);
}

/** Historical aggregated series — use for monthly billing totals. */
export async function getTimeseries(
  deviceId: string,
  datapointIds: string[],
  opts: { from?: string; to?: string; resolution?: string; aggregation?: string } = {},
): Promise<BelimoTimeseriesPoint[]> {
  const q = new URLSearchParams({ datapointIds: datapointIds.join(",") });
  if (opts.from) q.set("from", opts.from);
  if (opts.to) q.set("to", opts.to);
  if (opts.resolution) q.set("resolution", opts.resolution);
  if (opts.aggregation) q.set("aggregation", opts.aggregation);

  const json = await belimoFetch<{ data?: BelimoTimeseriesPoint[]; series?: BelimoTimeseriesSeries[] }>(
    `/devices/${encodeURIComponent(deviceId)}/data/history/timeseries?${q}`,
  );

  // Belimo timeseries shape is series[] (per datapoint) with values[{timestamp,value}].
  // Keep backward compatibility if the API ever returns the old data[] shape.
  if (Array.isArray(json.data)) return json.data;

  const byTs = new Map<string, Record<string, number | null>>();
  for (const series of json.series ?? []) {
    const dp = series.datapointId;
    for (const point of series.values ?? []) {
      const row = byTs.get(point.timestamp) ?? {};
      row[dp] = typeof point.value === "number" ? point.value : null;
      byTs.set(point.timestamp, row);
    }
  }

  return Array.from(byTs.entries())
    .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
    .map(([ts, values]) => ({ ts, values }));
}

/** Map raw datapoints to EVAC reading using the configured datapoint IDs. */
// energyvalve3 datapoint map (entire fleet) + refrigeration-ton conversions
const J_PER_TONHR = 3516.853 * 3600; // 12,660,670.8 J = 1 TON-hr
const W_PER_TON = 3516.853;          // 1 refrigeration ton
const DP = {
  coolingEnergyJ: "evcloud.200",
  heatingEnergyJ: "evcloud.210",
  volumeM3: "evcloudplus.461",
  powerW: "evcloud.140",
  health: "default.1",
  healthDesc: "default.2",
} as const;

const num = (data: BelimoData, id: string) => {
  const v = data.datapoints?.[id]?.value;
  return typeof v === "number" ? v : 0;
};

export function toReading(data: BelimoData): BelimoReading {
  return {
    ts: new Date(data.timestamp),
    energyTonHr: num(data, DP.coolingEnergyJ) / J_PER_TONHR, // cumulative
    waterM3: num(data, DP.volumeM3),                         // cumulative, m³
    powerTon: num(data, DP.powerW) / W_PER_TON,              // instantaneous
  };
}

export function toValveStatus(data: BelimoData, lastReport: Date): "OK" | "ALERTA" | "ERROR" | "OFFLINE" {
  if (Date.now() - lastReport.getTime() > 24 * 3_600_000) return "OFFLINE";
  const h = String(data.datapoints?.[DP.health]?.value ?? "").toUpperCase();
  if (h === "ERROR") return "ERROR";
  return h && h !== "OK" ? "ALERTA" : "OK";
}

/**
 * Helper: dump a device's datapoints + dataprofile so you can identify which
 * datapoint ID is thermal energy / water / power, then set BELIMO_DP_* env vars.
 * Run once per device type (dataprofile), e.g. from a script or temporary route.
 */
export type BelimoDatapointDef = { id: string; featureValues?: Record<string, string>; definedBy?: string };

/** Resolve a dataprofile to its datapoint definitions.
 *  Accepts either a full ref path ("/definitions/dataprofiles/energyvalve3/1.2.2")
 *  or an entityId ("energyvalve3/1.2.2"). */
export async function getDataprofile(refOrId: string) {
  const path = refOrId.startsWith("/") ? refOrId : `/definitions/dataprofiles/${refOrId}`;
  return belimoFetch<{ datapoints: BelimoDatapointDef[] }>(path);
}

/** Dump a device's datapoints joined with human names/units, so you can pin
 *  which datapoint is thermal energy / water / power. */
export async function inspectDevice(deviceId: string) {
  const devices = await listDevices();
  const device = devices.find((d) => d.id === deviceId);
  const data = await getDeviceData(deviceId);
  const ref = device?.dataprofile?.ref ?? device?.dataprofile?.entityId;

  const labels: Record<string, { name?: string; description?: string; unit?: string }> = {};
  let profileError: string | undefined;
  if (ref) {
    try {
      const profile = await getDataprofile(ref);
      for (const dp of profile.datapoints ?? []) {
        const fv = dp.featureValues ?? {};
        labels[dp.id] = { name: fv["default.name"], description: fv["default.description"], unit: fv["default.unit"] };
      }
    } catch (e) {
      profileError = e instanceof Error ? e.message : String(e);
    }
  }

  return {
    deviceId,
    profile: ref,
    profileError,
    timestamp: data.timestamp,
    datapoints: Object.entries(data.datapoints ?? {})
      .map(([id, v]) => ({ id, value: v.value, ...labels[id] }))
      .sort((a, b) => (a.description ? 0 : 1) - (b.description ? 0 : 1)), // labeled measurements first
  };
}



/**
 * Actuate a Belimo Energy Valve via the confirmed write seam:
 *   POST /devices/{id}/data  body: {"datapoints": {"evcloud.30": <int>}}
 * The value is the RAW number (not {value:n}). The call queues an async command
 * (HTTP 200, state "PENDING") that the device applies on its next sync — there is
 * no synchronous confirmation, and /data only refreshes on the daily snapshot.
 *
 * evcloud.30 = "Override Control" (rw enum). ON/OFF codes are env-configurable so
 * the open/close mapping can be corrected after watching the physical valve,
 * without a code change. Requires the token to carry the `public.write` scope.
 */
export async function sendActuationCommand(args: { deviceId: string; state: "ON" | "OFF" }) {
  const token = await getAccessToken();
  const datapoint = process.env.BELIMO_ACTUATION_DATAPOINT ?? "evcloud.30";
  const onValue = Number(process.env.BELIMO_ACTUATION_ON_VALUE ?? "1");
  const offValue = Number(process.env.BELIMO_ACTUATION_OFF_VALUE ?? "2");
  const value = args.state === "ON" ? onValue : offValue;

  const endpointPath = `/devices/${encodeURIComponent(args.deviceId)}/data`;
  const body = { datapoints: { [datapoint]: value } };

  const res = await fetch(`${API_BASE}${endpointPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await res.text();
  return {
    ok: res.ok,
    status: res.status,
    endpointPath,
    body: text.slice(0, 3000),
  };
}

/** Raw, never-throwing request used by the admin actuation discovery probe.
 *  Returns status/headers/body so an operator can find the write endpoint
 *  without it being baked into production code paths. */
export async function belimoProbe(args: { method: string; path: string; body?: unknown }) {
  const token = await getAccessToken();
  const method = args.method.toUpperCase();
  const hasBody = args.body !== undefined && args.body !== null && method !== "GET" && method !== "OPTIONS";
  const res = await fetch(`${API_BASE}${args.path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    body: hasBody ? JSON.stringify(args.body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  return {
    status: res.status,
    ok: res.ok,
    allow: res.headers.get("allow"),
    contentType: res.headers.get("content-type"),
    body: text.slice(0, 2000),
  };
}

/** Connection status for the "API Belimo" admin screen. Never throws. */
export async function getBelimoConnectionStatus() {
  if (!belimoConfigured()) {
    return { connected: false, audience: AUDIENCE, reason: "Variables BELIMO_* no configuradas" as const };
  }
  try {
    await getAccessToken();
    const hours = issuedAt ? ((Date.now() - issuedAt) / 3_600_000).toFixed(2) : "0";
    return { connected: true, audience: AUDIENCE, renewedAgo: `${hours} h`, issuedAt: new Date(issuedAt).toISOString() };
  } catch (e) {
    return { connected: false, audience: AUDIENCE, reason: e instanceof Error ? e.message : "Error desconocido" };
  }
}