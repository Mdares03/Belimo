import Link from "next/link";
import { notFound } from "next/navigation";
import { MonthlyBars } from "@/components/charts/monthly-bars";
import { PowerLine } from "@/components/charts/power-line";
import { OwnerComputedHistoryTable } from "@/components/owner/owner-computed-history";
import { Card, PageHead, Pill } from "@/components/ui/primitives";
import { getOwnerValveHistory } from "@/lib/scoped-data";

function statusTone(status: string) {
  if (status === "OK") return "good" as const;
  if (status === "ALERTA") return "warn" as const;
  if (status === "ERROR") return "bad" as const;
  return "neutral" as const;
}

export default async function OwnerValveHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ valveId: string }>;
  searchParams: Promise<{ building?: string; day?: string }>;
}) {
  const { valveId } = await params;
  const { building, day } = await searchParams;

  let data;
  try {
    data = await getOwnerValveHistory(valveId, day);
  } catch {
    notFound();
  }

  const backHref = `/owner/valvulas?building=${encodeURIComponent(building ?? data.valve.buildingId)}`;

  return (
    <>
      <PageHead title={`Válvula ${data.valve.serial}`}>
        Historial real desde lecturas acumuladas (backfill + ingestión). Local {data.valve.localCode} · {data.valve.floorName}.
      </PageHead>

      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href={backHref} className="inline-flex items-center justify-center gap-2 rounded-sm border border-border-2 bg-surface px-4 py-2 text-sm font-bold text-ink shadow-card hover:bg-surface-2">
          ← Volver a válvulas
        </Link>
        <Pill tone={statusTone(data.valve.status)}>{data.valve.status}</Pill>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4"><div className="text-xs text-ink-2">Edificio</div><div className="mt-1 font-bold">{data.valve.buildingName}</div></Card>
        <Card className="p-4"><div className="text-xs text-ink-2">Cliente</div><div className="mt-1 font-bold">{data.valve.clientName}</div></Card>
        <Card className="p-4"><div className="text-xs text-ink-2">Lecturas</div><div className="mt-1 font-bold">{data.valve.totalReadings.toLocaleString("en-US")}</div></Card>
        <Card className="p-4"><div className="text-xs text-ink-2">Último reporte</div><div className="mt-1 font-bold">{data.valve.lastReportLabel}</div></Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Card className="card-pad">
          <div className="eyebrow">Tendencia</div>
          <h2 className="mt-1 text-lg font-bold">Últimos 14 meses (TON-hr)</h2>
          {data.monthly.length ? <MonthlyBars data={data.monthly} /> : <p className="mt-3 text-sm text-ink-3">Sin datos mensuales aún.</p>}
        </Card>

        <Card className="card-pad">
          <div className="eyebrow">Cobertura</div>
          <h2 className="mt-1 text-lg font-bold">Rango de historia</h2>
          <div className="mt-4 space-y-2 text-sm">
            <div><span className="text-ink-2">Primera lectura:</span> <b>{data.valve.totalReadings ? new Date(data.valve.oldestReading).toLocaleString("es-MX") : "sin datos"}</b></div>
            <div><span className="text-ink-2">Última lectura:</span> <b>{data.valve.totalReadings ? new Date(data.valve.newestReading).toLocaleString("es-MX") : "sin datos"}</b></div>
          </div>
          <div className="mt-4 rounded-sm border border-border bg-surface-2 p-3">
            <div className="flex items-center gap-2">
              <Pill tone={data.valve.commandedState === "ON" ? "good" : data.valve.commandedState === "OFF" ? "warn" : "neutral"}>
                Comandado: {data.valve.commandedState ?? "—"}
              </Pill>
              <span className="text-xs text-ink-3">{data.valve.lastCommandAt ? new Date(data.valve.lastCommandAt).toLocaleString("es-MX") : "Sin comandos previos"}</span>
            </div>
            <Link href={`/owner/actuadores?building=${encodeURIComponent(building ?? data.valve.buildingId)}`} className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-accent-ink hover:underline">
              Encender / apagar en Actuadores →
            </Link>
          </div>
        </Card>
      </div>

      <Card className="card-pad mt-5">
        <div className="eyebrow">Potencia instantánea</div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{data.hourlyPower.label}</h2>
            <p className="text-sm text-ink-2">Día seleccionado: {new Date(`${data.hourlyPower.day}T00:00:00Z`).toLocaleDateString("es-MX")}</p>
          </div>
          <form method="get" className="flex items-center gap-2">
            <input type="hidden" name="building" value={building ?? data.valve.buildingId} />
            <input
              type="date"
              name="day"
              defaultValue={data.hourlyPower.day}
              className="rounded-sm border border-border-2 bg-surface px-3 py-2 text-sm"
            />
            <button className="rounded-sm border border-border-2 bg-surface px-3 py-2 text-sm font-bold" type="submit">Ver día</button>
          </form>
        </div>
        {data.hourlyPower.mode === "daily_fallback" && (
          <p className="mt-2 text-xs text-warn-ink">No hubo respuesta horaria de Belimo para este día; se muestra resolución diaria real.</p>
        )}
        <PowerLine points={data.hourlyPower.points} />
      </Card>

      <Card className="card-pad mt-5">
        <details>
          <summary className="cursor-pointer list-none">
            <div className="eyebrow">Consumo diario</div>
            <h2 className="mt-1 text-lg font-bold">Últimos 30 días (delta, más reciente primero)</h2>
            <p className="mt-1 text-xs text-ink-3">Click para abrir/cerrar</p>
          </summary>
          <div className="mt-4 overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Día</th>
                  <th className="r">TON-hr</th>
                  <th className="r">m³</th>
                </tr>
              </thead>
              <tbody>
                {data.recentDaily.map((row) => (
                  <tr key={row.label}>
                    <td className="font-bold">{row.label}</td>
                    <td className="r num">{row.tonHr.toFixed(2)}</td>
                    <td className="r num">{row.waterM3.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>

      <Card className="card-pad mt-5">
        <details>
          <summary className="cursor-pointer list-none">
            <div className="eyebrow">Lecturas acumuladas</div>
            <h2 className="mt-1 text-lg font-bold">Últimas 120 muestras</h2>
            <p className="mt-1 text-xs text-ink-3">Click para abrir/cerrar</p>
          </summary>
          <div className="mt-4 overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th className="r">Energía (TON-hr)</th>
                  <th className="r">Δ TON-hr</th>
                  <th className="r">Agua (m³)</th>
                  <th className="r">Δ m³</th>
                  <th className="r">Potencia (TON)</th>
                </tr>
              </thead>
              <tbody>
                {data.readings.map((row) => (
                  <tr key={row.ts}>
                    <td className="font-bold">{new Date(row.ts).toLocaleString("es-MX")}</td>
                    <td className="r num">{row.energyTonHr.toFixed(2)}</td>
                    <td className="r num">{row.deltaTonHr.toFixed(2)}</td>
                    <td className="r num">{row.waterM3.toFixed(2)}</td>
                    <td className="r num">{row.deltaWaterM3.toFixed(2)}</td>
                    <td className="r num">{row.powerTon.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>

      <Card className="card-pad mt-5">
        <div className="eyebrow">Historial de referencia</div>
        <h2 className="mt-1 text-lg font-bold">Cargos por mes</h2>
        {data.computedMonthlyHistory.length ? (
          <OwnerComputedHistoryTable localId={data.historyMeta.localId} rows={data.computedMonthlyHistory} />
        ) : (
          <p className="mt-3 text-sm text-ink-3">No hay meses cerrados disponibles para historial todavía.</p>
        )}
      </Card>
    </>
  );
}
