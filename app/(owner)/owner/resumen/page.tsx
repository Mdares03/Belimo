import { OwnerResumen } from "@/components/owner/owner-resumen";
import { getOwnerScopedView } from "@/lib/scoped-data";

export default async function Page({ searchParams }: { searchParams: Promise<{ building?: string }> }) {
  const { building } = await searchParams;
  const data = await getOwnerScopedView(building);
  return <OwnerResumen data={data} />;
}
