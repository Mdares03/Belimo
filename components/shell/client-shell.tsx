import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Topbar } from "./topbar";

export async function ClientShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const firstLocal = session?.user?.clientId
    ? await prisma.local.findFirst({ where: { clientId: session.user.clientId }, include: { building: true } })
    : null;

  const role = firstLocal ? `${firstLocal.code} · ${firstLocal.building.name}` : "Cliente";

  return <div className="min-h-screen bg-bg text-ink"><Topbar name={session?.user.name ?? "Invest Port"} role={role} /><main className="mx-auto max-w-[1080px] px-4 py-6 md:px-9 md:py-9">{children}</main></div>;
}
