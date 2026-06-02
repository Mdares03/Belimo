import Link from "next/link";
import { BarChart3, Building2, Gauge, LinkIcon, Shield, Users } from "lucide-react";
import { auth } from "@/auth";
import { Topbar } from "./topbar";

const nav = [
  {
    group: "Operación",
    items: [
      { href: "/admin/estado", label: "Estado de la flota", icon: Gauge, tag: "9" },
      { href: "/admin/valvulas", label: "Válvulas", icon: Gauge, tag: "19" },
      { href: "/admin/uso", label: "Uso por edificio", icon: BarChart3 },
      { href: "/admin/edificios", label: "Edificios", icon: Building2 },
      { href: "/admin/clientes", label: "Clientes", icon: Users },
    ],
  },
  {
    group: "Configuración",
    items: [
      { href: "/admin/config/usuarios", label: "Usuarios", icon: Users },
      { href: "/admin/config/roles", label: "Roles", icon: Shield },
      { href: "/admin/config/api-belimo", label: "API Belimo", icon: LinkIcon },
    ],
  },
];

export async function AdminShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return <div className="min-h-screen bg-bg text-ink"><Topbar name={session?.user.name ?? "Admin"} role={session?.user.role ?? "Administrador"} />
    <div className="mobile-tabs sticky top-[61px] z-20 hidden gap-1.5 overflow-x-auto border-b border-border bg-bg px-4 py-2.5">{nav.flatMap((g) => g.items).map((item) => <Link className="whitespace-nowrap rounded-full border border-border-2 bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink-2" key={item.href} href={item.href}>{item.label}</Link>)}</div>
    <div className="flex items-start"><aside className="admin-sidebar sticky top-[61px] h-[calc(100vh-61px)] w-[236px] shrink-0 border-r border-border px-4 py-5">{nav.map((group) => <div key={group.group}><div className="mb-2 mt-4 px-3 text-[11px] font-bold uppercase tracking-[.12em] text-ink-3">{group.group}</div>{group.items.map((item) => <Link key={item.href} href={item.href} className="mb-0.5 flex items-center gap-3 rounded-[13px] px-3 py-2.5 text-[14.5px] font-semibold text-ink-2 transition hover:bg-surface-2 hover:text-ink"><item.icon size={20} />{item.label}{item.tag && <span className="ml-auto rounded-full bg-bad-soft px-2 py-0.5 text-[11px] font-bold text-bad-ink">{item.tag}</span>}</Link>)}</div>)}</aside><main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-9"><div className="rise mx-auto max-w-[1080px]">{children}</div></main></div>
  </div>;
}
