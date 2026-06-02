"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { InvoiceModalData } from "@/lib/scoped-data";
import { Button, Pill } from "./primitives";

const emptyInvoice: InvoiceModalData = {
  title: "Sin factura disponible",
  period: "Sin periodo",
  due: "sin vencimiento",
  total: "—",
  lines: [],
  isEmpty: true,
  emptyReason: "Aún no hay un recibo generado para este local.",
};

export function InvoiceModal({ open, onClose, invoice = emptyInvoice }: { open: boolean; onClose: () => void; invoice?: InvoiceModalData }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] grid place-items-center bg-[rgba(40,30,20,.38)] p-6 backdrop-blur-sm" onClick={onClose}>
      <section className="rise max-h-[90vh] w-full max-w-[560px] overflow-auto rounded-lg bg-surface shadow-modal" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between px-6 pt-6">
          <div>
            <div className="eyebrow">Factura · {invoice.period}</div>
            <h2 className="mt-1 text-xl font-bold">{invoice.title}</h2>
            <div className="mt-2 flex gap-2"><Pill tone="warn">Por pagar</Pill><Pill>{invoice.due}</Pill></div>
          </div>
          <button onClick={onClose} className="grid h-[34px] w-[34px] place-items-center rounded-xs bg-surface-3 text-ink-2 hover:bg-border-2"><X size={16} /></button>
        </header>

        <div className="px-6 pb-6 pt-5">
          {invoice.lines.length > 0 ? (
            <>
              {invoice.lines.map((line) => (
                <div key={line.label} className="flex justify-between border-b border-dashed border-border-2 py-3 text-sm">
                  <div className="text-ink-2"><b className="block text-ink">{line.label}</b><span className="text-xs text-ink-3">{line.calc}</span></div>
                  <div className="num font-bold">{line.amount}</div>
                </div>
              ))}
              <div className="mt-4 flex items-baseline justify-between"><span className="font-bold">Total</span><span className="num text-3xl font-extrabold tracking-tight">{invoice.total}</span></div>
              <p className="mt-3 text-xs text-ink-3">Modelo de cobro: TON-hr térmico × eficiencia (kWh/TON-hr) × tarifa CFE, más cargos configurados por periodo.</p>
              <div className="mt-5 flex justify-end gap-2"><Button>Pagar ahora</Button><Button variant="ghost">Descargar PDF</Button></div>
            </>
          ) : (
            <>
              <div className="rounded-sm border border-border bg-surface-2 p-4 text-sm text-ink-2">
                {invoice.emptyReason ?? "Aún no hay un recibo generado para este local."}
              </div>
              <div className="mt-4 flex items-baseline justify-between"><span className="font-bold">Total</span><span className="num text-3xl font-extrabold tracking-tight">—</span></div>
              <p className="mt-3 text-xs text-ink-3">Este modal muestra importes reales sólo cuando existe un recibo generado.</p>
              {invoice.emptyActionHref && invoice.emptyActionLabel && (
                <div className="mt-4 flex justify-end">
                  <a href={invoice.emptyActionHref} className="inline-flex items-center justify-center rounded-sm border border-border-2 bg-surface px-3 py-2 text-sm font-bold hover:bg-surface-2">
                    {invoice.emptyActionLabel}
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
