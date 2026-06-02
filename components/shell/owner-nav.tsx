"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Building2, FileText, Layers, Power, Receipt, Settings, Users, Wallet } from "lucide-react";

const ICONS = { wallet: Wallet, layers: Layers, building: Building2, file: FileText, users: Users, settings: Settings, power: Power } as const;
type NavGroup = { group: string; items: { href: string; label: string; icon: keyof typeof ICONS }[] };

export function OwnerNav({
  nav, buildings, defaultBuildingId,
}: {
  nav: NavGroup[];
  buildings: { id: string; name: string }[];
  defaultBuildingId: string | null;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const active = params.get("building") ?? defaultBuildingId ?? "";
  const withBuilding = (href: string) => (active ? `${href}?building=${active}` : href);

  return (
    <>
      {nav.map((group) => (
        <div key={group.group}>
          <div className="mb-2 mt-4 px-3 text-[11px] font-bold uppercase tracking-[.12em] text-ink-3">{group.group}</div>
          {group.items.map((item) => {
            const Icon = ICONS[item.icon];
            const on = pathname === item.href;
            return (
              <Link key={item.href} href={withBuilding(item.href)}
                className={`mb-0.5 flex items-center gap-3 rounded-[13px] px-3 py-2.5 text-[14.5px] font-semibold transition ${on ? "bg-accent-soft text-accent-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}>
                <Icon size={20} />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
      <div className="mt-8 rounded-md border border-border bg-surface-2 p-3">
        <div className="text-[11px] font-bold uppercase tracking-[.1em] text-ink-3">Mis edificios</div>
        <div className="mt-2 flex flex-col gap-1">
          {buildings.map((b) => {
            const on = b.id === active;
            return (
              <Link key={b.id} href={`${pathname}?building=${b.id}`}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold transition ${on ? "bg-accent-soft text-accent-ink" : "text-ink-2 hover:bg-surface-2"}`}>
                <Receipt size={14} />
                {b.name}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
