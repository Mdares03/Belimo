import { ClientDashboard } from "./client-dashboard";
import { getClientScopedView } from "@/lib/scoped-data";

export default async function Page() {
  const data = await getClientScopedView();
  return <ClientDashboard data={data} />;
}
