import Link from "next/link";
import { MonthlyBars } from "@/components/charts/monthly-bars";
import { Card, PageHead, Pill } from "@/components/ui/primitives";
import { getAdminBuildingUsage } from "@/lib/scoped-data";

export const dynamic = "force-dynamic";

function statusTone(status: string) {
  if (status === "OK") return "good" as const;
  if (status === "ALERTA") return "warn" as const;
  if (status === "ERROR") return "bad" as const;
  return "neutral" as const;
}

export default async function AdminUsoPage({
  searchParams,
}: {
  searchParams: Promise<{ building?: string }>;
}) {
  const { building } = await searchParams;
  const view = await getAdminBuildingUsage(building);

  return (
    <>
      <PageHead title="Uso por edificio">
        Cobertura de datos y consumo físico (TON-hr / m³) sobre todas las válvulas del edificio, sin depender de clientes o facturas.
      </PageHead>

      <Card className="card-pad">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[.08em] text-ink-3">Edificio</span>
          {view.buildings.map((item) => (
            <Link
              key={item.id}
              href={`/admin/uso?building=${encodeURIComponent(item.id)}`}
              className={item.id === view.activeBuildingId
                ? "rounded-full bg-accent px-3 py-1 text-xs font-bold text-white"
                : "rounded-full border border-border bg-surface px-3 py-1 text-xs font-bold text-ink-2"}
            >
              {item.name}
            </Link>
          ))}
        </div>
      </Card>

      <div className="kpi-grid mt-5 grid grid-cols-3 gap-4">
        <Card className="p-5"><div className="text-xs font-semibold text-ink-2">Válvulas</div><div className="num mt-2 text-[32px] font-extrabold text-ink">{view.coverage.valves}</div></Card>
        <Card className="p-5"><div className="text-xs font-semibold text-ink-2">Lecturas</div><div className="num mt-2 text-[32px] font-extrabold text-good-ink">{view.coverage.readings.toLocaleString("en-US")}</div></Card>
        <Card className="p-5"><div className="text-xs font-semibold text-ink-2">Cobertura</div><div className="mt-2 text-sm font-bold text-ink">{view.coverage.firstReading === "sin datos" ? "Sin historial" : `${new Date(view.coverage.firstReading).toLocaleDateString("es-MX")} → ${new Date(view.coverage.lastReading).toLocaleDateString("es-MX")}`}</div></Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Card className="card-pad">
          <div className="eyebrow">Consumo agregado</div>
          <h2 className="mt-1 text-lg font-bold">{view.activeBuildingName} · Últimos 14 meses (TON-hr)</h2>
          {view.monthly.length ? <MonthlyBars data={view.monthly} /> : <p className="mt-3 text-sm text-ink-3">Sin datos mensuales aún.</p>}
        </Card>

        <Card className="card-pad">
          <div className="eyebrow">Control de calidad</div>
          <h2 className="mt-1 text-lg font-bold">Meses recientes</h2>
          <div className="mt-4 space-y-2 text-sm">
            {view.monthly.slice(-5).map((row) => (
              <div key={row.id} className="flex items-center justify-between rounded-sm border border-border bg-surface-2 px-3 py-2">
                <div className="font-bold">{row.label}</div>
                <div className="num text-ink-2">{row.tonHr.toFixed(2)} TON-hr · {row.waterM3.toFixed(2)} m³</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <div className="p-5"><h3 className="text-lg font-bold">Cobertura por válvula</h3></div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Serie</th>
              <th>Local</th>
              <th>Estado</th>
              <th className="r">Lecturas</th>
              <th>Primera</th>
              <th>Última</th>
              <th className="r">Δ últimas 2 lecturas</th>
              <th>Estimado MTD</th>
            </tr>
          </thead>
          <tbody>
            {view.valves.map((valve) => (
              <tr key={valve.id}>
                <td className="font-bold">{valve.serial}</td>
                <td>{valve.local}</td>
                <td><Pill tone={statusTone(valve.status)}>{valve.status}</Pill></td>
                <td className="r num">{valve.readingsCount.toLocaleString("en-US")}</td>
                <td>{valve.firstReading === "sin datos" ? "sin datos" : new Date(valve.firstReading).toLocaleDateString("es-MX")}</td>
                <td>{valve.lastReading === "sin datos" ? "sin datos" : new Date(valve.lastReading).toLocaleDateString("es-MX")}</td>
                <td className="r num">{valve.recentTonHr.toFixed(2)} TON-hr · {valve.recentWaterM3.toFixed(2)} m³</td>
                <td className="text-xs text-ink-2">
                  <div className="num font-semibold">{valve.estimateAmount}</div>
                  <div className="mt-1 text-ink-3">{valve.estimateLabel}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
