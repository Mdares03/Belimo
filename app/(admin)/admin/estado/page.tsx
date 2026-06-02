import Link from "next/link";
import { Card, PageHead, Pill } from "@/components/ui/primitives";
import { getAdminFleetView } from "@/lib/scoped-data";

export const dynamic = "force-dynamic";

export default async function EstadoPage() {
  const view = await getAdminFleetView();
  return (
    <>
      <PageHead title="Estado de la flota">Monitorea salud operativa, incidencias y conexión Belimo en tiempo real.</PageHead>
      <Card className="card-pad border-accent-soft bg-gradient-to-br from-white to-accent-soft-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="eyebrow">Atención prioritaria</div>
            <h2 className="mt-1 text-xl font-bold">{view.kpis.attention} válvulas requieren tu atención</h2>
            <div className="mt-1 text-sm text-ink-2">sincronizado {view.belimo.lastSync}</div>
          </div>
          <Link href="/admin/valvulas" className="rounded-sm bg-accent px-4 py-2 text-sm font-bold text-white">Ver válvulas</Link>
        </div>
      </Card>

      <div className="kpi-grid mt-5 grid grid-cols-3 gap-4">
        <Card className="p-5"><div className="text-xs font-semibold text-ink-2">Válvulas en línea</div><div className="num mt-2 text-[32px] font-extrabold text-good-ink">{view.kpis.online} / {view.kpis.total}</div></Card>
        <Card className="p-5"><div className="text-xs font-semibold text-ink-2">Requieren atención</div><div className="num mt-2 text-[32px] font-extrabold text-warn-ink">{view.kpis.attention}</div></Card>
        <Card className="p-5"><div className="text-xs font-semibold text-ink-2">Edificios con incidencias</div><div className="num mt-2 text-[32px] font-extrabold text-bad-ink">{view.kpis.buildingsWithIncidents} / {view.kpis.buildings}</div></Card>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-lg font-bold">Pendientes</h3>
          <div className="mt-3 space-y-2">
            {view.pending.map((item) => (
              <div key={item.title} className="flex items-center justify-between rounded-sm border border-border bg-surface-2 px-3 py-2.5">
                <Pill tone={item.tone}>{item.title}</Pill>
                <Link href={item.action} className="text-sm font-bold text-accent-ink">Ir</Link>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-lg font-bold">Conexión Belimo</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-sm border border-border bg-surface-2 p-3"><div className="text-ink-3">Cloud conectado</div><div className="num mt-1 text-xl font-extrabold text-good-ink">{view.belimo.connected}</div></div>
            <div className="rounded-sm border border-border bg-surface-2 p-3"><div className="text-ink-3">Cloud offline</div><div className="num mt-1 text-xl font-extrabold text-bad-ink">{view.belimo.offline}</div></div>
          </div>
          <div className="mt-3"><Pill tone={view.belimo.ok ? "good" : "warn"}>Última sincronización: {view.belimo.lastSync}</Pill></div>
        </Card>
      </div>

      <Card className="mt-5">
        <div className="p-5"><h3 className="text-lg font-bold">Por edificio</h3></div>
        <table className="tbl">
          <thead><tr><th>Edificio</th><th>Dueño</th><th>Válvulas</th><th>En línea</th><th>Estado</th></tr></thead>
          <tbody>
            {view.byBuilding.map((item) => (
              <tr key={item.building}>
                <td className="font-bold">{item.building}</td>
                <td>{item.owner}</td>
                <td>{item.valves}</td>
                <td>{item.online}/{item.valves}</td>
                <td><Pill tone={item.tone}>{item.estado}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
