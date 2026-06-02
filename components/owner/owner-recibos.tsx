"use client";

import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import type { BillingRunSummary } from "@/lib/billing";
import type { OwnerScopedView } from "@/lib/scoped-data";
import { Button, Card, PageHead, Pill } from "@/components/ui/primitives";

type BillingPeriodOption = { id: string; label: string; year: number; startDate: string; endDate: string };

function reasonLabel(reason?: string) {
  switch (reason) {
    case 'missing_client':
      return 'Sin cliente asignado';
    case 'missing_tariff':
      return 'Sin tarifa activa';
    case 'missing_valves':
      return 'Sin válvulas vinculadas';
    case 'zero_consumption':
      return 'Consumo 0 en el periodo';
    case 'missing_or_invalid_boundary_readings':
      return 'Lecturas de frontera faltantes/inválidas';
    case 'paid_invoice_locked':
      return 'Factura pagada (bloqueada)';
    default:
      return reason ?? '—';
  }
}

export function OwnerRecibos({ data }: { data: OwnerScopedView }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BillingRunSummary | null>(null);
  const [periods, setPeriods] = useState<BillingPeriodOption[]>([]);
  const [periodId, setPeriodId] = useState("");

  useEffect(() => {
    let mounted = true;
    fetch(`/api/owner/billing/periods?buildingId=${encodeURIComponent(data.buildingId)}`)
      .then((r) => r.json())
      .then((payload) => {
        if (!mounted) return;
        const items = (payload?.periods ?? []) as BillingPeriodOption[];
        setPeriods(items);
        setPeriodId((curr) => curr || items[0]?.id || "");
      })
      .catch(() => {
        if (!mounted) return;
        setError("No se pudieron cargar periodos.");
      });
    return () => {
      mounted = false;
    };
  }, [data.buildingId]);

  async function runBilling() {
    if (!periodId) {
      setError("Selecciona un periodo de facturación.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/owner/billing/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ buildingId: data.buildingId, billingPeriodId: periodId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.error ?? "No se pudo generar recibos.");
        return;
      }
      setSummary(payload as BillingRunSummary);
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }


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
      <PageHead title="Recibos">Generación, envío y seguimiento de recibos por local.</PageHead>
      <div className="mb-5 flex flex-wrap gap-2">{data.recibosSummary.map((item) => <Pill key={item.label} tone={item.tone}>{item.label}: {item.value}</Pill>)}</div>
      <Card>
        <div className="flex items-center justify-between p-5">
          <h2 className="text-lg font-bold">Recibos del periodo</h2>
          <Button onClick={() => { setOpen(true); setSummary(null); setError(null); }}><Zap size={16} />Generar recibos</Button>
        </div>
        <table className="tbl">
          <thead><tr><th>Local</th><th>Cliente</th><th>Correo destino</th><th className="r">Importe</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {data.recipients.map((row) => (
              <tr key={`${row.local}-${row.email}-${row.invoiceId ?? "na"}`}>
                <td className="font-bold">{row.local}</td>
                <td>{row.client}</td>
                <td>
                  <div className="flex flex-col">
                    <span>{row.email}</span>
                    {row.recipientSource !== "client_user" && (
                      <span className="text-xs text-warn-ink">{row.sendBlockReason === "missing_tenant_email" ? "Falta correo del inquilino" : "Correo no configurado"}</span>
                    )}
                  </div>
                </td>
                <td className="r num font-bold">{row.amount}</td>
                <td><Pill tone={row.statusLabel === "Pagado" ? "good" : row.statusLabel === "Vencido" ? "bad" : "warn"}>{row.statusLabel}</Pill></td>
                <td>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => sendInvoice(row.invoiceId)} disabled={!row.sendEligible} title={!row.sendEligible ? "Configura correo del inquilino antes de enviar" : undefined}>Enviar</Button>
                    <a className="inline-flex items-center justify-center rounded-sm border border-border-2 bg-surface px-2 py-1 text-xs font-bold" href={row.invoiceId ? `/api/owner/invoices/${row.invoiceId}/pdf` : '#'} target="_blank" rel="noreferrer">PDF</a>
                    <Button variant="ghost" size="sm" onClick={() => invoiceAction(row.invoiceId, "mark_paid")}>Marcar pagado</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(40,30,20,.38)] p-6 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <section className="rise max-h-[90vh] w-full max-w-[640px] overflow-auto rounded-lg bg-surface p-6 shadow-modal" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-xl font-bold">Generar recibos por periodo</h3>
            <p className="mt-1 text-sm text-ink-2">Edificio: {data.buildingName}.</p>
            <div className="mt-3">
              <label className="text-xs font-semibold text-ink-2">Periodo de facturación</label>
              <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className="mt-1 w-full rounded-sm border border-border-2 bg-surface px-3 py-2 text-sm">
                <option value="">Selecciona un periodo</option>
                {periods.map((p) => <option key={p.id} value={p.id}>{p.label} {p.year}</option>)}
              </select>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cerrar</Button>
              <Button onClick={runBilling} disabled={loading || !periodId}>{loading ? "Generando..." : "Generar"}</Button>
            </div>

            {error && <p className="mt-4 rounded-sm border border-bad-soft bg-bad-soft/30 p-3 text-sm text-bad-ink">{error}</p>}

            {summary && (
              <div className="mt-5 space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Pill tone="good">Creados: {summary.counts.created}</Pill>
                  <Pill tone="accent">Actualizados: {summary.counts.updated}</Pill>
                  <Pill tone="warn">Saltados: {summary.counts.skipped}</Pill>
                  <Pill tone="neutral">Bloqueados (pagados): {summary.counts.locked}</Pill>
                  <Pill tone="bad">Errores: {summary.counts.error}</Pill>
                  <Pill tone={summary.counts.anomalies ? "warn" : "good"}>Anomalías: {summary.counts.anomalies}</Pill>
                </div>
                <div className="text-xs text-ink-3">Periodo: {summary.period.label} {summary.period.year} · TZ {summary.period.timezone}</div>
                <div className="rounded-sm border border-border">
                  <table className="tbl text-xs">
                    <thead>
                      <tr><th>Local</th><th>Cliente</th><th>Resultado</th><th>Motivo</th></tr>
                    </thead>
                    <tbody>
                      {summary.rows.map((row) => (
                        <tr key={`${row.localId}-${row.localCode}-${row.status}`}>
                          <td className="font-semibold">{row.localCode}</td>
                          <td>{row.clientName}</td>
                          <td>{row.status}</td>
                          <td>{reasonLabel(row.reason)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
