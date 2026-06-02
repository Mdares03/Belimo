import { OwnerValvulas } from "@/components/owner/owner-valvulas";
import { getOwnerScopedView } from "@/lib/scoped-data";

export default async function Page({ searchParams }: { searchParams: Promise<{ building?: string }> }) {
  const { building } = await searchParams;
  const data = await getOwnerScopedView(building);
  return <OwnerValvulas data={data} />;
}
