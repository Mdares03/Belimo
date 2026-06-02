"use client";

import { useActionState } from "react";
import { loginAction } from "@/lib/actions";
import { Button, Input } from "@/components/ui/primitives";

export function LoginForm() {
  const [error, action, pending] = useActionState(loginAction, undefined);
  return <form action={action} className="mt-7 space-y-4">
    <div><label className="text-sm font-bold text-ink-2">Correo</label><Input className="mt-1.5" name="email" type="email" defaultValue="ddares@maliountech.com" required /></div>
    <div><label className="text-sm font-bold text-ink-2">Contraseña</label><Input className="mt-1.5" name="password" type="password" defaultValue="Evac2026!" required /></div>
    {error && <p className="rounded-sm bg-bad-soft px-3 py-2 text-sm font-semibold text-bad-ink">{error}</p>}
    <Button className="w-full" disabled={pending}>{pending ? "Entrando..." : "Entrar"}</Button>
  </form>;
}
