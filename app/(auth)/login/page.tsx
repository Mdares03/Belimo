import { LoginForm } from "./login-form";

export default function LoginPage() {
  return <main className="grid min-h-screen place-items-center bg-bg px-4 py-10 text-ink">
    <section className="w-full max-w-[430px] rounded-lg border border-border bg-surface p-8 shadow-raised">
      <div className="flex items-center gap-3 text-[22px] font-extrabold tracking-tight"><span className="grid h-9 w-9 -rotate-3 place-items-center rounded-[10px_13px_10px_13px] bg-gradient-to-br from-accent to-[#558DA4] text-white shadow-card">e</span>EVAC <small className="-ml-2 text-xs font-semibold uppercase tracking-[.14em] text-ink-3">cloud</small></div>
      <h1 className="mt-8 text-[27px] font-extrabold tracking-tight">Iniciar sesión</h1>
      <p className="mt-2 text-ink-2">Accede a consumo, cobranza y configuración según tu rol.</p>
      <LoginForm />
      <div className="mt-5 rounded-sm bg-surface-2 p-3 text-xs text-ink-2">
        <b>Usuarios seed:</b><br />
        Admin: ddares@maliountech.com<br />
        Dueño edificio: espaciocancun@gmail.com<br />
        Cliente: contacto@investport.mx<br />
        Contraseña: Evac2026!
      </div>
    </section>
  </main>;
}
