'use client';

import { useState } from 'react';
import { Lock, LockOpen, Power } from 'lucide-react';
import { Button, Card, Pill } from '@/components/ui/primitives';

export type ActuatorValve = {
  id: string;
  serial: string;
  location: string;
  buildingName: string;
  commandedState: 'ON' | 'OFF' | null;
  lastCommandAt: string | null;
  lastCommandResult: string | null;
  actuatable: boolean;
};

export function ActuatorPanel({ valves }: { valves: ActuatorValve[] }) {
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [password, setPassword] = useState('');
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const unlocked = !!token && expiresAt > Date.now();

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    setUnlockBusy(true);
    setUnlockError(null);
    try {
      const res = await fetch('/api/actuation/unlock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUnlockError(payload?.error ?? 'No se pudo desbloquear.');
        return;
      }
      setToken(payload.token);
      setExpiresAt(payload.expiresAt ?? 0);
      setPassword('');
    } catch {
      setUnlockError('Error de red al desbloquear.');
    } finally {
      setUnlockBusy(false);
    }
  }

  function lock() {
    setToken(null);
    setExpiresAt(0);
  }

  async function command(valve: ActuatorValve, state: 'ON' | 'OFF') {
    if (!token) return;
    const ok = window.confirm(`¿Confirmas ${state === 'ON' ? 'ENCENDER' : 'APAGAR'} la válvula física ${valve.serial}? Esto controla equipo de climatización real.`);
    if (!ok) return;

    setBusyId(valve.id);
    setRowError((m) => ({ ...m, [valve.id]: '' }));
    try {
      const res = await fetch(`/api/valves/${valve.id}/command`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-actuation-token': token },
        body: JSON.stringify({ state }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (payload?.code === 'reauth_required') lock();
        setRowError((m) => ({ ...m, [valve.id]: payload?.error ?? 'No se pudo ejecutar comando.' }));
        return;
      }
      location.reload();
    } catch {
      setRowError((m) => ({ ...m, [valve.id]: 'Error de red al enviar comando.' }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <Card className="card-pad mb-5 border-warn-soft bg-warn-soft/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {unlocked ? <LockOpen className="text-good-ink" size={22} /> : <Lock className="text-warn-ink" size={22} />}
            <div>
              <div className="font-bold">{unlocked ? 'Actuación desbloqueada' : 'Actuación bloqueada'}</div>
              <p className="text-xs text-ink-2">
                {unlocked
                  ? 'Sesión activa. Por seguridad expira automáticamente.'
                  : 'Ingresa tu contraseña de acceso para habilitar los controles.'}
              </p>
            </div>
          </div>
          {unlocked ? (
            <Button size="sm" variant="ghost" onClick={lock}>Bloquear</Button>
          ) : (
            <form onSubmit={unlock} className="flex items-center gap-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tu contraseña"
                autoComplete="current-password"
                className="rounded-sm border border-border-2 bg-surface px-3 py-2 text-sm"
              />
              <Button size="sm" type="submit" disabled={unlockBusy || !password}>{unlockBusy ? 'Verificando…' : 'Desbloquear'}</Button>
            </form>
          )}
        </div>
        {unlockError && <p className="mt-2 text-sm text-bad-ink">{unlockError}</p>}
      </Card>

      <div className="space-y-3">
        {valves.map((valve) => (
          <Card key={valve.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold">{valve.serial}</span>
                  <Pill tone={valve.commandedState === 'ON' ? 'good' : valve.commandedState === 'OFF' ? 'warn' : 'neutral'}>
                    Comandado: {valve.commandedState ?? '—'}
                  </Pill>
                  {!valve.actuatable && <Pill tone="neutral">Fuera de allowlist</Pill>}
                </div>
                <div className="mt-1 text-xs text-ink-2">{valve.buildingName} · {valve.location}</div>
                <div className="mt-0.5 text-xs text-ink-3">
                  {valve.lastCommandAt ? `Último: ${new Date(valve.lastCommandAt).toLocaleString('es-MX')}` : 'Sin comandos previos'}
                  {valve.lastCommandResult ? ` · ${valve.lastCommandResult}` : ''}
                </div>
                {rowError[valve.id] && <div className="mt-1 text-xs text-bad-ink">{rowError[valve.id]}</div>}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" disabled={!unlocked || !valve.actuatable || busyId === valve.id} onClick={() => command(valve, 'ON')}>
                  <Power size={14} /> Encender
                </Button>
                <Button size="sm" variant="ghost" disabled={!unlocked || !valve.actuatable || busyId === valve.id} onClick={() => command(valve, 'OFF')}>
                  <Power size={14} /> Apagar
                </Button>
              </div>
            </div>
          </Card>
        ))}
        {!valves.length && <p className="text-sm text-ink-3">No hay válvulas disponibles para actuación.</p>}
      </div>
    </>
  );
}
