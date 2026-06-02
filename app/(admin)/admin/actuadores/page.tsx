import { ActuatorPanel, type ActuatorValve } from "@/components/actuation/actuator-panel";
import { ActuationProbe } from "@/components/actuation/actuation-probe";
import { PageHead } from "@/components/ui/primitives";
import { actuationAllowlist } from "@/lib/actuation-auth";
import { prisma } from "@/lib/db";

export default async function AdminActuadoresPage() {
  const allow = actuationAllowlist();
  const valves = await prisma.valve.findMany({
    select: {
      id: true, serial: true, belimoId: true, commandedState: true, lastCommandAt: true, lastCommandResult: true,
      building: { select: { name: true } }, floor: { select: { name: true } }, local: { select: { code: true } },
    },
    orderBy: [{ building: { name: "asc" } }, { serial: "asc" }],
  });

  // Allowlisted valves first so the test/dummy valve is immediately visible.
  const rows: ActuatorValve[] = valves
    .map((v) => ({
      id: v.id,
      serial: v.serial,
      location: [v.floor?.name, v.local?.code].filter(Boolean).join(" · ") || "Sin ubicación",
      buildingName: v.building.name,
      commandedState: v.commandedState ?? null,
      lastCommandAt: v.lastCommandAt ? v.lastCommandAt.toISOString() : null,
      lastCommandResult: v.lastCommandResult ?? null,
      actuatable: !!v.belimoId && allow.has(v.belimoId),
    }))
    .sort((a, b) => Number(b.actuatable) - Number(a.actuatable));

  const dummyId = process.env.BELIMO_DUMMY_DEVICE_ID?.trim();
  const dummySerial = dummyId ? (valves.find((v) => v.belimoId === dummyId)?.serial ?? null) : null;

  return (
    <>
      <PageHead title="Actuadores">
        Encendido y apagado de válvulas físicas en toda la flota. Controla equipo real: requiere re-ingresar tu contraseña y está limitado a las válvulas en la allowlist ({allow.size}).
      </PageHead>
      <ActuatorPanel valves={rows} />
      <ActuationProbe dummySerial={dummySerial} />
    </>
  );
}
