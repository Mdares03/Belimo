"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Gauge } from "@/components/charts/gauge";
import { MonthlyBars } from "@/components/charts/monthly-bars";
import { Button, Card, PageHead, Pill, Select } from "@/components/ui/primitives";
import { InvoiceModal } from "@/components/ui/invoice-modal";
import type { ClientScopedView } from "@/lib/scoped-data";

function asMoney(value: number) {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export function ClientDashboard({ data }: { data: ClientScopedView }) {
  const [expanded, setExpanded] = useState(data.valves[0]?.name ?? "");
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [selectedValve, setSelectedValve] = useState("all");

  const historyRows = useMemo(() => data.history.map((row) => {
    if (selectedValve === "all") {
      const tonHr = Object.values(row.valves).reduce((acc, value) => acc + value.tonHr, 0);
      const amount = Object.values(row.valves).reduce((acc, value) => acc + value.amount, 0);
      return { ...row, tonHr, amount };
    }

    const valveData = row.valves[selectedValve] ?? { tonHr: 0, amount: 0 };
    return { ...row, tonHr: valveData.tonHr, amount: valveData.amount };
  }), [data.history, selectedValve]);

  return (
    <>
      <PageHead title={`Hola, ${data.name}`}>Esto es lo que llevas en <b>mayo</b>, comparado con tu consumo de costumbre.</PageHead>
      <div className="client-grid grid grid-cols-[minmax(300px,380px)_1fr] items-start gap-6">
        <Card className="card-pad px-6 pb-7 pt-6 text-center">
          <div className="eyebrow">Tu mes en curso</div>
          <Gauge pct={data.gaugePct} />
          <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-good-soft px-4 py-2 text-xl font-extrabold text-good-ink">{data.delta}<span className="text-sm font-semibold">{data.deltaLabel}</span></div>
          <div className="mt-6 flex items-center justify-between border-t border-border pt-5 text-left">
            <div><div className="eyebrow">Cuenta estimada</div><div className="num text-3xl font-extrabold tracking-tight">{data.estimate}</div></div>
            <Pill tone="good">Al corriente</Pill>
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card className="card-pad">
            <div className="flex items-center justify-between"><div><div className="eyebrow">Tendencia</div><h2 className="mt-1 text-lg font-bold">Últimos 6 meses</h2></div><Pill>TON-hr</Pill></div>
            <MonthlyBars data={data.months} />
          </Card>

          <Card className="card-pad">
            <div className="flex items-center justify-between gap-4"><div><div className="eyebrow">Desglose</div><h2 className="mt-1 text-lg font-bold">Por válvula</h2></div><span className="text-xs text-ink-3">toca una fila para el detalle</span></div>
            <div className="mt-4">
              {data.valves.map((valve) => (
                <div key={valve.name} className="border-b border-border last:border-0">
                  <button className="flex w-full items-center gap-3 py-4 text-left" onClick={() => setExpanded(expanded === valve.name ? "" : valve.name)}>
                    <span className="w-[120px] shrink-0 font-bold md:w-[150px]">{valve.name}</span>
                    <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-3"><span className="block h-full rounded-full bg-accent" style={{ width: `${valve.pct}%` }} /></span>
                    <span className="num w-[88px] text-right font-bold">{valve.amount}</span>
                    <ChevronRight className={expanded === valve.name ? "rotate-90 text-accent transition" : "text-ink-3 transition"} size={22} />
                  </button>
                  {expanded === valve.name && <div className="rise grid gap-3 pb-4 md:ml-[168px] md:grid-cols-3">{[["Energía térmica", valve.energy, "TON-hr · $2.90"], ["Agua", valve.water, "m³ · $14.20"], ["Potencia pico", valve.peak.split(" · ")[0], valve.peak.split(" · ")[1] ?? "N/A"]].map(([k, v, s]) => <div key={k} className="rounded-[13px] border border-border bg-surface-2 p-3"><div className="text-xs text-ink-2">{k}</div><div className="num mt-0.5 text-lg font-extrabold">{v}</div><div className="text-[11px] text-ink-3">{s}</div></div>)}</div>}
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between"><span className="text-[13px] text-ink-3">{data.valves.length} válvulas · {data.summaryDate}</span><Button variant="ghost" size="sm" onClick={() => setInvoiceOpen(true)}>Ver mi factura</Button></div>
          </Card>
        </div>
      </div>

      <Card className="card-pad mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="eyebrow">Historial</div>
            <h2 className="mt-1 text-lg font-bold">Meses anteriores</h2>
          </div>
          <Select value={selectedValve} onChange={(event) => setSelectedValve(event.target.value)}>
            {data.valveFilters.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </Select>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Mes</th>
                <th className="r">Consumo (TON-hr)</th>
                <th className="r">Importe</th>
                <th>Estado</th>
                <th className="r">Recibo</th>
              </tr>
            </thead>
            <tbody>
              {historyRows.map((row) => (
                <tr key={row.month}>
                  <td className="font-bold">{row.month}</td>
                  <td className="r num">{Math.round(row.tonHr).toLocaleString("en-US")}</td>
                  <td className="r num font-bold">{asMoney(row.amount)}</td>
                  <td><Pill tone={row.tone}>{row.status}</Pill></td>
                  <td className="r"><Button variant="ghost" size="sm" onClick={() => setInvoiceOpen(true)}>{row.receiptLabel}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <InvoiceModal open={invoiceOpen} onClose={() => setInvoiceOpen(false)} invoice={data.invoiceModal} />
    </>
  );
}
