import { ClientShell } from "@/components/shell/client-shell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ClientShell>{children}</ClientShell>;
}
