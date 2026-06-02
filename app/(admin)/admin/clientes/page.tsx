import { Avatar, Button, Card, Input, PageHead, Pill } from "@/components/ui/primitives";
import { prisma } from "@/lib/db";

export default async function ClientesPage() {
  const clients = await prisma.client.findMany({
    include: {
      building: true,
      locales: { include: { valves: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHead title="Clientes">Catálogo de dueños de edificio y estado operativo de su flota.</PageHead>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 p-5"><Input placeholder="Buscar cliente" className="max-w-[320px]" /><Button>+ Nuevo cliente</Button></div>
        <table className="tbl">
          <thead><tr><th>Cliente</th><th>Edificio</th><th>Locales</th><th>Válvulas</th><th>En línea</th><th>Estado</th></tr></thead>
          <tbody>
            {clients.map((client) => {
              const valveCount = client.locales.reduce((acc, local) => acc + local.valves.length, 0);
              const online = client.locales.reduce((acc, local) => acc + local.valves.filter((v) => v.status === "OK").length, 0);
              const tone = online === valveCount ? "good" : online === 0 ? "bad" : "warn";
              return (
                <tr key={client.id}>
                  <td><div className="flex items-center gap-3"><Avatar name={client.name} /><div><b>{client.name}</b><br /><span className="text-xs text-ink-3">{client.commercialName ?? "—"}</span></div></div></td>
                  <td>{client.building?.name ?? "Sin edificio"}</td>
                  <td>{client.locales.length}</td>
                  <td>{valveCount}</td>
                  <td className="num font-bold">{online} / {valveCount}</td>
                  <td><Pill tone={tone}>{tone === "good" ? "Operando" : tone === "bad" ? "Sin conexión" : "Requiere atención"}</Pill></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
