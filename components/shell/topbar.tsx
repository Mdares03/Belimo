import { LogOut } from "lucide-react";
import { logoutAction } from "@/lib/actions";
import { Avatar } from "@/components/ui/primitives";

export function Topbar({ name, role }: { name: string; role: string }) {
  return <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-border bg-bg/85 px-4 py-3.5 backdrop-blur md:px-8">
    <div className="flex items-center gap-3 text-[19px] font-extrabold tracking-tight"><span className="grid h-[30px] w-[30px] -rotate-3 place-items-center rounded-[9px_11px_9px_11px] bg-gradient-to-br from-accent to-[#558DA4] text-[15px] text-white shadow-card">e</span>EVAC <small className="-ml-2 text-[11px] font-semibold uppercase tracking-[.14em] text-ink-3">cloud</small></div>
    <form action={logoutAction} className="ml-auto flex items-center gap-3">
      <div className="hidden text-right text-[13px] leading-tight sm:block"><b>{name}</b><br /><span className="text-[11.5px] text-ink-3">{role}</span></div>
      <Avatar name={name} />
      <button className="rounded-xs bg-surface-3 p-2 text-ink-2 transition hover:bg-border-2" aria-label="Cerrar sesión"><LogOut size={16} /></button>
    </form>
  </header>;
}
