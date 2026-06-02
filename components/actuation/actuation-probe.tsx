'use client';

import { useState } from 'react';
import { Button, Card } from '@/components/ui/primitives';

type ProbeResult = {
  method: string;
  path: string;
  status?: number;
  ok?: boolean;
  allow?: string | null;
  contentType?: string | null;
  body?: string;
  error?: string;
};

const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function ActuationProbe({ dummySerial }: { dummySerial: string | null }) {
  const [results, setResults] = useState<ProbeResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [method, setMethod] = useState('GET');
  const [path, setPath] = useState('/devices/{id}/commands');
  const [bodyText, setBodyText] = useState('{\n  "command": "set_state",\n  "state": "OFF"\n}');
  const [password, setPassword] = useState('');

  async function getToken(): Promise<string | null> {
    const res = await fetch('/api/actuation/unlock', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(payload?.error ?? 'No se pudo verificar la contraseña.');
      return null;
    }
    return payload.token as string;
  }

  async function run(payload: object, token?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/actuation/probe', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { 'x-actuation-token': token } : {}) },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? 'Error en el probe.');
        return;
      }
      setResults(data.results ?? []);
    } catch {
      setError('Error de red al ejecutar el probe.');
    } finally {
      setBusy(false);
    }
  }

  async function discover() {
    await run({ discover: true });
  }

  async function tryAttempt() {
    const isWrite = WRITE.has(method.toUpperCase());
    let parsedBody: unknown;
    if (isWrite) {
      try {
        parsedBody = bodyText.trim() ? JSON.parse(bodyText) : undefined;
      } catch {
        setError('El cuerpo JSON no es válido.');
        return;
      }
    }
    let token: string | undefined;
    if (isWrite) {
      if (!password) {
        setError('Ingresa tu contraseña para intentos de escritura.');
        return;
      }
      const t = await getToken();
      if (!t) return;
      token = t;
    }
    await run({ attempts: [{ method, pathTemplate: path, body: parsedBody }] }, token);
  }

  return (
    <Card className="card-pad mt-8 border-border-2">
      <div className="eyebrow">Solo administradores</div>
      <h2 className="mt-1 text-lg font-bold">Descubrir endpoint de escritura Belimo</h2>
      <p className="mt-1 text-sm text-ink-2">
        Prueba contra <b>únicamente</b> la válvula dummy{dummySerial ? ` (${dummySerial})` : ''}. La opción de descubrimiento es de solo lectura (GET/OPTIONS); los intentos de escritura requieren tu contraseña.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={discover} disabled={busy}>Descubrir (solo lectura)</Button>
      </div>

      <div className="mt-5 grid gap-2 md:grid-cols-[110px_1fr]">
        <label className="text-xs font-semibold text-ink-2 md:pt-2">Método / Ruta</label>
        <div className="flex flex-wrap gap-2">
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-sm border border-border-2 bg-surface px-2 py-2 text-sm">
            {['GET', 'OPTIONS', 'POST', 'PUT', 'PATCH'].map((m) => <option key={m}>{m}</option>)}
          </select>
          <input value={path} onChange={(e) => setPath(e.target.value)} className="min-w-[260px] flex-1 rounded-sm border border-border-2 bg-surface px-3 py-2 text-sm font-mono" placeholder="/devices/{id}/commands" />
        </div>

        <label className="text-xs font-semibold text-ink-2 md:pt-2">Cuerpo (JSON)</label>
        <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={4} className="rounded-sm border border-border-2 bg-surface px-3 py-2 font-mono text-xs" />

        <label className="text-xs font-semibold text-ink-2 md:pt-2">Contraseña</label>
        <div className="flex flex-wrap items-center gap-2">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Solo para escritura" className="rounded-sm border border-border-2 bg-surface px-3 py-2 text-sm" />
          <Button size="sm" variant="ghost" onClick={tryAttempt} disabled={busy}>Probar ruta</Button>
        </div>
      </div>

      <p className="mt-2 text-xs text-ink-3">Usa <code>{'{id}'}</code> como marcador del deviceId. Ej: <code>/devices/{'{id}'}/datapoints/evcloud.150</code></p>

      {error && <p className="mt-3 text-sm text-bad-ink">{error}</p>}

      {results.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Método</th><th>Ruta</th><th className="r">Status</th><th>Allow</th><th>Respuesta</th></tr></thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td className="font-bold">{r.method}</td>
                  <td className="font-mono text-xs">{r.path}</td>
                  <td className="r num">{r.error ? '—' : r.status}</td>
                  <td className="font-mono text-xs">{r.allow ?? ''}</td>
                  <td className="max-w-[360px] truncate font-mono text-xs" title={r.error ?? r.body}>{r.error ?? r.body}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
