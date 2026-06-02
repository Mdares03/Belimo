"use client";

import { useMemo, useState } from "react";
import type { InvoiceModalData, OwnerScopedView } from "@/lib/scoped-data";
import { Button, Card, PageHead, Pill, Select } from "@/components/ui/primitives";
import { InvoiceModal } from "@/components/ui/invoice-modal";

export function OwnerCobranza({ data }: { data: OwnerScopedView }) {
  const [status, setStatus] = useState("");
  const [floor, setFloor] = useState("");
  const [open, setOpen] = useState(false);
  const [activeInvoice, setActiveInvoice] = useState<InvoiceModalData | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => data.cobranzaRows.filter((row) => (!status || row.statusLabel === status) && (!floor || row.floor === floor)), [data.cobranzaRows, floor, status]);
  const floors = Array.from(new Set(data.cobranzaRows.map((row) => row.floor)));
  const statuses = Array.from(new Set(data.cobranzaRows.map((row) => row.statusLabel)));


  async function sendInvoice(invoiceId: string | undefined) {
    if (!invoiceId) return;
    const response = await fetch('/api/owner/invoices/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ invoiceId }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload?.error ?? 'No se pudo enviar el recibo.');
      return;
    }
    location.reload();
  }

  async function invoiceAction(invoiceId: string | undefined, action: "mark_paid" | "mark_overdue") {
    if (!invoiceId) return;
    const response = await fetch("/api/owner/invoices/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ invoiceId, action }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload?.error ?? "No se pudo actualizar el estado.");
      return;
    }
    location.reload();
  }

  return (
    <>
      <PageHead title="Consumo y cobro">Seguimiento por local, consumo del mes y estado de cuenta.</PageHead>
      <div className="kpi-grid grid grid-cols-3 gap-4">
        <Card className="p-5"><div className="text-xs font-semibold text-ink-2">Total del mes</div><div className="num mt-2 text-[32px] font-extrabold text-accent-ink">{data.kpis.due}</div></Card>
        <Card className="p-5"><div className="text-xs font-semibold text-ink-2">Cobrado</div><div className="num mt-2 text-[32px] font-extrabold text-good-ink">{data.kpis.paid}</div></Card>
        <Card className="p-5"><div className="text-xs font-semibold text-ink-2">Vencido</div><div className="num mt-2 text-[32px] font-extrabold text-warn-ink">{data.kpis.overdue}</div></Card>
      </div>
      {error && <p className="mt-4 rounded-sm border border-bad-soft bg-bad-soft/30 p-3 text-sm text-bad-ink">{error}</p>}
      <Card className="mt-6">
        <div className="flex flex-wrap items-center gap-3 p-5">
          <Select value={floor} onChange={(event) => setFloor(event.target.value)}>
            <option value="">Todos los pisos</option>
            {floors.map((entry) => <option key={entry}>{entry}</option>)}
          </Select>
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos los estados</option>
            {statuses.map((entry) => <option key={entry}>{entry}</option>)}
          </Select>
        </div>
        <table className="tbl">
          <thead><tr><th>Local</th><th>Cliente</th><th>Piso</th><th>Consumo</th><th className="r">Importe real / estimado</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.floor}-${row.local}`}>
                <td className="font-bold">{row.local}</td>
                <td>{row.client}</td>
                <td>{row.floor}</td>
                <td>{row.consumption}</td>
                <td className="r">
                  <div className="num font-bold">{row.amount}</div>
                  <div className="mt-1 text-xs text-ink-3">{row.estimateLabel}</div>
                </td>
                <td><Pill tone={row.tone}>{row.statusLabel}</Pill></td>
                <td className="r">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setActiveInvoice(row.invoiceModal); setOpen(true); }}>Recibo</Button>
                    <Button variant="ghost" size="sm" onClick={() => sendInvoice(row.invoiceId)} disabled={!row.sendEligible} title={!row.sendEligible ? "Configura correo del inquilino antes de enviar" : undefined}>Enviar</Button>
                    <a className="inline-flex items-center justify-center rounded-sm border border-border-2 bg-surface px-2 py-1 text-xs font-bold" href={row.invoiceId ? `/api/owner/invoices/${row.invoiceId}/pdf` : '#'} target="_blank" rel="noreferrer">PDF</a>
                    <Button variant="ghost" size="sm" onClick={() => invoiceAction(row.invoiceId, "mark_paid")}>Pagado</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <InvoiceModal open={open} onClose={() => setOpen(false)} invoice={activeInvoice} />
    </>
  );
}
