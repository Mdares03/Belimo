import { Card, PageHead, Pill } from "@/components/ui/primitives";
import { getClientScopedView } from "@/lib/scoped-data";

export default async function FacturasPage() {
  const data = await getClientScopedView();

  return (
    <>
      <PageHead title="Facturas">Historial de estados de cuenta y pagos de tus locales asignados.</PageHead>
      <Card>
        <table className="tbl">
          <thead><tr><th>Periodo</th><th>Local</th><th>Estado</th><th className="r">Total</th></tr></thead>
          <tbody>
            {data.invoices.map((row) => (
              <tr key={row.id}>
                <td>{row.period}</td>
                <td>Local {row.local}</td>
                <td><Pill tone={row.tone}>{row.status}</Pill></td>
                <td className="r num font-bold">{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
