import { OwnerCobranza } from "@/components/owner/owner-cobranza";
import { getOwnerScopedView } from "@/lib/scoped-data";

export default async function Page({ searchParams }: { searchParams: Promise<{ building?: string }> }) {
  const { building } = await searchParams;
  const data = await getOwnerScopedView(building);
  return <OwnerCobranza data={data} />;
}
