import { getAdminValves } from "@/lib/scoped-data";
import { ValvulasClient } from "./valvulas-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await getAdminValves();
  return <ValvulasClient valves={data.valves} counts={data.counts} clients={data.clients} buildings={data.buildings} />;
}
