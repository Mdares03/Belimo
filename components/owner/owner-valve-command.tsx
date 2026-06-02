'use client';

import { useState } from 'react';
import { Button, Pill } from '@/components/ui/primitives';

export function OwnerValveCommand({
  valveId,
  commandedState,
  lastCommandAt,
  lastCommandResult,
}: {
  valveId: string;
  commandedState?: 'ON' | 'OFF' | null;
  lastCommandAt?: string;
  lastCommandResult?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function command(state: 'ON' | 'OFF') {
    const ok = window.confirm(`¿Confirmas ${state === 'ON' ? 'encender' : 'apagar'} la válvula?`);
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/valves/${valveId}/command`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error ?? 'No se pudo ejecutar comando.');
        return;
      }
      location.reload();
    } catch {
      setError('Error de red al enviar comando.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-sm border border-border bg-surface-2 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Pill tone={commandedState === 'ON' ? 'good' : commandedState === 'OFF' ? 'warn' : 'neutral'}>
          Comandado: {commandedState ?? '—'}
        </Pill>
        <span className="text-xs text-ink-3">{lastCommandAt ? new Date(lastCommandAt).toLocaleString('es-MX') : 'Sin comandos previos'}</span>
      </div>
      {lastCommandResult && <div className="mb-2 text-xs text-ink-3">Último resultado: {lastCommandResult}</div>}
      {error && <div className="mb-2 text-xs text-bad-ink">{error}</div>}
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => command('ON')} disabled={busy}>Encender</Button>
        <Button size="sm" variant="ghost" onClick={() => command('OFF')} disabled={busy}>Apagar</Button>
      </div>
    </div>
  );
}
