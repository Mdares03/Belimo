'use client';

import { useEffect, useMemo, useState } from 'react';
import { Zap } from 'lucide-react';
import type { BillingRunSummary } from '@/lib/billing';
import type { OwnerScopedView } from '@/lib/scoped-data';
import { Button, Card, PageHead, Pill } from '@/components/ui/primitives';

type BillingPeriodOption = { id: string; label: string; year: number; startDate: string; endDate: string };

export function OwnerResumen({ data }: { data: OwnerScopedView }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BillingRunSummary | null>(null);
  const [periods, setPeriods] = useState<BillingPeriodOption[]>([]);
  const [periodId, setPeriodId] = useState('');

  useEffect(() => {
    let mounted = true;
    fetch(`/api/owner/billing/periods?buildingId=${encodeURIComponent(data.buildingId)}`)
      .then((r) => r.json())
      .then((payload) => {
        if (!mounted) return;
        const items = (payload?.periods ?? []) as BillingPeriodOption[];
        setPeriods(items);
        setPeriodId((curr) => curr || items[0]?.id || '');
      })
      .catch(() => {
        if (!mounted) return;
        setError('No se pudieron cargar periodos.');
      });
    return () => {
      mounted = false;
    };
  }, [data.buildingId]);

  const rowsByStatus = useMemo(() => {
    if (!summary) return null;
    return {
      created: summary.rows.filter((r) => r.status === 'created').length,
      updated: summary.rows.filter((r) => r.status === 'updated').length,
      locked: summary.rows.filter((r) => r.status === 'locked').length,
      skipped: summary.rows.filter((r) => r.status === 'skipped').length,
      errors: summary.rows.filter((r) => r.status === 'error').length,
    };
  }, [summary]);

  async function runBilling() {
    if (!periodId) {
      setError('Selecciona un periodo de facturación.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/owner/billing/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ buildingId: data.buildingId, billingPeriodId: periodId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.error ?? 'No se pudo generar recibos.');
        return;
      }
      setSummary(payload as BillingRunSummary);
    } catch {
      setError('No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageHead title="Resumen">Panorama de consumo, cobranzas y salud de válvulas por edificio.</PageHead>
      <Card className="card-pad border-accent-soft bg-gradient-to-br from-white to-accent-soft-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="eyebrow">{data.buildingName}</div>
            <h2 className="mt-1 text-xl font-bold">Genera los recibos del periodo seleccionado</h2>
          </div>
          <Button onClick={() => { setOpen(true); setSummary(null); setError(null); }}><Zap size={16} />Generar recibos</Button>
        </div>
      </Card>

      <div className="kpi-grid mt-5 grid grid-cols-3 gap-4">
        <Card className="p-5"><div className="text-xs font-semibold text-ink-2">Por cobrar (mes cerrado)</div><div className="num mt-2 text-[32px] font-extrabold text-accent-ink">{data.kpis.due}</div></Card>
        <Card className="p-5"><div className="text-xs font-semibold text-ink-2">Cobrado (mes cerrado)</div><div className="num mt-2 text-[32px] font-extrabold text-good-ink">{data.kpis.paid}</div></Card>
        <Card className="p-5"><div className="text-xs font-semibold text-ink-2">Vencido (mes cerrado)</div><div className="num mt-2 text-[32px] font-extrabold text-bad-ink">{data.kpis.overdue}</div></Card>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-lg font-bold">Salud de válvulas</h3>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <Pill tone="good">En línea: {data.valveHealth.ok}</Pill>
            <Pill tone="warn">Alerta: {data.valveHealth.alerta}</Pill>
            <Pill tone="bad">Error: {data.valveHealth.error}</Pill>
            <Pill tone="neutral">Offline: {data.valveHealth.offline}</Pill>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="text-lg font-bold">Por nivel</h3>
          <div className="mt-3 space-y-3">
            {data.floorGroups.map((floor) => (
              <div key={floor.floor}>
                <div className="mb-1 flex items-center justify-between text-sm"><span className="font-semibold">{floor.floor}</span><span className="num text-ink-2">{floor.amount}</span></div>
                <div className="h-2 rounded-full bg-surface-3"><div className="h-2 rounded-full bg-accent" style={{ width: `${Math.min(100, floor.locales * 12 + 20)}%` }} /></div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(40,30,20,.38)] p-6 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <section className="rise max-h-[90vh] w-full max-w-[760px] overflow-auto rounded-lg bg-surface p-6 shadow-modal" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-xl font-bold">Generar recibos por periodo</h3>
            <p className="mt-1 text-sm text-ink-2">Edificio: {data.buildingName}.</p>
            <div className="mt-3">
              <label className="text-xs font-semibold text-ink-2">Periodo de facturación</label>
              <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className="mt-1 w-full rounded-sm border border-border-2 bg-surface px-3 py-2 text-sm">
                <option value="">Selecciona un periodo</option>
                {periods.map((p) => <option key={p.id} value={p.id}>{p.label} {p.year}</option>)}
              </select>
            </div>
            <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cerrar</Button><Button onClick={runBilling} disabled={loading || !periodId}>{loading ? 'Generando...' : 'Generar'}</Button></div>

            {error && <p className="mt-4 rounded-sm border border-bad-soft bg-bad-soft/30 p-3 text-sm text-bad-ink">{error}</p>}

            {summary && (
              <div className="mt-5 space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Pill tone="good">Creados: {summary.counts.created}</Pill>
                  <Pill tone="accent">Actualizados: {summary.counts.updated}</Pill>
                  <Pill tone="warn">Saltados: {summary.counts.skipped}</Pill>
                  <Pill tone="neutral">Bloqueados: {summary.counts.locked}</Pill>
                  <Pill tone="bad">Errores: {summary.counts.error}</Pill>
                  <Pill tone={summary.counts.anomalies ? 'warn' : 'good'}>Anomalías: {summary.counts.anomalies}</Pill>
                </div>
                <div className="text-xs text-ink-3">Periodo: {summary.period.label} {summary.period.year} · TZ {summary.period.timezone}</div>
                {rowsByStatus && (
                  <div className="grid grid-cols-2 gap-2 text-xs text-ink-2">
                    <div>created: {rowsByStatus.created}</div>
                    <div>updated: {rowsByStatus.updated}</div>
                    <div>locked: {rowsByStatus.locked}</div>
                    <div>skipped: {rowsByStatus.skipped}</div>
                    <div>error: {rowsByStatus.errors}</div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
