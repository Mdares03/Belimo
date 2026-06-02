'use client';

import { useMemo, useState } from 'react';
import { Button, Card, Input, PageHead, Pill, Select, StatusDot } from '@/components/ui/primitives';

type Row = {
  id: string;
  serial: string;
  local: string;
  client: string;
  building: string;
  last: string;
  status: 'OK' | 'ALERTA' | 'ERROR' | 'OFFLINE';
  commandedState?: 'ON' | 'OFF' | null;
  lastCommandAt?: string;
  lastCommandResult?: string | null;
  estimateLabel: string;
  estimateAmount: string;
  estimateStatus: 'ok' | 'no_tariff' | 'no_data';
};

type Props = {
  valves: Row[];
  counts: { todos: number; OK: number; ALERTA: number; ERROR: number; OFFLINE: number };
  clients: string[];
  buildings: string[];
};

const statusTone = { OK: 'good', ALERTA: 'warn', ERROR: 'bad', OFFLINE: 'neutral' } as const;

export function ValvulasClient({ valves, counts, clients, buildings }: Props) {
  const [status, setStatus] = useState('todos');
  const [client, setClient] = useState('');
  const [building, setBuilding] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyValveId, setBusyValveId] = useState<string | null>(null);

  const tiles = [
    { status: 'todos', label: 'Todas', value: counts.todos },
    { status: 'OK', label: 'En línea', value: counts.OK },
    { status: 'ALERTA', label: 'Alerta', value: counts.ALERTA },
    { status: 'ERROR', label: 'Error', value: counts.ERROR },
    { status: 'OFFLINE', label: 'Offline', value: counts.OFFLINE },
  ];

  const filtered = useMemo(
    () =>
      valves.filter(
        (valve) =>
          (status === 'todos' || valve.status === status) &&
          (!client || valve.client === client) &&
          (!building || valve.building === building) &&
          (!q || Object.values(valve).join(' ').toLowerCase().includes(q.toLowerCase())),
      ),
    [valves, status, client, building, q],
  );

  async function commandValve(valveId: string, state: 'ON' | 'OFF') {
    const ok = window.confirm(`¿Confirmas ${state === 'ON' ? 'encender' : 'apagar'} esta válvula?`);
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
        setError(payload?.error ?? 'No se pudo ejecutar comando de actuador.');
        return;
      }
      location.reload();
    } catch {
      setError('No se pudo conectar con API de actuación.');
    } finally {
      setBusyValveId(null);
    }
  }

  return (
    <>
      <PageHead title="Válvulas">Salud de conexión, estado comandado y control ON/OFF con auditoría.</PageHead>
      {error && <p className="mb-4 rounded-sm border border-bad-soft bg-bad-soft/30 p-3 text-sm text-bad-ink">{error}</p>}
      <div className="valve-tiles grid grid-cols-5 gap-3">
        {tiles.map((tile) => (
          <button
            key={tile.status}
            onClick={() => setStatus(tile.status)}
            className={status === tile.status ? 'rounded-md border border-accent bg-surface p-4 text-left shadow-[0_0_0_2px_#DCEBF1]' : 'rounded-md border border-border bg-surface p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-raised'}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-2"><span className="h-2.5 w-2.5 rounded-full bg-accent" />{tile.label}</div>
            <div className="num mt-2 text-3xl font-extrabold text-accent-ink">{tile.value}</div>
          </button>
        ))}
      </div>
      <div className="my-5 flex flex-wrap gap-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar serie, local, cliente..." className="max-w-[330px]" />
        <Select value={client} onChange={(e) => setClient(e.target.value)}>
          <option value="">Todos los clientes</option>
          {clients.map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Select value={building} onChange={(e) => setBuilding(e.target.value)}>
          <option value="">Todos los edificios</option>
          {buildings.map((b) => <option key={b}>{b}</option>)}
        </Select>
      </div>
      <Card>
        {filtered.length ? (
          <table className="tbl">
            <thead><tr><th>Estado</th><th>Serie</th><th>Local</th><th>Cliente</th><th>Edificio</th><th>Último reporte</th><th>Estimado MTD</th><th>Comandado</th><th>Control</th></tr></thead>
            <tbody>
              {filtered.map((valve) => (
                <tr key={valve.id}>
                  <td><StatusDot status={valve.status} /></td>
                  <td className="font-bold">{valve.serial}</td>
                  <td>{valve.local}</td>
                  <td>{valve.client}</td>
                  <td>{valve.building}</td>
                  <td>{valve.last}</td>
                  <td className="text-xs text-ink-2">
                    <div className="num font-semibold">{valve.estimateAmount}</div>
                    <div className="mt-1 text-ink-3">{valve.estimateLabel}</div>
                  </td>
                  <td>
                    <div className="text-xs">
                      <Pill tone={valve.commandedState === 'ON' ? 'good' : valve.commandedState === 'OFF' ? 'warn' : 'neutral'}>{valve.commandedState ?? '—'}</Pill>
                      {valve.lastCommandResult && <div className="mt-1 text-ink-3">{valve.lastCommandResult}</div>}
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => commandValve(valve.id, 'ON')} disabled={busyValveId === valve.id}>ON</Button>
                      <Button size="sm" variant="ghost" onClick={() => commandValve(valve.id, 'OFF')} disabled={busyValveId === valve.id}>OFF</Button>
                      <Pill tone={statusTone[valve.status]}>{valve.status}</Pill>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-10 text-center text-ink-3">No hay válvulas con esos filtros.</div>
        )}
      </Card>
    </>
  );
}
