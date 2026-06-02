import Link from "next/link";
import { Ring } from "@/components/charts/ring";
import { Card, PageHead, Pill } from "@/components/ui/primitives";
import { prisma } from "@/lib/db";

export default async function EdificiosPage() {
  const buildings = await prisma.building.findMany({
    include: {
      valves: { select: { status: true } },
      floors: { select: { id: true } },
      locales: { select: { id: true } },
      org: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHead title="Edificios">Salud operativa, conectividad y cobertura de válvulas por edificio.</PageHead>
      <div className="building-grid grid grid-cols-2 gap-4">
        {buildings.map((building) => {
          const total = building.valves.length;
          const online = building.valves.filter((v) => v.status === "OK").length;
          const onlinePct = total > 0 ? Math.round((online / total) * 100) : 0;
          const incidents = building.valves.filter((v) => v.status !== "OK").length;
          return (
            <Link key={building.id} href={`/admin/edificios/${building.id}`}>
              <Card className="card-pad transition hover:-translate-y-0.5 hover:shadow-raised">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold">{building.name}</h2>
                    <p className="text-sm text-ink-2">{building.org?.name ?? "Sin asignar"}</p>
                  </div>
                  <Ring pct={onlinePct} />
                </div>
                <div className="mt-5 grid grid-cols-3 gap-2 text-sm">
                  <div><b>{building.floors.length}</b><br /><span className="text-ink-3">niveles</span></div>
                  <div><b>{building.valves.length}</b><br /><span className="text-ink-3">válvulas</span></div>
                  <div><b>{building.locales.length}</b><br /><span className="text-ink-3">locales</span></div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Pill tone={onlinePct < 80 ? "warn" : "good"}>{onlinePct}% en línea</Pill>
                  <Pill tone={incidents ? "bad" : "neutral"}>{incidents} incidencias</Pill>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
