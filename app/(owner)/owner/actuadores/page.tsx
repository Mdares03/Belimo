import { ActuatorPanel, type ActuatorValve } from "@/components/actuation/actuator-panel";
import { PageHead } from "@/components/ui/primitives";
import { actuationAllowlist } from "@/lib/actuation-auth";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export default async function OwnerActuadoresPage() {
  const session = await auth();
  const orgId = session?.user?.orgId ?? null;

  const buildings = orgId
    ? await prisma.building.findMany({ where: { orgId }, select: { id: true } })
    : [];
  const buildingIds = buildings.map((b) => b.id);

  const allow = actuationAllowlist();
  const valves = buildingIds.length
    ? await prisma.valve.findMany({
        where: { buildingId: { in: buildingIds } },
        select: {
          id: true, serial: true, belimoId: true, commandedState: true, lastCommandAt: true, lastCommandResult: true,
          building: { select: { name: true } }, floor: { select: { name: true } }, local: { select: { code: true } },
        },
        orderBy: { serial: "asc" },
      })
    : [];

  const rows: ActuatorValve[] = valves.map((v) => ({
    id: v.id,
    serial: v.serial,
    location: [v.floor?.name, v.local?.code].filter(Boolean).join(" · ") || "Sin ubicación",
    buildingName: v.building.name,
    commandedState: v.commandedState ?? null,
    lastCommandAt: v.lastCommandAt ? v.lastCommandAt.toISOString() : null,
    lastCommandResult: v.lastCommandResult ?? null,
    actuatable: !!v.belimoId && allow.has(v.belimoId),
  }));

  return (
    <>
      <PageHead title="Actuadores">
        Encendido y apagado de válvulas físicas. Controla equipo de climatización real: requiere re-ingresar tu contraseña y está limitado a las válvulas habilitadas.
      </PageHead>
      <ActuatorPanel valves={rows} />
    </>
  );
}
