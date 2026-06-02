import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Card, PageHead, Pill, StatusDot } from "@/components/ui/primitives";
import { prisma } from "@/lib/db";

export async function BuildingDetailClient({ id }: { id: string }) {
  const [building, ownerOrgs] = await Promise.all([
    prisma.building.findUnique({
      where: { id },
      include: {
        floors: { include: { valves: true }, orderBy: { name: "asc" } },
        valves: { include: { local: true }, orderBy: { lastReportAt: "desc" } },
        locales: { include: { client: true }, orderBy: { code: "asc" } },
        clients: { include: { _count: { select: { locales: true } } } },
        org: true,
      },
    }),
    prisma.organization.findMany({ where: { type: "OWNER" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  if (!building) notFound();

  return (
    <>
      <Link href="/admin/edificios" className="mb-4 inline-block text-sm font-bold text-accent-ink">‹ Edificios</Link>
      <PageHead title={building.name}>{building.org?.name ?? "Sin dueño asignado"}</PageHead>
      <div className="space-y-4">
        <Card className="p-5">
          <h3 className="text-lg font-bold">Asignar dueño del edificio</h3>
          <form action="/api/admin/link/building-org" method="post" className="mt-3 flex flex-wrap items-center gap-2">
            <input type="hidden" name="buildingId" value={building.id} />
            <input type="hidden" name="redirectTo" value={`/admin/edificios/${building.id}`} />
            <select name="orgId" defaultValue={building.orgId ?? ""} className="rounded-sm border border-border-2 bg-surface px-3 py-2 text-sm">
              <option value="">Sin asignar</option>
              {ownerOrgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
            <Button type="submit">Guardar</Button>
          </form>
        </Card>

        <Card className="p-5">
          <h3 className="text-lg font-bold">Logo del edificio</h3>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div className="h-24 w-24 overflow-hidden rounded-sm border border-border bg-surface-2">
              {building.logoPath && building.logoMime ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/media/building-logo/${building.id}`} alt="Logo del edificio" className="h-full w-full object-contain" />
              ) : (
                <div className="grid h-full place-items-center text-xs text-ink-3">Sin logo</div>
              )}
            </div>
            <form action="/api/buildings/logo" method="post" encType="multipart/form-data" className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="buildingId" value={building.id} />
              <input type="file" name="logo" accept="image/png,image/jpeg,image/svg+xml" required className="text-sm" />
              <Button type="submit" variant="ghost">Subir / reemplazar</Button>
            </form>
            <form action="/api/buildings/logo" method="post">
              <input type="hidden" name="buildingId" value={building.id} />
              <input type="hidden" name="action" value="delete" />
              <Button type="submit" variant="ghost">Quitar logo</Button>
            </form>
          </div>
        </Card>

        <Card>
          <h3 className="p-5 text-lg font-bold">Niveles</h3>
          <table className="tbl">
            <thead><tr><th>Nivel</th><th>Válvulas</th><th>Estado</th></tr></thead>
            <tbody>
              {building.floors.map((floor) => {
                const bad = floor.valves.some((v) => v.status === "ERROR" || v.status === "OFFLINE");
                const warn = floor.valves.some((v) => v.status === "ALERTA");
                const tone = bad ? "bad" : warn ? "warn" : "good";
                return (
                  <tr key={floor.id}>
                    <td className="font-bold">{floor.name}</td>
                    <td>{floor.valves.length}</td>
                    <td><Pill tone={tone}>{bad ? "Requiere atención" : warn ? "Revisar" : "Operando"}</Pill></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <Card>
          <h3 className="p-5 text-lg font-bold">Válvulas (reasignación de piso/local)</h3>
          <table className="tbl">
            <thead><tr><th>Estado</th><th>Serie</th><th>Local</th><th>Tipo</th><th>Asignación</th><th></th></tr></thead>
            <tbody>
              {building.valves.map((valve) => (
                <tr key={valve.id}>
                  <td><StatusDot status={valve.status} /></td>
                  <td className="font-bold">{valve.serial}</td>
                  <td>{valve.local?.code ?? "Sin asignar"}</td>
                  <td>{valve.type ?? "N/D"}</td>
                  <td>
                    <form action="/api/admin/link/valve-placement" method="post" className="flex gap-2">
                      <input type="hidden" name="valveId" value={valve.id} />
                      <input type="hidden" name="redirectTo" value={`/admin/edificios/${building.id}`} />
                      <select name="floorId" defaultValue={valve.floorId ?? ""} className="rounded-sm border border-border-2 bg-surface px-2 py-1 text-xs">
                        <option value="">Sin nivel</option>
                        {building.floors.map((floor) => <option key={floor.id} value={floor.id}>{floor.name}</option>)}
                      </select>
                      <select name="localId" defaultValue={valve.localId ?? ""} className="rounded-sm border border-border-2 bg-surface px-2 py-1 text-xs">
                        <option value="">Sin local</option>
                        {building.locales.map((local) => <option key={local.id} value={local.id}>{local.code}</option>)}
                      </select>
                      <Button type="submit" size="sm" variant="ghost">Guardar</Button>
                    </form>
                  </td>
                  <td><Pill tone={valve.status === "OK" ? "good" : valve.status === "ALERTA" ? "warn" : valve.status === "ERROR" ? "bad" : "neutral"}>{valve.status}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <div className="flex items-center justify-between p-5">
            <h3 className="text-lg font-bold">Locales (asignar cliente)</h3>
          </div>
          <table className="tbl">
            <thead><tr><th>Local</th><th>Cliente actual</th><th>Asignar cliente</th></tr></thead>
            <tbody>
              {building.locales.map((local) => (
                <tr key={local.id}>
                  <td className="font-bold">{local.code}</td>
                  <td>{local.client?.name ?? "Sin asignar"}</td>
                  <td>
                    <form action="/api/admin/link/local-client" method="post" className="flex gap-2">
                      <input type="hidden" name="localId" value={local.id} />
                      <input type="hidden" name="redirectTo" value={`/admin/edificios/${building.id}`} />
                      <select name="clientId" defaultValue={local.clientId ?? ""} className="rounded-sm border border-border-2 bg-surface px-2 py-1 text-xs">
                        <option value="">Sin asignar</option>
                        {building.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                      </select>
                      <Button type="submit" size="sm" variant="ghost">Guardar</Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
