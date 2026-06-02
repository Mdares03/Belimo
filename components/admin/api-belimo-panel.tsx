'use client';

import { useMemo, useState } from 'react';
import { Button, Card, PageHead, Pill } from '@/components/ui/primitives';
import type { IngestHealthSummary } from '@/lib/ingest-health';

type Props = {
  belimo: {
    connected: boolean;
    audience: string;
    renewedAgo?: string;
    issuedAt?: string;
    reason?: string;
  };
  health: IngestHealthSummary;
};

function rel(iso?: string | null) {
  if (!iso) return 'sin datos';
  return new Date(iso).toLocaleString('es-MX');
}

export function ApiBelimoPanel({ belimo, health: initialHealth }: Props) {
  const [health, setHealth] = useState(initialHealth);
  const [running, setRunning] = useState(false);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const staleCount = useMemo(
    () => health.readings.buildings.filter((b) => b.stale).length,
    [health.readings.buildings],
  );

  async function refreshHealth() {
    setLoadingHealth(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/ingest/health', { cache: 'no-store' });
      const payload = await res.json();
      if (!res.ok) {
        setMessage(payload?.error ?? 'No se pudo actualizar salud de ingestión.');
        return;
      }
      setHealth(payload as IngestHealthSummary);
    } catch {
      setMessage('No se pudo consultar salud de ingestión.');
    } finally {
      setLoadingHealth(false);
    }
  }

  async function runNow() {
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/ingest/run', { method: 'POST' });
      const payload = await res.json();
      if (!res.ok || !payload?.ok) {
        setMessage(payload?.error ?? 'Falló la ejecución manual de ingestión.');
        return;
      }
      setMessage('Ingestión manual ejecutada correctamente.');
      await refreshHealth();
    } catch {
      setMessage('No se pudo ejecutar la ingestión manual.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <PageHead title="API Belimo">
        Estado real de conexión + salud de ingestión. El cron recomendado es diario a las 02:00 con `scripts/run-ingest.mjs`.
      </PageHead>

      <Card className="card-pad mb-5 border-good-soft bg-good-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Pill tone={belimo.connected ? 'good' : 'bad'}>{belimo.connected ? 'Conectado' : 'Desconectado'}</Pill>
            <h2 className="mt-2 text-xl font-bold text-good-ink">
              {belimo.connected
                ? `Token válido${belimo.renewedAgo ? ` · renovado hace ${belimo.renewedAgo}` : ''}`
                : 'Sin conexión válida'}
            </h2>
            <div className="mt-1 text-sm text-ink-2">Audiencia: {belimo.audience}</div>
            {belimo.reason && <div className="mt-1 text-sm text-bad-ink">{belimo.reason}</div>}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={refreshHealth} disabled={loadingHealth || running}>
              {loadingHealth ? 'Actualizando...' : 'Actualizar salud'}
            </Button>
            <Button onClick={runNow} disabled={running || loadingHealth}>
              {running ? 'Ejecutando...' : 'Ejecutar ingestión ahora'}
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5"><div className="text-xs font-semibold text-ink-2">Último intento</div><div className="mt-2 text-sm font-bold">{rel(health.attempts.lastAttemptIso)}</div></Card>
        <Card className="p-5"><div className="text-xs font-semibold text-ink-2">Último éxito</div><div className="mt-2 text-sm font-bold">{rel(health.attempts.lastSuccessIso)}</div></Card>
        <Card className="p-5"><div className="text-xs font-semibold text-ink-2">Edificios estancados</div><div className="mt-2 text-2xl font-extrabold text-warn-ink">{staleCount}</div><div className="text-xs text-ink-3">umbral {health.staleThresholdHours}h</div></Card>
      </div>

      <Card className="mt-5">
        <div className="p-5"><h3 className="text-lg font-bold">Última lectura por edificio</h3></div>
        <table className="tbl">
          <thead><tr><th>Edificio</th><th>Última lectura</th><th>Estado</th></tr></thead>
          <tbody>
            {health.readings.buildings.map((row) => (
              <tr key={row.name}>
                <td className="font-bold">{row.name}</td>
                <td>{rel(row.lastReadingIso)}</td>
                <td><Pill tone={row.stale ? 'warn' : 'good'}>{row.stale ? 'Sincronización rezagada' : 'Al día'}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="mt-5 p-5">
        <h3 className="text-lg font-bold">Cola de ingestión (log)</h3>
        <p className="mt-1 text-sm text-ink-2">Archivo: {health.logPath}</p>
        <pre className="mt-3 max-h-[260px] overflow-auto rounded-sm bg-surface-3 p-3 text-xs text-ink-2">
          {health.attempts.tail.join('\n') || 'Sin registros todavía.'}
        </pre>
      </Card>

      {message && (
        <p className="mt-4 rounded-sm border border-border bg-surface-2 p-3 text-sm text-ink-2">{message}</p>
      )}
    </>
  );
}
