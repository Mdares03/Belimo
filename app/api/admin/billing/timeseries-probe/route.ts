import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getTimeseries } from "@/lib/belimo";

const DEFAULT_DPS = ["evcloud.200", "evcloudplus.461", "evcloud.140"];

async function allow(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const header = request.headers.get("x-cron-secret");
  if (cronSecret && header && header === cronSecret) return true;
  const session = await auth();
  return (session?.user?.role ?? "") === "Administrador";
}

export async function GET(request: Request) {
  if (!(await allow(request))) {
    return NextResponse.json({ error: "Sin permisos." }, { status: 403 });
  }

  const url = new URL(request.url);
  const deviceId = url.searchParams.get("deviceId");
  if (!deviceId) return NextResponse.json({ error: "Falta deviceId." }, { status: 400 });

  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const resolution = url.searchParams.get("resolution") ?? "1d";
  const aggregation = url.searchParams.get("aggregation") ?? "last";
  const datapoints = (url.searchParams.get("datapoints")?.split(",").map((x) => x.trim()).filter(Boolean)) ?? DEFAULT_DPS;

  const data = await getTimeseries(deviceId, datapoints, { from, to, resolution, aggregation });
  return NextResponse.json({ deviceId, datapoints, from, to, resolution, aggregation, count: data.length, sample: data.slice(0, 10), raw: data });
}
