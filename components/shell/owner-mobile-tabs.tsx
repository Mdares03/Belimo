"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export function OwnerMobileTabs({
  items,
  defaultBuildingId,
}: {
  items: { href: string; label: string }[];
  defaultBuildingId: string | null;
}) {
  const params = useSearchParams();
  const active = params.get("building") ?? defaultBuildingId ?? "";

  return (
    <div className="mobile-tabs sticky top-[61px] z-20 hidden gap-1.5 overflow-x-auto border-b border-border bg-bg px-4 py-2.5">
      {items.map((item) => (
        <Link
          className="whitespace-nowrap rounded-full border border-border-2 bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink-2"
          key={item.href}
          href={active ? `${item.href}?building=${active}` : item.href}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
