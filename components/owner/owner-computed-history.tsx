"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "@/components/ui/primitives";
import type { OwnerValveHistoryView } from "@/lib/scoped-data";

type Row = OwnerValveHistoryView["computedMonthlyHistory"][number];

type Props = {
  localId: string | null;
  rows: Row[];
};

function paidTone(status: string) {
  return status === "PAGADO" ? "good" : "warn";
}

function paidLabel(status: string) {
  return status === "PAGADO" ? "Pagado" : "Pendiente";
}

function computationLabel(status: Row["computationStatus"]) {
  if (status === "sin_lecturas") return "Sin lecturas";
  if (status === "no_tariff") return "Sin tarifa";
  return "Calculado";
}

function money(value: number | null) {
  if (value == null) return "—";
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export function OwnerComputedHistoryTable({ localId, rows }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    if (!rows.length) return null;
    return { fromMonth: rows[rows.length - 1].month, toMonth: rows[0].month };
  }, [rows]);

  async function runAction(payload: Record<string, unknown>) {
    setError(null);
    const response = await fetch("/api/owner/computed-history/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? "No se pudo actualizar el estado de referencia.");
    }
    router.refresh();
  }

  function onToggleMonth(month: string, action: "mark_paid" | "mark_pending") {
    if (!localId) return;
    startTransition(() => {
      runAction({ action, localId, month }).catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error al actualizar estado.");
      });
    });
  }

  function onMarkRangePaid() {
    if (!localId || !range) return;
    startTransition(() => {
      runAction({
        action: "mark_paid_range",
        localIds: [localId],
        fromMonth: range.fromMonth,
        toMonth: range.toMonth,
        note: "Marcado como pagado (referencia operativa)",
      }).catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error al aplicar actualización masiva.");
      });
    });
  }

  return (
    <>
      {localId && rows.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-ink-2">
          <span>Historial de referencia mensual (no depende de recibos generados).</span>
          <button
            type="button"
            disabled={pending}
            onClick={onMarkRangePaid}
            className="rounded-sm border border-border-2 bg-surface px-2 py-1 font-bold text-ink disabled:opacity-60"
          >
            {pending ? "Actualizando..." : "Marcar históricos como pagados"}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-bad-ink">{error}</p>}
      <div className="mt-4 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Periodo</th>
              <th className="r">TON-hr</th>
              <th className="r">m³</th>
              <th className="r">Total calculado</th>
              <th>Estado</th>
              <th>Actualizado</th>
              <th className="r">Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const markPaid = row.paidStatus !== "PAGADO";
              return (
                <tr key={row.month}>
                  <td>
                    <div className="font-bold capitalize">{row.periodLabel}</div>
                    <div className="text-xs text-ink-3">{computationLabel(row.computationStatus)}</div>
                  </td>
                  <td className="r num">{row.consumptionTonHr.toFixed(2)}</td>
                  <td className="r num">{row.waterM3.toFixed(2)}</td>
                  <td className="r num">{money(row.computedTotal)}</td>
                  <td><Pill tone={paidTone(row.paidStatus)}>{paidLabel(row.paidStatus)}</Pill></td>
                  <td>{row.updatedAt ? new Date(row.updatedAt).toLocaleDateString("es-MX") : "—"}</td>
                  <td className="r">
                    {localId ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => onToggleMonth(row.month, markPaid ? "mark_paid" : "mark_pending")}
                        className="rounded-sm border border-border-2 bg-surface px-2 py-1 text-xs font-bold text-ink disabled:opacity-60"
                      >
                        {markPaid ? "Marcar pagado" : "Reabrir"}
                      </button>
                    ) : (
                      <span className="text-xs text-ink-3">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
