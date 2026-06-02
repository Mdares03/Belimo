import { Suspense } from "react";
import { auth } from "@/auth";
import { getOwnerContext } from "@/lib/scoped-data";
import { OwnerNav } from "./owner-nav";
import { OwnerMobileTabs } from "./owner-mobile-tabs";
import { Topbar } from "./topbar";

const nav = [
  {
    group: "Mi edificio",
    items: [
      { href: "/owner/resumen", label: "Resumen", icon: "wallet" as const },
      { href: "/owner/valvulas", label: "Válvulas por piso", icon: "layers" as const },
      { href: "/owner/cobranza", label: "Consumo y cobro", icon: "building" as const },
      { href: "/owner/recibos", label: "Recibos", icon: "file" as const },
      { href: "/owner/inquilinos", label: "Inquilinos", icon: "users" as const },
    ],
  },
];

export async function OwnerShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user;
  const ctx = await getOwnerContext();
  const count = ctx.buildings.length;

  return (
    <div className="min-h-screen bg-bg text-ink">
      <Topbar name={user?.name ?? "Dueño"} role={`${count} ${count === 1 ? "edificio" : "edificios"} · Dueño`} />
      <Suspense fallback={null}>
        <OwnerMobileTabs items={nav.flatMap((g) => g.items).map((i) => ({ href: i.href, label: i.label }))} defaultBuildingId={ctx.activeBuildingId} />
      </Suspense>
      <div className="flex items-start">
        <aside className="admin-sidebar sticky top-[61px] h-[calc(100vh-61px)] w-[236px] shrink-0 border-r border-border px-4 py-5">
          <Suspense fallback={null}>
            <OwnerNav nav={nav} buildings={ctx.buildings} defaultBuildingId={ctx.activeBuildingId} />
          </Suspense>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-9">
          <div className="rise mx-auto max-w-[1080px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
