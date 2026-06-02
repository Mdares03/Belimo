import Link from "next/link";
import { BuildingLogoManager } from "@/components/owner/building-logo-manager";
import { Card, PageHead } from "@/components/ui/primitives";
import { getOwnerScopedView } from "@/lib/scoped-data";

export default async function OwnerConfiguracionPage({
  searchParams,
}: {
  searchParams: Promise<{ building?: string }>;
}) {
  const { building } = await searchParams;
  const data = await getOwnerScopedView(building);

  return (
    <>
      <PageHead title="Ajustes">
        Configuración del edificio: imagen para recibos/correo y datos de inquilinos. {data.buildingName}.
      </PageHead>

      <Card className="card-pad">
        <h3 className="text-lg font-bold">Logo del edificio (PDF y correo)</h3>
        <p className="mt-1 text-sm text-ink-2">Aparece en el encabezado de los recibos PDF y los correos a inquilinos.</p>
        <div className="mt-4">
          <BuildingLogoManager buildingId={data.buildingId} logoUrl={data.buildingLogoUrl} />
        </div>
      </Card>

      <Card className="card-pad mt-5">
        <h3 className="text-lg font-bold">Inquilinos y correos</h3>
        <p className="mt-1 text-sm text-ink-2">Administra los correos de los inquilinos (destinatario de los recibos) desde la sección Inquilinos.</p>
        <Link href={`/owner/inquilinos${building ? `?building=${encodeURIComponent(building)}` : ""}`} className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-accent-ink hover:underline">
          Ir a Inquilinos →
        </Link>
      </Card>
    </>
  );
}
