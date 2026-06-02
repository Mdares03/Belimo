'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import type { InvoiceModalData, OwnerScopedView } from '@/lib/scoped-data';
import { Button, Card, PageHead, Pill } from '@/components/ui/primitives';
import { InvoiceModal } from '@/components/ui/invoice-modal';

function valveTone(status: string) {
  if (status === 'OK') return 'good' as const;
  if (status === 'ALERTA') return 'warn' as const;
  if (status === 'ERROR') return 'bad' as const;
  return 'neutral' as const;
}

function parseMoneyAmount(value: string) {
  const numeric = Number(value.replace(/[$,]/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
}

function moneyRounded(value: number) {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

export function OwnerValvulas({ data }: { data: OwnerScopedView }) {
  const [openFloor, setOpenFloor] = useState(data.floorGroups[0]?.floor ?? '');
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [activeInvoice, setActiveInvoice] = useState<InvoiceModalData | undefined>(undefined);
  const [busyValveId, setBusyValveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function commandValve(valveId: string, state: 'ON' | 'OFF') {
    const ok = window.confirm(`¿Confirmas ${state === 'ON' ? 'encender' : 'apagar'} la válvula? Esta acción impacta equipo físico.`);
    if (!ok) return;

    setBusyValveId(valveId);
    setError(null);
    try {
      const response = await fetch(`/api/valves/${valveId}/command`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error ?? 'No se pudo ejecutar el comando de válvula.');
        return;
      }
      location.reload();
    } catch {
      setError('No se pudo conectar con el servidor de actuadores.');
    } finally {
      setBusyValveId(null);
    }
  }

  return (
    <>
      <PageHead title="Válvulas por piso">{data.stats.valves} válvulas · {data.stats.floors} niveles · {data.stats.locales} locales</PageHead>
      {error && <p className="mb-4 rounded-sm border border-bad-soft bg-bad-soft/30 p-3 text-sm text-bad-ink">{error}</p>}
      <div className="space-y-3">
        {data.floorGroups.map((floor) => {
          const expanded = openFloor === floor.floor;
          const referenceFloorAmount = floor.rows.reduce((acc, row) => {
            const amount = row.estimateStatus === 'ok' ? parseMoneyAmount(row.estimateAmount) : null;
            return amount == null ? acc : acc + amount;
          }, 0);
          const displayFloorAmount = referenceFloorAmount > 0 ? moneyRounded(referenceFloorAmount) : floor.amount;

          return (
            <Card key={floor.floor} className="p-0">
              <button className="flex w-full items-center gap-4 p-4 text-left" onClick={() => setOpenFloor(expanded ? '' : floor.floor)}>
                <div>
                  <div className="font-bold">{floor.floor}</div>
                  <div className="text-xs text-ink-3">{floor.locales} locales · {floor.valves} válvulas</div>
                </div>
                <span className="num ml-auto font-bold">{displayFloorAmount}</span>
                <Pill tone={floor.tone}>{floor.statusLabel}</Pill>
                <ChevronDown className={expanded ? 'rotate-180 text-accent transition' : 'text-ink-3 transition'} size={18} />
              </button>
              {expanded && <div className="border-t border-border p-4">
                <div className="space-y-2">
                  {floor.rows.map((row) => (
                    <div key={`${floor.floor}-${row.local}`} className="grid gap-2 rounded-sm border border-border bg-surface-2 p-3 md:grid-cols-[1.1fr_2fr_.95fr_.7fr_.8fr_auto] md:items-center">
                      <div><div className="font-bold">{row.local}</div><div className="text-xs text-ink-3">{row.client}</div></div>
                      <div className="flex flex-wrap gap-2">
                        {row.valves.map((valve) => (
                          <div key={valve.id} className="flex items-center gap-1 rounded-sm border border-border bg-surface px-1.5 py-1">
                            <Link href={`/owner/valvulas/${valve.id}?building=${encodeURIComponent(data.buildingId)}`}><Pill tone={valveTone(valve.status)}>{valve.label}</Pill></Link>
                            <button className="rounded-sm border border-border-2 px-1.5 py-0.5 text-[10px] font-bold" disabled={busyValveId === valve.id} onClick={() => commandValve(valve.id, 'ON')}>ON</button>
                            <button className="rounded-sm border border-border-2 px-1.5 py-0.5 text-[10px] font-bold" disabled={busyValveId === valve.id} onClick={() => commandValve(valve.id, 'OFF')}>OFF</button>
                            <span className="text-[10px] text-ink-3">{valve.commandedState ?? '—'}</span>
                          </div>
                        ))}
                      </div>
                      <div className="text-sm text-ink-2">
                        <div>{row.consumption}</div>
                        <div className="mt-0.5 text-xs text-ink-3">{row.coverageLabel}</div>
                        <div className="mt-1 text-xs text-ink-3">{row.estimateLabel}</div>
                      </div>
                      <div className="num font-bold">{row.estimateStatus === 'ok' ? row.estimateAmount : row.amount}</div>
                      <Pill tone={row.tone}>{row.statusLabel}</Pill>
                      <Button variant="ghost" size="sm" onClick={() => { setActiveInvoice(row.invoiceModal); setInvoiceOpen(true); }}>Recibo</Button>
                    </div>
                  ))}
                </div>
              </div>}
            </Card>
          );
        })}
      </div>
      <InvoiceModal open={invoiceOpen} onClose={() => setInvoiceOpen(false)} invoice={activeInvoice} />
    </>
  );
}
